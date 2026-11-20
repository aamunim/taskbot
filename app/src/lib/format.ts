import type { FileRow, Item, Priority, Status } from './types';

// All times are shown in Asia/Dhaka, which is a fixed UTC+6 with no DST, so we
// shift manually instead of depending on the device's Intl/time-zone support.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const shifted = (iso: string | Date) => new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS);

/** Whole days since epoch in Dhaka time; equal numbers mean the same calendar day. */
export const dayNumber = (iso: string | Date) => Math.floor(shifted(iso).getTime() / DAY_MS);
export const todayNumber = () => dayNumber(new Date());

export function fmtTime(iso: string | Date): string {
  const d = shifted(iso);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function fmtDate(iso: string | Date): string {
  const diff = dayNumber(iso) - todayNumber();
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = shifted(iso);
  const sameYear = d.getUTCFullYear() === shifted(new Date()).getUTCFullYear();
  const base = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
  if (diff > 1 && diff < 7) return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)}, ${base}`;
  return sameYear ? base : `${base} ${d.getUTCFullYear()}`;
}

export const fmtDateTime = (iso: string | Date) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

/** "Thursday, 19 November" for the hero. */
export function fmtLongDate(iso: string | Date): string {
  const d = shifted(iso);
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()];
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} ${month}`;
}

export function greeting(now: Date = new Date()): string {
  const h = shifted(now).getUTCHours();
  return h < 5 ? 'Good night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

/** Heading for grouping by calendar day. */
export function dayHeading(iso: string): string {
  const diff = dayNumber(iso) - todayNumber();
  if (diff === 0) return 'Today';
  if (diff === -1) return 'Yesterday';
  if (diff < -1 && diff > -7) return 'Earlier this week';
  const d = shifted(iso);
  return `${['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function dueLabel(item: Pick<Item, 'due_at' | 'due_all_day'>): string | null {
  if (!item.due_at) return null;
  return item.due_all_day ? fmtDate(item.due_at) : fmtDateTime(item.due_at);
}

export function isOverdue(item: Pick<Item, 'due_at' | 'due_all_day' | 'status'>): boolean {
  // Done is done, and a task waiting on the boss is no longer the owner's to be late with.
  if (!item.due_at || item.status === 'done' || item.status === 'waiting') return false;
  if (item.due_all_day) return dayNumber(item.due_at) < todayNumber();
  return new Date(item.due_at).getTime() < Date.now();
}

/**
 * The native picker works in the device's zone. These two convert between a real
 * instant and a Date whose *local* fields equal the Dhaka wall-clock fields, so
 * what the user picks is always Dhaka time even if the phone is set elsewhere.
 */
export function toPickerDate(iso: string | null): Date {
  const d = shifted(iso ?? new Date());
  return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes());
}
export function fromPickerDate(d: Date): string {
  const utc = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes());
  return new Date(utc - DHAKA_OFFSET_MS).toISOString();
}

export const STATUS_LABEL: Record<Status, string> = { todo: 'To do', doing: 'In progress', waiting: 'Waiting on boss', done: 'Done' };
/** Short forms for the four-way segmented control. */
export const STATUS_SHORT: Record<Status, string> = { todo: 'To do', doing: 'Doing', waiting: 'Waiting', done: 'Done' };
export const STATUSES: Status[] = ['todo', 'doing', 'waiting', 'done'];

/** "waiting 3 days", "waiting since this morning". */
export function waitingLabel(since: string | null): string {
  if (!since) return 'waiting';
  const days = todayNumber() - dayNumber(since);
  if (days <= 0) return 'waiting since today';
  return `waiting ${days} ${days === 1 ? 'day' : 'days'}`;
}

export const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const WEEKDAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Year, month (0-11), day and weekday (0 = Sunday) of a Dhaka day number. */
export function dayParts(day: number): { year: number; month: number; date: number; weekday: number } {
  const d = new Date(day * DAY_MS);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth(), date: d.getUTCDate(), weekday: d.getUTCDay() };
}
/** Dhaka day number of a calendar date. */
export const dayOf = (year: number, month: number, date: number) => Math.floor(Date.UTC(year, month, date) / DAY_MS);

/** "Friday, 20 November" for a day number. */
export function fmtDayLong(day: number): string {
  const p = dayParts(day);
  return `${WEEKDAYS[p.weekday]}, ${p.date} ${MONTH_NAMES[p.month]}`;
}
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', normal: 'Normal', high: 'High', urgent: 'Urgent' };
export const PRIORITY_RANK: Record<Priority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export type FileGroup = 'photo' | 'voice' | 'document';
export function fileGroup(f: Pick<FileRow, 'kind' | 'mime_type'>): FileGroup {
  if (f.kind === 'photo' || f.mime_type?.startsWith('image/')) return 'photo';
  if (f.kind === 'voice' || f.kind === 'audio' || f.kind === 'video_note' || f.mime_type?.startsWith('audio/')) return 'voice';
  return 'document';
}

export function fileTitle(f: Pick<FileRow, 'kind' | 'file_name' | 'mime_type'>): string {
  if (f.file_name) return f.file_name;
  const names: Record<string, string> = {
    photo: 'Photo',
    voice: 'Voice message',
    audio: 'Audio',
    video: 'Video',
    video_note: 'Video message',
    animation: 'Animation',
    document: 'Document',
  };
  return names[f.kind] ?? 'File';
}

/** Upper-case extension for the document badge, e.g. "PDF". */
export function fileExt(f: Pick<FileRow, 'file_name' | 'mime_type' | 'kind'>): string {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(f.file_name ?? '');
  if (m) return m[1].toUpperCase();
  if (f.kind === 'video' || f.kind === 'animation') return 'VIDEO';
  return (f.mime_type?.split('/')[1] ?? 'FILE').slice(0, 5).toUpperCase();
}

export function fmtSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export function fileStatusText(f: Pick<FileRow, 'status'>): string | null {
  if (f.status === 'too_large') return 'Over 20 MB, so not saved. Open it in Telegram.';
  if (f.status === 'failed') return 'Could not be saved';
  if (f.status === 'pending') return 'Saving…';
  return null;
}

/** "example.com" and "/path?x" halves of a URL for display. */
export function splitUrl(url: string, domain: string | null): { host: string; rest: string } {
  const m = /^https?:\/\/(?:www\.)?([^/?#]+)(.*)$/i.exec(url);
  return { host: domain ?? m?.[1] ?? url, rest: m?.[2] && m[2] !== '/' ? m[2] : '' };
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Deep link to the original group message; only possible for supergroups (-100…). */
export function telegramLink(chatId: number | null, tgMessageId: number): string | null {
  const s = String(chatId ?? '');
  if (!s.startsWith('-100')) return null;
  return `https://t.me/c/${s.slice(4)}/${tgMessageId}`;
}
