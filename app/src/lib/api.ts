import { DEMO, demoApi, demoSignedUrl } from './demo';
import { supabase } from './supabase';
import type { AppConfig, FileRow, Item, ItemEvent, LibFile, LibLink, LinkRow, Message, SearchResult, Sender } from './types';

// Every read and write the screens need. Demo mode answers from sample data.

type Result<T> = { data: T; error: string | null };

const ITEM_COLUMNS =
  'id,type,title,details,status,priority,due_at,due_all_day,due_text,tags,needs_review,confidence,' +
  'dismissed,pinned,user_note,chat_id,source_message_id,source_sender_tg_id,source_sender_name,' +
  'completed_at,created_at,updated_at';
const FILE_COLUMNS = 'id,message_id,kind,file_name,mime_type,size_bytes,duration_seconds,storage_path,status,starred,created_at';
const LINK_COLUMNS = 'id,message_id,url,domain,starred,created_at';
const CONFIG_COLUMNS =
  'owner_tg_id,boss_tg_id,boss_name,timezone,morning_time,remind_before_minutes,digest_enabled,' +
  'notify_new_items,last_webhook_at,last_processed_at,last_error,last_error_at';

type RawItem = Omit<Item, 'has_files'> & {
  item_messages: { messages: { files: { id: string }[] } | null }[] | null;
};

export async function fetchItems(): Promise<Result<Item[]>> {
  if (DEMO) return { data: await demoApi.fetchItems(), error: null };
  const { data, error } = await supabase
    .from('items')
    .select(`${ITEM_COLUMNS},item_messages(messages(files(id)))`)
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(1000)
    .overrideTypes<RawItem[], { merge: false }>();
  return {
    data: (data ?? []).map(({ item_messages, ...rest }) => ({
      ...rest,
      has_files: (item_messages ?? []).some((im) => (im.messages?.files.length ?? 0) > 0),
    })),
    error: error?.message ?? null,
  };
}

/** One item, including dismissed ones (which the shared list leaves out). */
export async function fetchItem(id: string): Promise<Item | null> {
  if (DEMO) return demoApi.fetchItem(id);
  const { data } = await supabase.from('items').select(ITEM_COLUMNS).eq('id', id).maybeSingle().overrideTypes<Omit<Item, 'has_files'>, { merge: false }>();
  return data ? { ...data, has_files: false } : null;
}

/** Writes the change and records it in the item's history. */
export async function updateItemRow(id: string, columns: Partial<Item>, summary: string): Promise<string | null> {
  if (DEMO) {
    await demoApi.updateItem(id, columns);
    return null;
  }
  const { error } = await supabase.from('items').update(columns).eq('id', id);
  if (error) return error.message;
  await supabase.from('item_events').insert({ item_id: id, actor: 'user', summary, changes: columns });
  return null;
}

export async function fetchItemExtras(id: string): Promise<Result<{ messages: Message[]; events: ItemEvent[] }>> {
  if (DEMO) return { data: await demoApi.fetchItemExtras(id), error: null };
  const [m, e] = await Promise.all([
    supabase
      .from('item_messages')
      .select(`messages(id,chat_id,tg_message_id,sender_tg_id,sender_name,sent_at,edited_at,kind,text,transcript,files(${FILE_COLUMNS}),links(${LINK_COLUMNS}))`)
      .eq('item_id', id)
      .overrideTypes<{ messages: Message | null }[], { merge: false }>(),
    supabase.from('item_events').select('id,item_id,actor,summary,created_at').eq('item_id', id).order('created_at', { ascending: false }).limit(50),
  ]);
  return {
    data: {
      messages: (m.data ?? [])
        .map((r) => r.messages)
        .filter((x): x is Message => !!x)
        .sort((a, b) => a.sent_at.localeCompare(b.sent_at)),
      events: (e.data ?? []) as ItemEvent[],
    },
    error: m.error?.message ?? null,
  };
}

type RawOrigin = {
  messages: {
    sender_tg_id: number | null;
    sender_name: string | null;
    sent_at: string;
    text: string | null;
    transcript: string | null;
    item_messages: { item_id: string }[];
  } | null;
};
const ORIGIN = 'messages(sender_tg_id,sender_name,sent_at,text,transcript,item_messages(item_id))';
const flatten = <T extends { created_at: string }>({ messages, ...row }: T & RawOrigin) => ({
  ...row,
  sender_tg_id: messages?.sender_tg_id ?? null,
  sender_name: messages?.sender_name ?? null,
  sent_at: messages?.sent_at ?? row.created_at,
  text: messages?.text ?? null,
  transcript: messages?.transcript ?? null,
  item_id: messages?.item_messages[0]?.item_id ?? null,
});

