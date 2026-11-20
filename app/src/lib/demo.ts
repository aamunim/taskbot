import type { AppConfig, Item, ItemEvent, LibFile, LibLink, Message, SearchResult, Sender, Subtask, TimelineMessage, TranscriptWord } from './types';

/**
 * Demo mode: sample data and no network, for design review and screenshots.
 * It is compiled in only as data; it switches on solely when the build sets
 * EXPO_PUBLIC_DEMO to exactly "1", which the real build never does.
 */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1';

const BOSS = 1001;
const ME = 1002;
const OTHER = 1003;
const BOSS_NAME = 'মাহমুদ স্যার';
const ME_NAME = 'রাফি';
const OTHER_NAME = 'সুমাইয়া';

const HOUR = 3600_000;
const ago = (hours: number) => new Date(Date.now() - hours * HOUR).toISOString();
const ahead = (hours: number) => new Date(Date.now() + hours * HOUR).toISOString();
/** 23:59 Dhaka time, `days` from today: how all-day deadlines are stored. */
const endOfDay = (days: number) => {
  const dhaka = new Date(Date.now() + 6 * HOUR);
  const utc = Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() + days, 23, 59) - 6 * HOUR;
  return new Date(utc).toISOString();
};

/** A moment today (Dhaka time) that is already in the past, so the sample overdue task is always "today". */
const earlierToday = () => {
  const dhaka = new Date(Date.now() + 6 * HOUR);
  const startOfToday = Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate()) - 6 * HOUR;
  return new Date(Math.min(Date.now() - 10 * 60_000, Math.max(startOfToday + 60_000, Date.now() - 5 * HOUR))).toISOString();
};
/** `hour`:00 Dhaka time, `days` from today. */
const dayAt = (days: number, hour: number) => {
  const dhaka = new Date(Date.now() + 6 * HOUR);
  return new Date(Date.UTC(dhaka.getUTCFullYear(), dhaka.getUTCMonth(), dhaka.getUTCDate() + days, hour) - 6 * HOUR).toISOString();
};

/** Spreads the words of a transcript over `total` seconds with natural pauses at punctuation. */
function timed(text: string, total: number): TranscriptWord[] {
  const words = text.split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 2 + (/[,।.?]$/.test(w) ? 6 : 0));
  const sum = weights.reduce((a, b) => a + b, 0);
  let at = 0.4;
  const span = total - 0.8;
  return words.map((w, i) => {
    const len = (weights[i] / sum) * span;
    const pause = /[,।.?]$/.test(w) ? len * 0.45 : len * 0.12;
    const word = { w, s: Math.round(at * 100) / 100, e: Math.round((at + len - pause) * 100) / 100 };
    at += len;
    return word;
  });
}

