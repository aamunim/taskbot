import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
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
  saveConfig: async () => false,
  role: () => 'other',
});

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

  const updateItem = useCallback(
    async (id: string, patch: Partial<Item>, summary: string) => {
      const { has_files: _ignored, ...columns } = patch;
      const before = items;
      setItems((list) =>
        list.flatMap((it) => {
          if (it.id !== id) return [it];
          return patch.dismissed ? [] : [{ ...it, ...patch }];
        }),
      );
      const err = await api.updateItemRow(id, columns, summary);
      if (err) {
        setItems(before);
        setError(err);
        return false;
      }
      return true;
    },
    [items],
  );

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
    () => ({ items, config, loading, error, version, refresh, updateItem, saveConfig, role }),
    [items, config, loading, error, version, refresh, updateItem, saveConfig, role],
  );
  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => useContext(DataContext);
