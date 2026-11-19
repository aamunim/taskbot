export type ItemType = 'task' | 'note';
export type Status = 'todo' | 'doing' | 'done';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';

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
  created_at: string;
};

export type Message = {
  id: string;
  chat_id: number;
  tg_message_id: number;
  sender_name: string | null;
  sent_at: string;
  edited_at: string | null;
  kind: string;
  text: string | null;
  transcript: string | null;
  files: FileRow[];
};

export type ItemEvent = {
  id: string;
  item_id: string;
  actor: 'ai' | 'user';
  summary: string;
  created_at: string;
};

export type AppConfig = {
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

export type SearchResult = {
  kind: 'task' | 'note' | 'message' | 'file';
  item_id: string | null;
  message_id: string | null;
  title: string | null;
  snippet: string | null;
  at: string;
};
