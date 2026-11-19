import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { useAuth } from './auth';
import { supabase } from './supabase';
import type { Item } from './types';

type ItemsState = {
  items: Item[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  /** Optimistically patches an item, writes it, and records a history entry. */
  updateItem: (id: string, patch: Partial<Item>, summary: string) => Promise<boolean>;
};

const ItemsContext = createContext<ItemsState>({
  items: [],
  loading: true,
  error: null,
  refresh: async () => {},
  updateItem: async () => false,
});

type RawItem = Omit<Item, 'has_files'> & {
  item_messages: { messages: { files: { id: string }[] } | null }[] | null;
};

const SELECT =
  'id,type,title,details,status,priority,due_at,due_all_day,due_text,tags,needs_review,confidence,' +
  'dismissed,pinned,user_note,chat_id,source_message_id,completed_at,created_at,updated_at,' +
  'item_messages(messages(files(id)))';

export function ItemsProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const { data, error: err } = await supabase
      .from('items')
      .select(SELECT)
      .eq('dismissed', false)
      .order('created_at', { ascending: false })
      .limit(1000)
      .overrideTypes<RawItem[], { merge: false }>();
    if (err) {
      setError(err.message);
    } else {
      setError(null);
      setItems(
        (data ?? []).map(({ item_messages, ...rest }) => ({
          ...rest,
          has_files: (item_messages ?? []).some((im) => (im.messages?.files.length ?? 0) > 0),
        })),
      );
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (!session) {
      setItems([]);
      setLoading(true);
      return;
    }
    refresh();
    // A burst of bot writes should cause one refetch, not one per row.
    const schedule = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(refresh, 400);
    };
    const channel = supabase
      .channel('items-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, schedule)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, schedule)
      .subscribe();
    return () => {
      if (timer.current) clearTimeout(timer.current);
      supabase.removeChannel(channel);
    };
  }, [session, refresh]);

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
      const { error: err } = await supabase.from('items').update(columns).eq('id', id);
      if (err) {
        setItems(before);
        setError(err.message);
        return false;
      }
      await supabase.from('item_events').insert({ item_id: id, actor: 'user', summary, changes: columns });
      return true;
    },
    [items],
  );

  return (
    <ItemsContext.Provider value={{ items, loading, error, refresh, updateItem }}>
      {children}
    </ItemsContext.Provider>
  );
}

export const useItems = () => useContext(ItemsContext);
