import { DEMO, demoApi, demoSignedUrl } from './demo';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from './supabase';
import type { AppConfig, FileRow, Item, ItemEvent, LibFile, LibLink, LinkRow, Message, SearchResult, Sender, Subtask, TimelineMessage, TranscriptWord } from './types';

// Every read and write the screens need. Demo mode answers from sample data.

type Result<T> = { data: T; error: string | null };

const ITEM_COLUMNS =
  'id,type,title,details,status,priority,due_at,due_all_day,due_text,tags,needs_review,confidence,' +
  'dismissed,pinned,user_note,chat_id,source_message_id,source_sender_tg_id,source_sender_name,' +
  'completed_at,waiting_since,remind_at,created_at,updated_at';
const FILE_COLUMNS = 'id,message_id,kind,file_name,mime_type,size_bytes,duration_seconds,storage_path,status,starred,created_at';
const LINK_COLUMNS = 'id,message_id,url,domain,starred,created_at,title,description,image_url,favicon_url,meta_status';
const SUBTASK_COLUMNS = 'id,item_id,title,done,position,created_at';
const MESSAGE_COLUMNS =
  'id,chat_id,tg_message_id,sender_tg_id,sender_name,sent_at,edited_at,kind,text,transcript,transcript_words,forwarded_by_tg_id,forwarded_by_name';
const CONFIG_COLUMNS =
  'owner_tg_id,boss_tg_id,boss_name,timezone,morning_time,remind_before_minutes,digest_enabled,' +
  'notify_new_items,notify_boss_done,notify_boss_waiting,boss_done_message,boss_waiting_message,clarify_enabled,followup_mode,followup_days,followup_message,' +
  'weekly_report_enabled,weekly_report_day,weekly_report_time,last_webhook_at,last_processed_at,last_error,last_error_at';

type Derived = 'has_files' | 'steps_total' | 'steps_done';
type RawItem = Omit<Item, Derived> & {
  item_messages: { messages: { files: { id: string }[] } | null }[] | null;
  subtasks: { done: boolean }[] | null;
};

export async function fetchItems(): Promise<Result<Item[]>> {
  if (DEMO) return { data: await demoApi.fetchItems(), error: null };
  const { data, error } = await supabase
    .from('items')
    .select(`${ITEM_COLUMNS},item_messages(messages(files(id))),subtasks(done)`)
    .eq('dismissed', false)
    .order('created_at', { ascending: false })
    .limit(1000)
    .overrideTypes<RawItem[], { merge: false }>();
  return {
    data: (data ?? []).map(({ item_messages, subtasks, ...rest }) => ({
      ...rest,
      has_files: (item_messages ?? []).some((im) => (im.messages?.files.length ?? 0) > 0),
      steps_total: (subtasks ?? []).length,
      steps_done: (subtasks ?? []).filter((x) => x.done).length,
    })),
    error: error?.message ?? null,
  };
}

