import type { AppConfig, Item, ItemEvent, LibFile, LibLink, Message, SearchResult, Sender } from './types';

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
  created_at: ago(createdHoursAgo),
  updated_at: ago(createdHoursAgo),
  has_files: false,
  ...s,
});

let items: Item[] = [
  item({ id: 't1', type: 'task', by: BOSS, title: 'ক্লায়েন্ট প্রেজেন্টেশনের স্লাইড চূড়ান্ত করা', details: 'Q3 বিক্রির চার্ট যোগ করতে হবে, শেষ স্লাইডে মূল্য তালিকা। ব্র্যান্ডের রং ব্যবহার করবে।', priority: 'urgent', due_at: ago(5), due_text: 'আজ দুপুরের মধ্যে', tags: ['client', 'acme'], has_files: true }, 28),
  item({ id: 't2', type: 'task', by: BOSS, title: 'মাসিক বিক্রয় রিপোর্ট পাঠানো', details: 'অক্টোবরের রিপোর্ট Excel ফরম্যাটে, অঞ্চলভিত্তিক ভাগ সহ।', priority: 'high', due_at: ahead(3), due_text: 'আজ সন্ধ্যা ৬টার মধ্যে', tags: ['report'], status: 'doing', has_files: true }, 20),
  item({ id: 't3', type: 'task', by: BOSS, title: 'ভেন্ডরের সাথে ডেলিভারির তারিখ নিশ্চিত করা', due_at: endOfDay(0), due_all_day: true, due_text: 'আজকের মধ্যে', tags: ['vendor'] }, 9),
  item({ id: 't4', type: 'task', by: ME, title: 'অফিসের ইন্টারনেট বিল জমা দেওয়া', due_at: endOfDay(0), due_all_day: true, tags: ['office'], status: 'done' }, 30),
  item({ id: 't5', type: 'task', by: BOSS, title: 'নতুন ইন্টার্নদের জন্য অনবোর্ডিং ডকুমেন্ট তৈরি', details: 'প্রথম সপ্তাহের সময়সূচি, টুলের তালিকা এবং যোগাযোগের নম্বর থাকবে।', due_at: endOfDay(2), due_all_day: true, due_text: 'বৃহস্পতিবারের মধ্যে', tags: ['hr'], has_files: true }, 40),
  item({ id: 't6', type: 'task', by: ME, title: 'ব্যানার ডিজাইনের সংশোধিত কপি স্যারকে পাঠাব', due_at: ahead(26), tags: ['design'], priority: 'high' }, 6),
  item({ id: 't7', type: 'task', by: BOSS, title: 'সোমবারের মিটিংয়ের এজেন্ডা সবাইকে পাঠানো', due_at: endOfDay(4), due_all_day: true, tags: ['meeting'] }, 12),
  item({ id: 't8', type: 'task', by: BOSS, title: 'ওয়েবসাইটের যোগাযোগ পাতার ফোন নম্বর আপডেট', priority: 'low', tags: ['website'] }, 70),
  item({ id: 't9', type: 'task', by: BOSS, title: 'চালান #২০৪৫ ক্লায়েন্টকে ইমেইল করা', status: 'done', tags: ['client', 'invoice'] }, 52),
  item({ id: 't10', type: 'task', by: ME, title: 'প্রিন্টারের টোনার অর্ডার করা', status: 'doing', tags: ['office'] }, 50),
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
  file('d2', BOSS, 28, { kind: 'document', file_name: 'Acme_Proposal_v3.pdf', mime_type: 'application/pdf', size_bytes: 1_840_000, storage_path: 'demo/proposal.pdf', item_id: 't1' }),
  file('d3', BOSS, 40, { kind: 'document', file_name: 'Onboarding_Checklist.docx', mime_type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', size_bytes: 54_000, storage_path: 'demo/onboarding.docx', item_id: 't5' }),
  file('d4', ME, 33, { kind: 'document', file_name: 'Report_Template.pptx', mime_type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', size_bytes: 3_200_000, storage_path: 'demo/template.pptx', item_id: 'n6' }),
  file('d5', BOSS, 96, { kind: 'video', file_name: 'product-demo.mp4', mime_type: 'video/mp4', size_bytes: 48_000_000, status: 'too_large' }),
  file('v1', BOSS, 9, { kind: 'voice', mime_type: 'audio/ogg', size_bytes: 61_000, duration_seconds: 38, storage_path: 'demo/v1.ogg', item_id: 't3', transcript: 'ভেন্ডরকে ফোন করে ডেলিভারির তারিখটা আজকের মধ্যেই নিশ্চিত করে নিও, দেরি হলে আমাকে জানাবে।' }),
  file('v2', BOSS, 26, { kind: 'voice', mime_type: 'audio/ogg', size_bytes: 122_000, duration_seconds: 74, storage_path: 'demo/v2.ogg', item_id: 'n2', transcript: 'Acme-তে এখন থেকে তানভীর সাহেবের সাথে কথা বলবে, আগের জন আর এই প্রজেক্টে নেই।' }),
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
  item_id: null,
  ...extra,
});

let links: LibLink[] = [
  link('l1', BOSS, 4, 'https://docs.google.com/spreadsheets/d/1AbCdEfGh/edit#gid=0', 'বাজেট শিটটা এখানে, আজ আপডেট করে দিও', { starred: true, item_id: 'n3' }),
  link('l2', BOSS, 27, 'https://www.figma.com/file/Xy12/Acme-Deck', 'প্রেজেন্টেশনের ডিজাইন ফাইল', { item_id: 't1' }),
  link('l3', ME, 6, 'https://drive.google.com/file/d/9ZyXwV/view', 'স্যার, ব্যানারের সংশোধিত কপি এখানে আপলোড করেছি', { item_id: 't6' }),
  link('l4', BOSS, 50, 'https://acme.example/brand-guidelines', 'ব্র্যান্ড গাইডলাইন, রং এখান থেকে নেবে', { starred: true }),
  link('l5', OTHER, 76, 'https://meet.google.com/abc-defg-hij', 'সোমবারের মিটিংয়ের লিংক'),
  link('l6', ME, 34, 'https://docs.google.com/document/d/7QwErTy/edit', 'রিপোর্টের খসড়া', { item_id: 'n6' }),
  link('l7', BOSS, 130, 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'এই ভিডিওটার মতো করে প্রোডাক্ট ডেমো বানাতে হবে'),
];

const delay = <T,>(value: T) => new Promise<T>((r) => setTimeout(() => r(value), 30));

export const demoApi = {
  fetchItems: () => delay(items.filter((i) => !i.dismissed)),
  fetchItem: (id: string) => delay(items.find((i) => i.id === id) ?? null),
  updateItem: (id: string, patch: Partial<Item>) => {
    items = items.map((i) => (i.id === id ? { ...i, ...patch, updated_at: new Date().toISOString() } : i));
    return delay(true);
  },
  fetchItemExtras: (id: string) => {
    const it = items.find((i) => i.id === id);
    const mine = files.filter((f) => f.item_id === id);
    const myLinks = links.filter((l) => l.item_id === id);
    const voice = mine.find((f) => f.kind === 'voice');
    const messages: Message[] = it
      ? [
          {
            id: `m-${id}`,
            chat_id: -1001234567890,
            tg_message_id: 4812,
            sender_tg_id: it.source_sender_tg_id,
            sender_name: it.source_sender_name,
            sent_at: it.created_at,
            edited_at: null,
            kind: voice ? 'voice' : 'text',
            text: voice ? null : [it.title, it.details?.replace(/।$/, ''), it.due_text].filter(Boolean).join('। '),
            transcript: voice?.transcript ?? null,
            files: mine,
            links: myLinks,
          },
        ]
      : [];
    const events: ItemEvent[] = it
      ? [
          ...(it.status !== 'todo' ? [{ id: `e2-${id}`, item_id: id, actor: 'user' as const, summary: `You changed: Status`, created_at: ago(3) }] : []),
          ...(it.due_text ? [{ id: `e1-${id}`, item_id: id, actor: 'ai' as const, summary: 'বসের নতুন মেসেজ অনুযায়ী ডেডলাইন আপডেট হয়েছে', created_at: ago(5) }] : []),
          { id: `e0-${id}`, item_id: id, actor: 'ai' as const, summary: 'মেসেজ থেকে তৈরি হয়েছে', created_at: it.created_at },
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
