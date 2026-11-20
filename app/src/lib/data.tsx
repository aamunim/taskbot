import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { showUndoToast } from '@/components/UndoToast';
import * as api from './api';
import { useAuth } from './auth';
import { roleOf } from './roles';
import type { AppConfig, Item, Role } from './types';

type DataState = {
  items: Item[];
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  /** Bumps whenever the server reports new data, so other screens can refetch. */
  version: number;
  refresh: () => Promise<void>;
  /** Optimistically patches an item, writes it, and records a history entry. */
  updateItem: (id: string, patch: Partial<Item>, summary: string) => Promise<boolean>;
  /** Patches an item in memory only (e.g. checklist counts after a step changes). */
  patchLocal: (id: string, patch: Partial<Item>) => void;
  saveConfig: (patch: Partial<AppConfig>) => Promise<boolean>;
  role: (senderId: number | null | undefined) => Role;
};

const DataContext = createContext<DataState>({
  items: [],
  config: null,
  loading: true,
  error: null,
  version: 0,
  refresh: async () => {},
  updateItem: async () => false,
  patchLocal: () => {},
  saveConfig: async () => false,
  role: () => 'other',
});

/** The database queues a notice 8 seconds out; the toast expires just after so the send finds it due. */
const BOSS_NOTICE_SECONDS = 9;

export function DataProvider({ children }: { children: ReactNode }) {
  const { signedIn } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const [list, cfg] = await Promise.all([api.fetchItems(), api.fetchConfig()]);
    setError(list.error ?? cfg.error);
    if (!list.error) setItems(list.data);
    if (cfg.data) setConfig(cfg.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!signedIn) {
      setItems([]);
      setConfig(null);
      setLoading(true);
      return;
    }
    refresh();
    // A burst of bot writes should cause one refetch, not one per row.
    const unsubscribe = api.subscribe(() => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        refresh();
        setVersion((v) => v + 1);
      }, 400);
    });
    return () => {
      if (timer.current) clearTimeout(timer.current);
      unsubscribe();
    };
  }, [signedIn, refresh]);

  // Latest updateItem, so the toast's Undo can call it without a stale closure.
  const updateRef = useRef<DataState['updateItem']>(async () => false);

  /**
   * After the owner marks a boss's task done (or sent), queue a message to the boss
   * in the group. It leaves after a short window in which it can be undone.
   */
  const tellBoss = useCallback(
    (was: Item, status: Item['status']) => {
      const kind = status === 'done' ? 'done' : status === 'waiting' ? 'waiting' : null;
      const enabled = kind === 'done' ? config?.notify_boss_done : kind === 'waiting' ? config?.notify_boss_waiting : false;
      const fromBoss = was.type === 'task' && was.source_sender_tg_id != null && was.source_sender_tg_id !== config?.owner_tg_id;
      if (!kind || !enabled || !fromBoss) {
        // Any other change withdraws a message that has not gone out yet.
        void api.cancelBossNotice(was.id);
        return;
      }
      void api.queueBossNotice(was.id, kind).then((queued) => {
        if (!queued) return;
        showUndoToast({
          text: kind === 'done' ? 'Telling your boss it is done' : 'Telling your boss it was sent',
          seconds: BOSS_NOTICE_SECONDS,
          onUndo: () => void updateRef.current(was.id, { status: was.status }, 'Undid the status change'),
          onExpire: () => void api.sendBossNotices(),
        });
      });
    },
    [config],
  );

  const updateItem = useCallback(
    async (id: string, patch: Partial<Item>, summary: string) => {
      const { has_files: _f, steps_total: _t, steps_done: _d, ...columns } = patch;
      const before = items;
      setItems((list) =>
        list.flatMap((it) => {
          if (it.id !== id) return [it];
          // Mirror the database trigger so the list reads right before the refetch.
          const waiting = patch.status === undefined ? {} : { waiting_since: patch.status === 'waiting' ? (it.waiting_since ?? new Date().toISOString()) : null, completed_at: patch.status === 'done' ? (it.completed_at ?? new Date().toISOString()) : null };
          return patch.dismissed ? [] : [{ ...it, ...waiting, ...patch }];
        }),
      );
      const err = await api.updateItemRow(id, columns, summary);
      if (err) {
        setItems(before);
        setError(err);
        return false;
      }
      const was = before.find((it) => it.id === id);
      if (was && patch.status !== undefined && patch.status !== was.status) tellBoss(was, patch.status);
      return true;
    },
    [items, tellBoss],
  );

  updateRef.current = updateItem;

  const patchLocal = useCallback((id: string, patch: Partial<Item>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const saveConfig = useCallback(
    async (patch: Partial<AppConfig>) => {
      if (!config) return false;
      const before = config;
      setConfig({ ...config, ...patch });
      const err = await api.saveConfig(patch);
      if (err) {
        setConfig(before);
        setError(err);
        return false;
      }
      setError(null);
      return true;
    },
    [config],
  );

  const role = useCallback((senderId: number | null | undefined) => roleOf(senderId, config), [config]);

  const value = useMemo(
    () => ({ items, config, loading, error, version, refresh, updateItem, patchLocal, saveConfig, role }),
    [items, config, loading, error, version, refresh, updateItem, patchLocal, saveConfig, role],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
