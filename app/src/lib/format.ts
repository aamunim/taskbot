import type { FileRow, Item, Priority, Status } from './types';

// All times are shown in Asia/Dhaka, which is a fixed UTC+6 with no DST, so we
// shift manually instead of depending on the device's Intl/time-zone support.
const DHAKA_OFFSET_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const MONTHS = ['জানু', 'ফেব্রু', 'মার্চ', 'এপ্রিল', 'মে', 'জুন', 'জুলাই', 'আগস্ট', 'সেপ্টে', 'অক্টো', 'নভে', 'ডিসে'];
const WEEKDAYS = ['রবিবার', 'সোমবার', 'মঙ্গলবার', 'বুধবার', 'বৃহস্পতিবার', 'শুক্রবার', 'শনিবার'];

export const bn = (v: number | string) => String(v).replace(/\d/g, (d) => BN_DIGITS[Number(d)]);

const shifted = (iso: string | Date) => new Date(new Date(iso).getTime() + DHAKA_OFFSET_MS);

/** Whole days since epoch in Dhaka time; equal numbers mean the same calendar day. */
export const dayNumber = (iso: string | Date) => Math.floor(shifted(iso).getTime() / DAY_MS);
export const todayNumber = () => dayNumber(new Date());

export function fmtTime(iso: string | Date): string {
  const d = shifted(iso);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const period = h < 4 ? 'রাত' : h < 12 ? 'সকাল' : h < 16 ? 'দুপুর' : h < 18 ? 'বিকাল' : h < 20 ? 'সন্ধ্যা' : 'রাত';
  return `${period} ${bn(h % 12 === 0 ? 12 : h % 12)}:${bn(String(m).padStart(2, '0'))}`;
}

export function fmtDate(iso: string | Date): string {
  const diff = dayNumber(iso) - todayNumber();
  if (diff === 0) return 'আজ';
  if (diff === 1) return 'আগামীকাল';
  if (diff === -1) return 'গতকাল';
  const d = shifted(iso);
  const sameYear = d.getUTCFullYear() === shifted(new Date()).getUTCFullYear();
  const base = `${bn(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]}`;
  if (diff > 1 && diff < 7) return `${WEEKDAYS[d.getUTCDay()]}, ${base}`;
  return sameYear ? base : `${base} ${bn(d.getUTCFullYear())}`;
}

export const fmtDateTime = (iso: string | Date) => `${fmtDate(iso)}, ${fmtTime(iso)}`;

export function dueLabel(item: Pick<Item, 'due_at' | 'due_all_day'>): string | null {
  if (!item.due_at) return null;
  return item.due_all_day ? fmtDate(item.due_at) : fmtDateTime(item.due_at);
}

export function isOverdue(item: Pick<Item, 'due_at' | 'due_all_day' | 'status'>): boolean {
  if (!item.due_at || item.status === 'done') return false;
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

export const STATUS_LABEL: Record<Status, string> = { todo: 'বাকি', doing: 'চলছে', done: 'শেষ' };
export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'কম',
  normal: 'সাধারণ',
  high: 'জরুরি',
  urgent: 'অতি জরুরি',
};
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
    photo: 'ছবি',
    voice: 'ভয়েস মেসেজ',
    audio: 'অডিও',
    video: 'ভিডিও',
    video_note: 'ভিডিও বার্তা',
    animation: 'অ্যানিমেশন',
    document: 'ডকুমেন্ট',
  };
  return names[f.kind] ?? 'ফাইল';
}

export function fmtSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${bn(Math.max(1, Math.round(bytes / 1024)))} KB`;
  return `${bn((bytes / 1024 / 1024).toFixed(1))} MB`;
}

export function fmtDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${bn(Math.floor(s / 60))}:${bn(String(s % 60).padStart(2, '0'))}`;
}

export function fileStatusText(f: Pick<FileRow, 'status'>): string | null {
  if (f.status === 'too_large') return 'ফাইলটি ২০ MB-এর বেশি, তাই সেভ হয়নি। Telegram থেকে দেখুন।';
  if (f.status === 'failed') return 'ফাইল সেভ করা যায়নি';
  if (f.status === 'pending') return 'সেভ হচ্ছে…';
  return null;
}

/** Deep link to the original group message; only possible for supergroups (-100…). */
export function telegramLink(chatId: number | null, tgMessageId: number): string | null {
  const s = String(chatId ?? '');
  if (!s.startsWith('-100')) return null;
  return `https://t.me/c/${s.slice(4)}/${tgMessageId}`;
}