/** One item, including dismissed ones (which the shared list leaves out). */
export async function fetchItem(id: string): Promise<Item | null> {
  if (DEMO) return demoApi.fetchItem(id);
  const { data } = await supabase.from('items').select(ITEM_COLUMNS).eq('id', id).maybeSingle().overrideTypes<Omit<Item, Derived>, { merge: false }>();
  return data ? { ...data, has_files: false, steps_total: 0, steps_done: 0 } : null;
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
      .select(`messages(${MESSAGE_COLUMNS},files(${FILE_COLUMNS}),links(${LINK_COLUMNS}))`)
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
    transcript_words: TranscriptWord[] | null;
    forwarded_by_tg_id: number | null;
    forwarded_by_name: string | null;
    item_messages: { item_id: string }[];
  } | null;
};
const ORIGIN = 'messages(sender_tg_id,sender_name,sent_at,text,transcript,transcript_words,forwarded_by_tg_id,forwarded_by_name,item_messages(item_id))';
const flatten = <T extends { created_at: string }>({ messages, ...row }: T & RawOrigin) => ({
  ...row,
  sender_tg_id: messages?.sender_tg_id ?? null,
  sender_name: messages?.sender_name ?? null,
  sent_at: messages?.sent_at ?? row.created_at,
  text: messages?.text ?? null,
  transcript: messages?.transcript ?? null,
  transcript_words: messages?.transcript_words ?? null,
  forwarded_by_tg_id: messages?.forwarded_by_tg_id ?? null,
  forwarded_by_name: messages?.forwarded_by_name ?? null,
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

// ------------------------------------------------------------------ checklist

export async function fetchSubtasks(itemId: string): Promise<Result<Subtask[]>> {
  if (DEMO) return { data: await demoApi.fetchSubtasks(itemId), error: null };
  const { data, error } = await supabase.from('subtasks').select(SUBTASK_COLUMNS).eq('item_id', itemId).order('position').order('created_at');
  return { data: (data ?? []) as Subtask[], error: error?.message ?? null };
}

export async function addSubtask(itemId: string, title: string, position: number): Promise<Result<Subtask | null>> {
  if (DEMO) return { data: await demoApi.addSubtask(itemId, title, position), error: null };
  const { data, error } = await supabase.from('subtasks').insert({ item_id: itemId, title, position }).select(SUBTASK_COLUMNS).single();
  return { data: (data as Subtask | null) ?? null, error: error?.message ?? null };
}

export async function updateSubtask(id: string, patch: Partial<Pick<Subtask, 'title' | 'done' | 'position'>>): Promise<string | null> {
  if (DEMO) {
    await demoApi.updateSubtask(id, patch);
    return null;
  }
  const { error } = await supabase.from('subtasks').update(patch).eq('id', id);
  return error?.message ?? null;
}

export async function deleteSubtask(id: string): Promise<string | null> {
  if (DEMO) {
    await demoApi.deleteSubtask(id);
    return null;
  }
  const { error } = await supabase.from('subtasks').delete().eq('id', id);
  return error?.message ?? null;
}

// ------------------------------------------------------------------ timeline

type RawTimeline = Omit<TimelineMessage, 'items'> & { item_messages: { items: { id: string; title: string; type: Item['type']; dismissed: boolean } | null }[] | null };

/** The latest messages of the group, newest first, with the items made from each. */
export async function fetchTimeline(limit = 300): Promise<Result<TimelineMessage[]>> {
  if (DEMO) return { data: await demoApi.fetchTimeline(), error: null };
  const { data, error } = await supabase
    .from('messages')
    .select(`${MESSAGE_COLUMNS},files(${FILE_COLUMNS}),item_messages(items(id,title,type,dismissed))`)
    .neq('kind', 'service')
    .order('sent_at', { ascending: false })
    .limit(limit)
    .overrideTypes<RawTimeline[], { merge: false }>();
  return {
    data: (data ?? []).map(({ item_messages, ...m }) => ({
      ...m,
      items: (item_messages ?? []).flatMap((im) => (im.items && !im.items.dismissed ? [{ id: im.items.id, title: im.items.title, type: im.items.type }] : [])),
    })),
    error: error?.message ?? null,
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

export async function signedUrl(path: string, seconds = 3600): Promise<string | null> {
  if (DEMO) return demoSignedUrl(path);
  const { data } = await supabase.storage.from('files').createSignedUrl(path, seconds);
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
    .on('postgres_changes', { event: '*', schema: 'public', table: 'subtasks' }, onChange)
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}

// ---------------------------------------------------------------- telling the boss

/** Queues a message to the boss about this task; it goes out after a short undo window. */
export async function queueBossNotice(itemId: string, kind: 'done' | 'waiting'): Promise<boolean> {
  if (DEMO) return true;
  await supabase.from('boss_notices').delete().eq('item_id', itemId).eq('status', 'pending');
  const { error } = await supabase.from('boss_notices').insert({ item_id: itemId, kind });
  return !error;
}

/** Withdraws a queued message that has not been sent yet. */
export async function cancelBossNotice(itemId: string): Promise<void> {
  if (DEMO) return;
  await supabase.from('boss_notices').delete().eq('item_id', itemId).eq('status', 'pending');
}

/** Asks the bot to send whatever is due now (the bot also checks by itself every minute). */
export async function sendBossNotices(): Promise<void> {
  if (DEMO) return;
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return;
  await fetch(`${SUPABASE_URL}/functions/v1/notify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}` },
    body: '{}',
  }).catch(() => {});
}

// ---------------------------------------------------------------- the boss's page

export type ShareLink = {
  id: string;
  token: string;
  created_at: string;
  expires_at: string | null;
  last_opened_at: string | null;
  open_count: number;
};

const SHARE_COLUMNS = 'id,token,created_at,expires_at,last_opened_at,open_count';

/** The link currently in force, if any (not revoked, not expired). */
export async function fetchShareLink(): Promise<ShareLink | null> {
  if (DEMO) return demoApi.shareLink();
  const { data } = await supabase.from('share_links').select(SHARE_COLUMNS).is('revoked_at', null)
    .order('created_at', { ascending: false }).limit(1).overrideTypes<ShareLink[], { merge: false }>();
  const link = data?.[0] ?? null;
  return link && (!link.expires_at || new Date(link.expires_at).getTime() > Date.now()) ? link : null;
}

export async function revokeShareLinks(): Promise<void> {
  if (DEMO) return demoApi.revokeShareLink();
  await supabase.from('share_links').update({ revoked_at: new Date().toISOString() }).is('revoked_at', null);
}

/** Replaces any earlier link with a fresh one; older links stop working at once. */
export async function createShareLink(days: number | null): Promise<ShareLink | null> {
  if (DEMO) return demoApi.createShareLink(days);
  await revokeShareLinks();
  const expires_at = days ? new Date(Date.now() + days * 86400_000).toISOString() : null;
  const { data } = await supabase.from('share_links').insert({ expires_at }).select(SHARE_COLUMNS).single().overrideTypes<ShareLink, { merge: false }>();
  return data ?? null;
}

export type SharedFile = {
  id: string;
  kind: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  sent_at: string;
  caption: string | null;
  transcript: string | null;
  url: string | null;
};
export type SharedLink = {
  id: string;
  url: string;
  domain: string | null;
  title: string | null;
  description: string | null;
  image_url: string | null;
  favicon_url: string | null;
  sent_at: string;
  said: string | null;
};
export type SharedLibrary = { boss_name: string | null; files: SharedFile[]; links: SharedLink[] };

/** What a share link shows. `invalid` covers a wrong, revoked or expired link alike. */
export async function fetchShared(token: string): Promise<{ data: SharedLibrary | null; error: 'invalid' | 'failed' | null }> {
  if (DEMO) return { data: await demoApi.shared(), error: null };
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      body: JSON.stringify({ token }),
    });
    if (res.status === 404) return { data: null, error: 'invalid' };
    if (!res.ok) return { data: null, error: 'failed' };
    return { data: (await res.json()) as SharedLibrary, error: null };
  } catch {
    return { data: null, error: 'failed' };
  }
}