export async function fetchLibrary(): Promise<Result<{ files: LibFile[]; links: LibLink[] }>> {
  if (DEMO) return { data: await demoApi.fetchLibrary(), error: null };
  const [f, l] = await Promise.all([
    supabase.from('files').select(`${FILE_COLUMNS},${ORIGIN}`).order('created_at', { ascending: false }).limit(400).overrideTypes<(FileRow & RawOrigin)[], { merge: false }>(),
    supabase.from('links').select(`${LINK_COLUMNS},${ORIGIN}`).order('created_at', { ascending: false }).limit(400).overrideTypes<(LinkRow & RawOrigin)[], { merge: false }>(),
  ]);
  return {
    data: { files: (f.data ?? []).map((r) => flatten(r) as LibFile), links: (l.data ?? []).map((r) => flatten(r) as LibLink) },
    error: f.error?.message ?? l.error?.message ?? null,
  };
}

export async function setStar(table: 'files' | 'links', id: string, starred: boolean): Promise<string | null> {
  if (DEMO) {
    await demoApi.setStar(table, id, starred);
    return null;
  }
  const { error } = await supabase.from(table).update({ starred }).eq('id', id);
  return error?.message ?? null;
}

export async function signedUrl(path: string): Promise<string | null> {
  if (DEMO) return demoSignedUrl(path);
  const { data } = await supabase.storage.from('files').createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export async function signedUrls(paths: string[]): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  if (!paths.length) return map;
  if (DEMO) {
    for (const p of paths) {
      const u = demoSignedUrl(p);
      if (u) map[p] = u;
    }
    return map;
  }
  const { data } = await supabase.storage.from('files').createSignedUrls(paths, 3600);
  for (const s of data ?? []) if (s.path && s.signedUrl) map[s.path] = s.signedUrl;
  return map;
}

export async function fetchConfig(): Promise<Result<AppConfig | null>> {
  if (DEMO) return { data: await demoApi.fetchConfig(), error: null };
  const { data, error } = await supabase.from('app_config').select(CONFIG_COLUMNS).eq('id', 1).maybeSingle().overrideTypes<AppConfig, { merge: false }>();
  return { data: data ?? null, error: error?.message ?? null };
}

export async function saveConfig(patch: Partial<AppConfig>): Promise<string | null> {
  if (DEMO) {
    await demoApi.saveConfig(patch);
    return null;
  }
  const { error } = await supabase.from('app_config').update(patch).eq('id', 1);
  return error?.message ?? null;
}

export async function listSenders(): Promise<Sender[]> {
  if (DEMO) return demoApi.listSenders();
  const { data } = await supabase.rpc('list_senders');
  return (data ?? []) as Sender[];
}

export async function search(q: string): Promise<Result<SearchResult[]>> {
  if (DEMO) return { data: await demoApi.search(q), error: null };
  const { data, error } = await supabase.rpc('search_all', { q });
  const rows = (data ?? []) as Omit<SearchResult, 'sender_tg_id' | 'sender_name'>[];
  // search_all does not say who sent each hit; look that up for the Boss / Me filter.
  const ids = [...new Set(rows.map((r) => r.message_id).filter((x): x is string => !!x))];
  const who = new Map<string, { sender_tg_id: number | null; sender_name: string | null }>();
  if (ids.length) {
    const { data: msgs } = await supabase.from('messages').select('id,sender_tg_id,sender_name').in('id', ids);
    for (const m of msgs ?? []) who.set(m.id as string, { sender_tg_id: m.sender_tg_id as number | null, sender_name: m.sender_name as string | null });
  }
  return {
    data: rows.map((r) => ({ ...r, sender_tg_id: who.get(r.message_id ?? '')?.sender_tg_id ?? null, sender_name: who.get(r.message_id ?? '')?.sender_name ?? null })),
    error: error?.message ?? null,
  };
}

/** Calls back (debounced by the caller) whenever the bot writes new data. */
export function subscribe(onChange: () => void): () => void {
  if (DEMO) return () => {};
  const channel = supabase
    .channel('taskbot-live')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'items' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'files' }, onChange)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'links' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