const svg = (body: string, bg: string) =>
  `data:image/svg+xml;base64,${btoa(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="300" viewBox="0 0 300 300"><rect width="300" height="300" fill="${bg}"/>${body}</svg>`,
  )}`;
const lines = (color: string, ys: number[], x = 40, w = 220) =>
  ys.map((y, i) => `<rect x="${x}" y="${y}" width="${w - (i % 3) * 40}" height="10" rx="5" fill="${color}"/>`).join('');

const THUMBS: Record<string, string> = {
  'demo/whiteboard.jpg': svg(`<rect x="30" y="40" width="240" height="200" rx="8" fill="#fff"/>${lines('#4338CA', [70, 100, 130])}<circle cx="90" cy="190" r="26" fill="none" stroke="#E11D48" stroke-width="6"/><path d="M150 205 l30 -40 l25 25 l35 -45" fill="none" stroke="#14B8A6" stroke-width="6"/>`, '#CBD5E1'),
  'demo/receipt.jpg': svg(`<rect x="80" y="20" width="140" height="260" fill="#fff"/>${lines('#94A3B8', [50, 75, 100, 125, 150, 175], 95, 110)}<rect x="95" y="215" width="110" height="18" rx="4" fill="#16142B"/>`, '#F1E7D3'),
  'demo/banner.png': svg(`<rect x="0" y="0" width="300" height="300" fill="#4338CA"/><circle cx="230" cy="80" r="70" fill="#7B4BE8"/><rect x="30" y="170" width="170" height="22" rx="6" fill="#fff"/><rect x="30" y="205" width="110" height="14" rx="6" fill="#F59E0B"/>`, '#4338CA'),
  'demo/chart.png': svg(`<rect x="40" y="170" width="36" height="90" rx="4" fill="#14B8A6"/><rect x="96" y="120" width="36" height="140" rx="4" fill="#4338CA"/><rect x="152" y="80" width="36" height="180" rx="4" fill="#7B4BE8"/><rect x="208" y="140" width="36" height="120" rx="4" fill="#F59E0B"/>`, '#F8FAFC'),
  'demo/site.jpg': svg(`<rect x="0" y="180" width="300" height="120" fill="#64748B"/><rect x="50" y="90" width="90" height="130" fill="#E2E8F0"/><rect x="160" y="60" width="100" height="160" fill="#F8FAFC"/><circle cx="60" cy="50" r="24" fill="#FDE68A"/>`, '#93C5FD'),
  'demo/note.jpg': svg(`<rect x="30" y="30" width="240" height="240" fill="#FEF9C3" transform="rotate(-3 150 150)"/>${lines('#854D0E', [90, 120, 150, 180], 60, 180)}`, '#D6D3D1'),
};

/** A short silent WAV so the audio player has something to load. */
const SILENCE = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=';

export const demoSignedUrl = (path: string) => THUMBS[path] ?? (path.endsWith('.ogg') ? SILENCE : null);

const config: AppConfig = {
  owner_tg_id: ME,
  boss_tg_id: BOSS,
  boss_name: BOSS_NAME,
  timezone: 'Asia/Dhaka',
  morning_time: '09:00:00',
  remind_before_minutes: 120,
  digest_enabled: true,
  notify_new_items: true,
  notify_boss_done: true,
  notify_boss_waiting: false,
  boss_done_message: '✅ Done: {task}',
  boss_waiting_message: '📨 Sent for your review: {task}',
  clarify_enabled: true,
  read_silent_photos: false,
  followup_mode: 'ask',
  followup_days: 2,
  followup_message: '⏳ A gentle reminder about this: {task}',
  weekly_report_enabled: true,
  weekly_report_day: 4,
  weekly_report_time: '17:00:00',
  last_webhook_at: ago(0.2),
  last_processed_at: ago(0.19),
  last_error: null,
  last_error_at: null,
};

const senders: Sender[] = [
  { tg_id: BOSS, name: BOSS_NAME, message_count: 214, last_seen: ago(0.2) },
  { tg_id: ME, name: ME_NAME, message_count: 131, last_seen: ago(1) },
  { tg_id: OTHER, name: OTHER_NAME, message_count: 18, last_seen: ago(30) },
];

type Seed = Partial<Item> & Pick<Item, 'id' | 'type' | 'title'> & { by: number };
const nameOf = (id: number) => (id === BOSS ? BOSS_NAME : id === ME ? ME_NAME : OTHER_NAME);
const item = (s: Seed, createdHoursAgo: number): Item => ({
  details: null,
  status: 'todo',
  priority: 'normal',
  due_at: null,
  due_all_day: false,
  due_text: null,
  tags: [],
  needs_review: false,
  confidence: 0.92,
  dismissed: false,
  pinned: false,
  user_note: null,
  chat_id: -1001234567890,
  source_message_id: `m-${s.id}`,
  source_sender_tg_id: s.by,
  source_sender_name: nameOf(s.by),
  completed_at: s.status === 'done' ? ago(3) : null,
  waiting_since: s.status === 'waiting' ? ago(52) : null,
  remind_at: null,
  created_at: ago(createdHoursAgo),
  updated_at: ago(createdHoursAgo),
  has_files: false,
  steps_total: 0,
  steps_done: 0,
  ...s,
});

/** A finished task from an earlier day, for the weekly chart and the streak. */
const past = (id: string, by: number, title: string, daysAgo: number, tags: string[], late = false): Item =>
  item({ id, type: 'task', by, title, tags, status: 'done', due_at: endOfDay(-daysAgo), due_all_day: true, completed_at: dayAt(late ? -daysAgo + 1 : -daysAgo, 15), created_at: dayAt(-daysAgo - 1, 11) }, 0);

let items: Item[] = [
  item({ id: 't1', type: 'task', by: BOSS, title: 'ক্লায়েন্ট প্রেজেন্টেশনের স্লাইড চূড়ান্ত করা', details: 'Q3 বিক্রির চার্ট যোগ করতে হবে, শেষ স্লাইডে মূল্য তালিকা। ব্র্যান্ডের রং ব্যবহার করবে।', priority: 'urgent', due_at: earlierToday(), due_text: 'আজ দুপুরের মধ্যে', tags: ['client', 'acme'], has_files: true }, 28),
  item({ id: 't2', type: 'task', by: BOSS, title: 'মাসিক বিক্রয় রিপোর্ট পাঠানো', details: 'অক্টোবরের রিপোর্ট Excel ফরম্যাটে, অঞ্চলভিত্তিক ভাগ সহ।', priority: 'high', due_at: ahead(3), due_text: 'আজ সন্ধ্যা ৬টার মধ্যে', tags: ['report'], status: 'doing', has_files: true }, 20),
  item({ id: 't3', type: 'task', by: BOSS, title: 'ভেন্ডরের সাথে ডেলিভারির তারিখ নিশ্চিত করা', due_at: endOfDay(0), due_all_day: true, due_text: 'আজকের মধ্যে', tags: ['vendor'] }, 9),
  item({ id: 't4', type: 'task', by: ME, title: 'অফিসের ইন্টারনেট বিল জমা দেওয়া', due_at: endOfDay(0), due_all_day: true, tags: ['office'], status: 'done' }, 30),
  item({ id: 't5', type: 'task', by: BOSS, title: 'নতুন ইন্টার্নদের জন্য অনবোর্ডিং ডকুমেন্ট তৈরি', details: 'প্রথম সপ্তাহের সময়সূচি, টুলের তালিকা এবং যোগাযোগের নম্বর থাকবে।', due_at: endOfDay(2), due_all_day: true, due_text: 'বৃহস্পতিবারের মধ্যে', tags: ['hr'], has_files: true }, 40),
  item({ id: 't6', type: 'task', by: ME, title: 'ব্যানার ডিজাইনের সংশোধিত কপি স্যারকে পাঠাব', due_at: ahead(26), tags: ['design'], priority: 'high' }, 6),
  item({ id: 't7', type: 'task', by: BOSS, title: 'সোমবারের মিটিংয়ের এজেন্ডা সবাইকে পাঠানো', remind_at: ahead(20), due_at: endOfDay(4), due_all_day: true, tags: ['meeting'] }, 12),
  item({ id: 't8', type: 'task', by: BOSS, title: 'ওয়েবসাইটের যোগাযোগ পাতার ফোন নম্বর আপডেট', priority: 'low', tags: ['website'] }, 70),
  item({ id: 't9', type: 'task', by: BOSS, title: 'চালান #২০৪৫ ক্লায়েন্টকে ইমেইল করা', status: 'done', tags: ['client', 'invoice'] }, 52),
  item({ id: 't10', type: 'task', by: ME, title: 'প্রিন্টারের টোনার অর্ডার করা', status: 'doing', tags: ['office'] }, 50),
  item({ id: 't11', type: 'task', by: BOSS, title: 'চুক্তিপত্রের স্ক্যান কপি আজ রাতের মধ্যে পাঠানো', details: 'স্যার ব্যক্তিগত চ্যাটে বলেছিলেন; স্বাক্ষরসহ সব পাতা লাগবে।', due_at: endOfDay(0), due_all_day: true, due_text: 'আজ রাতের মধ্যে', tags: ['acme', 'client'], priority: 'high' }, 1.5),
  item({ id: 'w1', type: 'task', by: BOSS, title: 'Acme প্রস্তাবের খসড়া স্যারের অনুমোদনের জন্য পাঠানো', status: 'waiting', due_at: endOfDay(-2), due_all_day: true, tags: ['acme', 'client'], waiting_since: ago(52) }, 96),
  item({ id: 'w2', type: 'task', by: ME, title: 'ছুটির আবেদন জমা দিয়েছি, অনুমোদনের অপেক্ষা', status: 'waiting', tags: ['hr'], waiting_since: ago(5) }, 30),
  past('h1', BOSS, 'সাপ্তাহিক বিক্রয় সারাংশ পাঠানো', 1, ['report']),
  past('h2', ME, 'কুরিয়ারের রসিদ স্ক্যান করা', 1, ['office']),
  past('h3', BOSS, 'ক্লায়েন্টের ফিডব্যাক তালিকা তৈরি', 2, ['client', 'acme']),
  past('h4', BOSS, 'ভেন্ডরের কোটেশন তুলনা করা', 3, ['vendor']),
  past('h5', BOSS, 'সোশ্যাল মিডিয়া পোস্টের খসড়া', 3, ['design']),
  past('h6', ME, 'মিটিং রুম বুক করা', 4, ['meeting']),
  past('h7', BOSS, 'ওয়েবসাইটের ব্যানার বদলানো', 5, ['website'], true),
  past('h8', BOSS, 'অক্টোবরের খরচের হিসাব মেলানো', 6, ['report', 'budget']),
  item({ id: 'r1', type: 'task', by: BOSS, title: 'ওটা কাল দেখে জানিও', details: 'কোন বিষয়ে তা পরিষ্কার নয়; আগের মেসেজে বাজেট শিটের কথা ছিল।', needs_review: true, confidence: 0.48, due_at: endOfDay(1), due_all_day: true, due_text: 'কাল' }, 2),
  item({ id: 'r2', type: 'note', by: OTHER, title: 'শুক্রবার অফিস অর্ধদিবস খোলা থাকতে পারে', needs_review: true, confidence: 0.61, tags: ['office'] }, 4),
  item({ id: 'n1', type: 'note', by: BOSS, title: 'ক্লায়েন্টকে পাঠানো সব ফাইল PDF হবে, Word নয়', details: 'ফাইলের নামে তারিখ থাকবে: প্রকল্প_তারিখ.pdf', pinned: true, tags: ['client', 'rule'] }, 90),
  item({ id: 'n2', type: 'note', by: BOSS, title: 'Acme-র নতুন যোগাযোগ ব্যক্তি: তানভীর আহমেদ', details: 'ইমেইল tanvir@acme.example, সকাল ১০টার পর ফোন করা ভালো।', tags: ['acme', 'contact'] }, 26),
  item({ id: 'n3', type: 'note', by: BOSS, title: 'এই মাসের বিজ্ঞাপন বাজেট ৮০ হাজার টাকা', details: 'ফেসবুকে ৫০, গুগলে ৩০। এর বেশি খরচের আগে অনুমতি নিতে হবে।', tags: ['budget'], pinned: true }, 60),
  item({ id: 'n4', type: 'note', by: ME, title: 'ভেন্ডর বলেছে নমুনা বুধবার পৌঁছাবে', tags: ['vendor'] }, 8),
  item({ id: 'n5', type: 'note', by: BOSS, title: 'সাপ্তাহিক মিটিং এখন থেকে সোমবার সকাল ১০টায়', tags: ['meeting', 'rule'] }, 120),
  item({ id: 'n6', type: 'note', by: ME, title: 'রিপোর্টের টেমপ্লেট শেয়ার্ড ড্রাইভের Reports ফোল্ডারে আছে', tags: ['report'] }, 33),
  item({ id: 'n7', type: 'note', by: BOSS, title: 'ডিসেম্বরের ১৬ তারিখ অফিস বন্ধ', tags: ['office'] }, 200),
];

const file = (id: string, by: number, hours: number, f: Partial<LibFile> & Pick<LibFile, 'kind'>): LibFile => ({
  id,
  message_id: `m-${id}`,
  file_name: null,
  mime_type: null,
  size_bytes: null,
  duration_seconds: null,
  storage_path: null,
  status: 'stored',
  starred: false,
  created_at: ago(hours),
  sender_tg_id: by,
  sender_name: nameOf(by),
  sent_at: ago(hours),
  text: null,
  transcript: null,
  transcript_words: null,
  forwarded_by_tg_id: null,
  forwarded_by_name: null,
  item_id: null,
  ...f,
});

let files: LibFile[] = [
  file('f1', BOSS, 3, { kind: 'photo', file_name: 'whiteboard.jpg', mime_type: 'image/jpeg', size_bytes: 840_000, storage_path: 'demo/whiteboard.jpg', item_id: 't1', starred: true }),
  file('f2', ME, 7, { kind: 'photo', file_name: 'receipt.jpg', mime_type: 'image/jpeg', size_bytes: 410_000, storage_path: 'demo/receipt.jpg', item_id: 't4' }),
  file('f3', ME, 6, { kind: 'photo', file_name: 'banner-v2.png', mime_type: 'image/png', size_bytes: 1_250_000, storage_path: 'demo/banner.png', item_id: 't6' }),
  file('f4', BOSS, 21, { kind: 'photo', file_name: 'sales-chart.png', mime_type: 'image/png', size_bytes: 230_000, storage_path: 'demo/chart.png', item_id: 't2' }),
  file('f5', BOSS, 49, { kind: 'photo', file_name: 'site-visit.jpg', mime_type: 'image/jpeg', size_bytes: 2_100_000, storage_path: 'demo/site.jpg' }),
  file('f6', OTHER, 75, { kind: 'photo', file_name: 'notice.jpg', mime_type: 'image/jpeg', size_bytes: 360_000, storage_path: 'demo/note.jpg' }),
  file('d1', BOSS, 20, { kind: 'document', file_name: 'অক্টোবর_বিক্রয়.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size_bytes: 96_000, storage_path: 'demo/sales.xlsx', item_id: 't2', starred: true }),
  file('d2', BOSS, 28, { kind: 'document', file_name: 'Acme_Corporation_Marketing_Proposal_2026_v3.pdf', mime_type: 'application/pdf', size_bytes: 1_840_000, storage_path: 'demo/proposal.pdf', item_id: 't1' }),
  file('d3', BOSS, 40, { kind: 'document', file_name: 'Onboarding_Checklist.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: 54_000, storage_path: 'demo/onboarding.docx', item_id: 't5' }),
  file('d4', ME, 33, { kind: 'document', file_name: 'Quarterly_Sales_Report_Template_Final_v2_reviewed.pptx', mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size_bytes: 3_200_000, storage_path: 'demo/template.pptx', item_id: 'n6' }),
  file('d5', BOSS, 96, { kind: 'video', file_name: 'product-demo.mp4', mime_type: 'video/mp4', size_bytes: 48_000_000, status: 'too_large' }),
  file('v1', BOSS, 9, { kind: 'voice', mime_type: 'audio/ogg', size_bytes: 61_000, duration_seconds: 38, storage_path: 'demo/v1.ogg', item_id: 't3', transcript: 'ভেন্ডরকে ফোন করে ডেলিভারির তারিখটা আজকের মধ্যেই নিশ্চিত করে নিও, দেরি হলে আমাকে জানাবে।', transcript_words: timed('ভেন্ডরকে ফোন করে ডেলিভারির তারিখটা আজকের মধ্যেই নিশ্চিত করে নিও, দেরি হলে আমাকে জানাবে।', 38) }),
  file('v2', BOSS, 26, { kind: 'voice', mime_type: 'audio/ogg', size_bytes: 122_000, duration_seconds: 74, storage_path: 'demo/v2.ogg', item_id: 'n2', transcript: 'Acme-তে এখন থেকে তানভীর সাহেবের সাথে কথা বলবে, আগের জন আর এই প্রজেক্টে নেই।', transcript_words: timed('Acme-তে এখন থেকে তানভীর সাহেবের সাথে কথা বলবে, আগের জন আর এই প্রজেক্টে নেই।', 74) }),
  file('v3', ME, 8, { kind: 'voice', mime_type: 'audio/ogg', size_bytes: 33_000, duration_seconds: 19, storage_path: 'demo/v3.ogg', item_id: 'n4', transcript: 'স্যার, ভেন্ডর জানিয়েছে নমুনা বুধবার পৌঁছাবে।' }),
];

const link = (id: string, by: number, hours: number, url: string, text: string, extra: Partial<LibLink> = {}): LibLink => ({
  id,
  message_id: `m-${id}`,
  url,
  domain: /^https?:\/\/(?:www\.)?([^/?#]+)/.exec(url)?.[1] ?? null,
  starred: false,
  created_at: ago(hours),
  sender_tg_id: by,
  sender_name: nameOf(by),
  sent_at: ago(hours),
  text,
  transcript: null,
  transcript_words: null,
  forwarded_by_tg_id: null,
  forwarded_by_name: null,
  item_id: null,
  title: null,
  description: null,
  image_url: null,
  favicon_url: null,
  meta_status: 'pending',
  ...extra,
});

const favicon = (bg: string, body: string) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/>${body}</svg>`)}`;
const FAV = {
  sheets: favicon('#188038', '<rect x="16" y="14" width="32" height="36" rx="3" fill="#fff"/><path d="M16 26h32M16 38h32M30 14v36" stroke="#188038" stroke-width="3"/>'),
  docs: favicon('#1A73E8', '<rect x="17" y="13" width="30" height="38" rx="3" fill="#fff"/><path d="M23 25h18M23 32h18M23 39h12" stroke="#1A73E8" stroke-width="3" stroke-linecap="round"/>'),
  figma: favicon('#1E1E1E', '<circle cx="26" cy="20" r="7" fill="#F24E1E"/><circle cx="38" cy="20" r="7" fill="#FF7262"/><circle cx="26" cy="32" r="7" fill="#A259FF"/><circle cx="38" cy="32" r="7" fill="#1ABCFE"/><circle cx="26" cy="44" r="7" fill="#0ACF83"/>'),
  acme: favicon('#0E7490', '<path d="M32 14 L48 48 H16 Z" fill="#fff"/>'),
  youtube: favicon('#FF0000', '<path d="M26 22 L44 32 L26 42 Z" fill="#fff"/>'),
};
const cover = (body: string, bg: string) => `data:image/svg+xml;base64,${btoa(`<svg xmlns="http://www.w3.org/2000/svg" width="600" height="315" viewBox="0 0 600 315"><rect width="600" height="315" fill="${bg}"/>${body}</svg>`)}`;

let links: LibLink[] = [
  link('l1', BOSS, 4, 'https://docs.google.com/spreadsheets/d/1AbCdEfGh/edit#gid=0', 'বাজেট শিটটা এখানে, আজ আপডেট করে দিও', { starred: true, item_id: 'n3', meta_status: 'done', title: 'Marketing budget Q4', favicon_url: FAV.sheets }),
  link('l2', BOSS, 27, 'https://www.figma.com/file/Xy12/Acme-Deck', 'প্রেজেন্টেশনের ডিজাইন ফাইল', { item_id: 't1', meta_status: 'done', title: 'Acme Deck – Figma', description: 'Client presentation, 14 frames', favicon_url: FAV.figma, image_url: cover('<rect x="40" y="40" width="240" height="150" rx="10" fill="#fff"/><rect x="320" y="40" width="240" height="150" rx="10" fill="#C7B8FF"/><rect x="40" y="215" width="330" height="20" rx="8" fill="#fff"/><rect x="40" y="250" width="200" height="14" rx="7" fill="#A259FF"/>', '#2C2C2C') }),
  link('l3', ME, 6, 'https://drive.google.com/file/d/9ZyXwV/view', 'স্যার, ব্যানারের সংশোধিত কপি এখানে আপলোড করেছি', { item_id: 't6' }),
  link('l4', BOSS, 50, 'https://acme.example/brand-guidelines', 'ব্র্যান্ড গাইডলাইন, রং এখান থেকে নেবে', { starred: true, item_id: 't1', meta_status: 'done', title: 'Brand guidelines | Acme', description: 'Logo usage, colour palette and typography for partners.', favicon_url: FAV.acme, image_url: cover('<circle cx="120" cy="157" r="70" fill="#0E7490"/><circle cx="270" cy="157" r="70" fill="#F59E0B"/><circle cx="420" cy="157" r="70" fill="#16142B"/>', '#E6F4F7') }),
  link('l5', OTHER, 76, 'https://meet.google.com/abc-defg-hij', 'সোমবারের মিটিংয়ের লিংক', { meta_status: 'failed' }),
  link('l6', ME, 34, 'https://docs.google.com/document/d/7QwErTy/edit', 'রিপোর্টের খসড়া', { item_id: 'n6', meta_status: 'done', title: 'October report draft', favicon_url: 'data:image/png;base64,AAAA' }),
  link('l7', BOSS, 130, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'এই ভিডিওটার মতো করে প্রোডাক্ট ডেমো বানাতে হবে', { meta_status: 'done', title: 'How to film a 60-second product demo', description: 'A short walkthrough of lighting, framing and pacing.', favicon_url: FAV.youtube, image_url: cover('<circle cx="300" cy="157" r="54" fill="#FF0000"/><path d="M284 130 L332 157 L284 184 Z" fill="#fff"/>', '#1F1F1F') }),
];

const step = (id: string, item_id: string, position: number, title: string, done = false): Subtask => ({ id, item_id, title, done, position, created_at: ago(20) });
let subtasks: Subtask[] = [
  step('s1', 't1', 0, 'Q3 বিক্রির চার্ট বসানো', true),
  step('s2', 't1', 1, 'ব্র্যান্ডের রং ঠিক করা', true),
  step('s3', 't1', 2, 'মূল্য তালিকার স্লাইড', true),
  step('s4', 't1', 3, 'বানান দেখে নেওয়া'),
  step('s5', 't1', 4, 'PDF করে স্যারকে পাঠানো'),
  step('s6', 't2', 0, 'অঞ্চলভিত্তিক ডেটা সংগ্রহ', true),
  step('s7', 't2', 1, 'Excel-এ সাজানো', true),
  step('s8', 't2', 2, 'স্যারকে ইমেইল করা'),
  step('s9', 't5', 0, 'প্রথম সপ্তাহের সময়সূচি', true),
  step('s10', 't5', 1, 'টুলের তালিকা'),
  step('s11', 't5', 2, 'যোগাযোগের নম্বর'),
  step('s12', 't5', 3, 'HR-কে দেখানো'),
];
const withSteps = (i: Item): Item => {
  const mine = subtasks.filter((x) => x.item_id === i.id);
  return { ...i, steps_total: mine.length, steps_done: mine.filter((x) => x.done).length };
};
/** The one sample message the owner forwarded into the group from a private chat. */
const FORWARDED = new Set(['t11']);

const delay = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 30));

function messageOf(it: Item): Message {
  const mine = files.filter((f) => f.item_id === it.id);
  const voice = mine.find((f) => f.kind === 'voice');
  return {
    id: `m-${it.id}`,
    chat_id: -1001234567890,
    tg_message_id: 4812,
    sender_tg_id: it.source_sender_tg_id,
    sender_name: it.source_sender_name,
    sent_at: it.created_at,
    edited_at: null,
    kind: voice ? 'voice' : 'text',
    text: voice ? null : [it.title, it.details?.replace(/।$/, ''), it.due_text].filter(Boolean).join('। '),
    transcript: voice?.transcript ?? null,
    transcript_words: voice?.transcript_words ?? null,
    forwarded_by_tg_id: FORWARDED.has(it.id) ? ME : null,
    forwarded_by_name: FORWARDED.has(it.id) ? ME_NAME : null,
    files: mine,
    links: links.filter((l) => l.item_id === it.id),
  };
}

const chat = (id: string, by: number, hours: number, text: string): TimelineMessage => ({
  id, chat_id: -1001234567890, tg_message_id: 4000, sender_tg_id: by, sender_name: nameOf(by), sent_at: ago(hours), edited_at: null, kind: 'text', text,
  transcript: null, transcript_words: null, forwarded_by_tg_id: null, forwarded_by_name: null, files: [], items: [],
});
const SMALL_TALK: TimelineMessage[] = [
  chat('c1', ME, 1.4, 'জি স্যার, আজ রাতেই পাঠিয়ে দিচ্ছি।'),
  chat('c2', ME, 8.8, 'ঠিক আছে স্যার, এখনই ফোন করছি।'),
  chat('c3', BOSS, 19.5, 'রিপোর্টটা দেখে ভালো লাগল, ধন্যবাদ।'),
  chat('c4', OTHER, 29, 'আমি কাল ছুটিতে থাকব, কিছু লাগলে রাফিকে বলবেন।'),
];

let demoShare: { id: string; token: string; created_at: string; expires_at: string | null; last_opened_at: string | null; open_count: number } | null = {
  id: 'share-1', token: 'd3m0'.repeat(16), created_at: ago(72), expires_at: null, last_opened_at: ago(5), open_count: 4,
};

export const demoApi = {
  shareLink: () => delay(demoShare),
  revokeShareLink: async () => {
    demoShare = null;
  },
  createShareLink: (days: number | null) => {
    demoShare = {
      id: `share-${Date.now()}`, token: 'n3wl1nk0'.repeat(8), created_at: new Date().toISOString(),
      expires_at: days ? new Date(Date.now() + days * 86400_000).toISOString() : null, last_opened_at: null, open_count: 0,
    };
    return delay(demoShare);
  },
  /** What the boss's page shows: the whole library, labelled by sender. */
  shared: () =>
    delay({
      boss_name: BOSS_NAME,
      files: files.map((f) => ({
        sender_name: f.sender_name, from: f.sender_tg_id === BOSS ? ('boss' as const) : f.sender_tg_id === ME ? ('owner' as const) : ('other' as const),
        id: f.id, kind: f.kind, file_name: f.file_name, mime_type: f.mime_type, size_bytes: f.size_bytes,
        duration_seconds: f.duration_seconds, sent_at: f.sent_at, caption: f.text, transcript: f.transcript,
        url: f.status === 'stored' && f.storage_path ? (demoSignedUrl(f.storage_path) ?? 'https://example.com/file') : null,
      })),
      links: links.map((l) => ({
        sender_name: l.sender_name, from: l.sender_tg_id === BOSS ? ('boss' as const) : l.sender_tg_id === ME ? ('owner' as const) : ('other' as const),
        id: l.id, url: l.url, domain: l.domain, title: l.title, description: l.description,
        image_url: l.image_url, favicon_url: l.favicon_url, sent_at: l.sent_at, said: l.text,
      })),
    }),
  fetchItems: () => delay(items.filter((i) => !i.dismissed).map(withSteps)),
  fetchItem: (id: string) => delay(items.find((i) => i.id === id) ?? null),
  fetchSubtasks: (itemId: string) => delay(subtasks.filter((x) => x.item_id === itemId).sort((a, b) => a.position - b.position)),
  addSubtask: (itemId: string, title: string, position: number) => {
    const row = step(`s-${Date.now()}`, itemId, position, title);
    subtasks = [...subtasks, row];
    return delay(row);
  },
  updateSubtask: (id: string, patch: Partial<Subtask>) => {
    subtasks = subtasks.map((x) => (x.id === id ? { ...x, ...patch } : x));
    return delay(true);
  },
  deleteSubtask: (id: string) => {
    subtasks = subtasks.filter((x) => x.id !== id);
    return delay(true);
  },
  fetchTimeline: () => {
    const fromItems: TimelineMessage[] = items
      .filter((i) => !i.dismissed)
      .map((i) => {
        const { links: _links, ...m } = messageOf(i);
        return { ...m, items: [{ id: i.id, title: i.title, type: i.type }] };
      });
    return delay([...fromItems, ...SMALL_TALK].sort((a, b) => b.sent_at.localeCompare(a.sent_at)));
  },
  updateItem: (id: string, patch: Partial<Item>) => {
    items = items.map((i) => {
      if (i.id !== id) return i;
      // What the database trigger does on the real backend.
      const auto = patch.status === undefined ? {} : { waiting_since: patch.status === 'waiting' ? (i.waiting_since ?? new Date().toISOString()) : null, completed_at: patch.status === 'done' ? (i.completed_at ?? new Date().toISOString()) : null };
      return { ...i, ...auto, ...patch, updated_at: new Date().toISOString() };
    });
    return delay(true);
  },
  fetchItemExtras: (id: string) => {
    const it = items.find((i) => i.id === id);
    const messages: Message[] = it ? [messageOf(it)] : [];
    // A little back-and-forth, so the conversation view has both sides to show.
    if (it && it.source_sender_tg_id === BOSS) {
      const say = (suffix: string, by: number, at: string, text: string): Message => ({
        id: `m-${id}-${suffix}`, chat_id: -1001234567890, tg_message_id: 4813, sender_tg_id: by, sender_name: nameOf(by), sent_at: at, edited_at: null, kind: 'text', text,
        transcript: null, transcript_words: null, forwarded_by_tg_id: null, forwarded_by_name: null, files: [], links: [],
      });
      const after = (hours: number) => new Date(new Date(it.created_at).getTime() + hours * 3600_000).toISOString();
      messages.push(say('r1', ME, after(0.4), 'জি স্যার, দেখছি।'));
      if (it.steps_total) messages.push(say('b2', BOSS, after(5), 'লোগোটা নতুনটা ব্যবহার করবে, পুরোনোটা না।'));
      if (it.status === 'waiting' || it.status === 'done') messages.push(say('r2', ME, it.status === 'done' ? ago(3.1) : ago(52.2), 'স্যার, পাঠিয়ে দিয়েছি। দেখে জানাবেন।'));
    }
    const events: ItemEvent[] = it
      ? [
          ...(it.status !== 'todo' ? [{ id: `e2-${id}`, item_id: id, actor: 'user' as const, summary: `You changed: Status`, created_at: ago(3) }] : []),
          ...(it.due_text ? [{ id: `e1-${id}`, item_id: id, actor: 'ai' as const, summary: 'Deadline updated from a new message', created_at: ago(5) }] : []),
          { id: `e0-${id}`, item_id: id, actor: 'ai' as const, summary: 'Created from a message', created_at: it.created_at },
        ]
      : [];
    return delay({ messages, events });
  },
  fetchLibrary: () => delay({ files, links }),
  setStar: (table: 'files' | 'links', id: string, starred: boolean) => {
    if (table === 'files') files = files.map((f) => (f.id === id ? { ...f, starred } : f));
    else links = links.map((l) => (l.id === id ? { ...l, starred } : l));
    return delay(true);
  },
  fetchConfig: () => delay(config),
  saveConfig: (patch: Partial<AppConfig>) => {
    Object.assign(config, patch);
    return delay(true);
  },
  listSenders: () => delay(senders),
  search: (q: string) => {
    const term = q.toLowerCase();
    const hit = (s: string | null | undefined) => !!s && s.toLowerCase().includes(term);
    const out: SearchResult[] = [
      ...items
        .filter((i) => hit(i.title) || hit(i.details) || i.tags.some(hit))
        .map((i) => ({ kind: i.type, item_id: i.id, message_id: i.source_message_id, title: i.title, snippet: i.details, at: i.created_at, sender_tg_id: i.source_sender_tg_id, sender_name: i.source_sender_name })),
      ...files
        .filter((f) => hit(f.file_name) || hit(f.transcript))
        .map((f) => ({ kind: (f.transcript ? 'message' : 'file') as SearchResult['kind'], item_id: f.item_id, message_id: f.message_id, title: f.file_name ?? f.sender_name, snippet: f.transcript, at: f.sent_at, sender_tg_id: f.sender_tg_id, sender_name: f.sender_name })),
      ...links
        .filter((l) => hit(l.text) || hit(l.url))
        .map((l) => ({ kind: 'message' as const, item_id: l.item_id, message_id: l.message_id, title: l.sender_name, snippet: `${l.text ?? ''} ${l.url}`, at: l.sent_at, sender_tg_id: l.sender_tg_id, sender_name: l.sender_name })),
    ];
    return delay(out);
  },
};
