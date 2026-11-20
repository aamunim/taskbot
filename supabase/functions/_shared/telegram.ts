import { env } from "./util.ts";

const API = "https://api.telegram.org";
/** Bots cannot download files larger than this through the Bot API. */
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024;

export async function tg<T = unknown>(method: string, params: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`${API}/bot${env("TELEGRAM_BOT_TOKEN")}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.ok) {
    throw new Error(`Telegram ${method} failed: ${body?.description ?? res.status}`);
  }
  return body.result as T;
}

export function sendMessage(chatId: number, html: string): Promise<unknown> {
  return tg("sendMessage", {
    chat_id: chatId,
    text: html,
    parse_mode: "HTML",
    link_preview_options: { is_disabled: true },
  });
}

export async function downloadFile(fileId: string): Promise<Uint8Array> {
  const file = await tg<{ file_path?: string }>("getFile", { file_id: fileId });
  if (!file.file_path) throw new Error("Telegram returned no file_path");
  const res = await fetch(`${API}/file/bot${env("TELEGRAM_BOT_TOKEN")}/${file.file_path}`);
  if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Link to a message inside a supergroup (basic groups have no message links). */
export function messageLink(chatId: number, tgMessageId: number): string | null {
  const s = String(chatId);
  return s.startsWith("-100") ? `https://t.me/c/${s.slice(4)}/${tgMessageId}` : null;
}

// Minimal shapes of the Telegram objects we read.
export interface TgUser { id: number; is_bot?: boolean; first_name?: string; last_name?: string; username?: string }
export interface TgChat { id: number; type: string; title?: string }
interface TgFileBase { file_id: string; file_unique_id: string; file_size?: number; mime_type?: string; file_name?: string; duration?: number }
export interface TgEntity { type: string; offset: number; length: number; url?: string }
export interface TgMessage {
  message_id: number;
  date: number;
  edit_date?: number;
  chat: TgChat;
  from?: TgUser;
  text?: string;
  caption?: string;
  entities?: TgEntity[];
  caption_entities?: TgEntity[];
  reply_to_message?: { message_id: number };
  forward_origin?: { type: string; sender_user?: TgUser; sender_user_name?: string; sender_chat?: TgChat; chat?: TgChat };
  migrate_from_chat_id?: number;
  voice?: TgFileBase;
  audio?: TgFileBase;
  video?: TgFileBase;
  video_note?: TgFileBase;
  animation?: TgFileBase;
  document?: TgFileBase;
  photo?: TgFileBase[];
  [key: string]: unknown;
}
export interface TgUpdate {
  update_id: number;
  message?: TgMessage;
  edited_message?: TgMessage;
  my_chat_member?: { chat: TgChat; from: TgUser; new_chat_member: { status: string } };
}

export function displayName(u?: TgUser): string {
  if (!u) return "Unknown";
  return [u.first_name, u.last_name].filter(Boolean).join(" ") || u.username || String(u.id);
}

export interface ExtractedFile {
  kind: string;
  tg_file_id: string;
  tg_file_unique_id: string;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  duration_seconds: number | null;
}

export function extractFiles(m: TgMessage): ExtractedFile[] {
  const out: ExtractedFile[] = [];
  const add = (kind: string, f: TgFileBase | undefined, fallbackMime: string | null, ext: string) => {
    if (!f) return;
    out.push({
      kind,
      tg_file_id: f.file_id,
      tg_file_unique_id: f.file_unique_id,
      file_name: f.file_name ?? `${kind}-${m.message_id}.${ext}`,
      mime_type: f.mime_type ?? fallbackMime,
      size_bytes: f.file_size ?? null,
      duration_seconds: f.duration ?? null,
    });
  };
  add("voice", m.voice, "audio/ogg", "ogg");
  add("audio", m.audio, "audio/mpeg", "mp3");
  add("video_note", m.video_note, "video/mp4", "mp4");
  // An animation also carries a duplicate `document`; keep only one of them.
  if (m.animation) add("animation", m.animation, "video/mp4", "mp4");
  else add("document", m.document, null, "bin");
  add("video", m.video, "video/mp4", "mp4");
  if (m.photo?.length) add("photo", m.photo[m.photo.length - 1], "image/jpeg", "jpg");
  return out;
}

export function messageKind(m: TgMessage, files: ExtractedFile[]): string {
  if (files.length) return files[0].kind;
  if (typeof m.text === "string") return "text";
  return "service";
}

export function domainOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "") || null;
  } catch {
    return null;
  }
}

/** Web links in a message: plain URLs and links hidden behind text. */
export function extractLinks(m: TgMessage): { url: string; domain: string | null }[] {
  const text = m.text ?? m.caption ?? "";
  const urls = new Set<string>();
  for (const e of m.entities ?? m.caption_entities ?? []) {
    // Telegram offsets are UTF-16 code units, the same unit JS strings use.
    if (e.type === "text_link" && e.url) urls.add(e.url);
    if (e.type === "url") {
      const raw = text.slice(e.offset, e.offset + e.length);
      urls.add(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    }
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"]+/g)) urls.add(match[0]);
  return [...urls].filter((u) => /^https?:\/\//i.test(u)).map((url) => ({ url, domain: domainOf(url) }));
}

/** Who originally wrote a forwarded message. `id` is null when their privacy settings hide it. */
export function forwardOrigin(m: TgMessage): { id: number | null; name: string } | null {
  const o = m.forward_origin;
  if (!o) return null;
  if (o.type === "user" && o.sender_user) return { id: o.sender_user.id, name: displayName(o.sender_user) };
  if (o.type === "hidden_user" && o.sender_user_name) return { id: null, name: o.sender_user_name };
  const chat = o.sender_chat ?? o.chat;
  return chat ? { id: null, name: chat.title ?? "Channel" } : null;
}
