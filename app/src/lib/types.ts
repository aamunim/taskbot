export type ItemType = 'task' | 'note';
export type Status = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';
export type Role = 'boss' | 'me' | 'other';
export type RoleFilter = 'all' | 'boss' | 'me';

export type Item = {
  id: string;
  type: ItemType;
  title: string;
  details: string | null;
  status: Status;
  priority: Priority;
  due_at: string | null;
  due_all_day: boolean;
  due_text: string | null;
  tags: string[];
  needs_review: boolean;
  confidence: number | null;
  dismissed: boolean;
  pinned: boolean;
  user_note: string | null;
  chat_id: number | null;
  source_message_id: string | null;
  source_sender_tg_id: number | null;
  source_sender_name: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  /** Derived client-side from the linked messages. */
  has_files: boolean;
};

export type FileRow = {
  id: string;
  message_id: string;
  kind: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
  storage_path: string | null;
  status: 'pending' | 'stored' | 'too_large' | 'failed';
  starred: boolean;
  created_at: string;
};

export type LinkRow = {
  id: string;
  message_id: string;
  url: string;
  domain: string | null;
  starred: boolean;
  created_at: string;
};

/** Where a library entry came from: who sent it, when, and the item made from it. */
export type Origin = {
  sender_tg_id: number | null;
  sender_name: string | null;
  sent_at: string;
  text: string | null;
  transcript: string | null;
  item_id: string | null;
};

export type LibFile = FileRow & Origin;
export type LibLink = LinkRow & Origin;

export type Message = {
  id: string;
  chat_id: number;
  tg_message_id: number;
  sender_tg_id: number | null;
  sender_name: string | null;
  sent_at: string;
  edited_at: string | null;
  kind: string;
  text: string | null;
  transcript: string | null;
  files: FileRow[];
  links: LinkRow[];
};

export type ItemEvent = {
  id: string;
  item_id: string;
  actor: 'ai' | 'user';
  summary: string;
  created_at: string;
};

export type AppConfig = {
  owner_tg_id: number | null;
  boss_tg_id: number | null;
  boss_name: string | null;
  timezone: string;
  morning_time: string;
  remind_before_minutes: number;
  digest_enabled: boolean;
  notify_new_items: boolean;
  last_webhook_at: string | null;
  last_processed_at: string | null;
  last_error: string | null;
  last_error_at: string | null;
};

export type Sender = { tg_id: number; name: string | null; message_count: number; last_seen: string };

export type SearchResult = {
  kind: 'task' | 'note' | 'message' | 'file';
  item_id: string | null;
  message_id: string | null;
  title: string | null;
  snippet: string | null;
  at: string;
  sender_tg_id: number | null;
  sender_name: string | null;
};
