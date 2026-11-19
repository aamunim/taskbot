# TaskBot

বস Telegram গ্রুপে স্বাভাবিকভাবে মেসেজ পাঠান; বট সেগুলো হুবহু সংরক্ষণ করে, AI দিয়ে কাজ, ডেডলাইন, নোট ও ফাইল আলাদা করে, আর অ্যাপে গুছিয়ে দেখায়।

```
Telegram গ্রুপ → webhook → Supabase Edge Function
                    ├─ মেসেজ ও ফাইল হুবহু সেভ (Postgres + Storage)
                    ├─ ভয়েস → ElevenLabs → টেক্সট
                    └─ Claude → কাজ / ডেডলাইন / নোট
                              ↓
                    Expo অ্যাপ + Telegram-এ ব্যক্তিগত রিমাইন্ডার
```

## ফোল্ডার

| পথ | কী আছে |
|---|---|
| `supabase/migrations/` | ডেটাবেস স্কিমা, নিরাপত্তা নিয়ম, cron |
| `supabase/functions/telegram-webhook/` | Telegram থেকে মেসেজ গ্রহণ ও সংরক্ষণ |
| `supabase/functions/process/` | অপেক্ষমাণ মেসেজ বিশ্লেষণ (প্রতি মিনিটে cron) |
| `supabase/functions/reminders/` | ডেডলাইন সতর্কবার্তা ও সকালের সারাংশ (প্রতি ৫ মিনিটে cron) |
| `supabase/functions/auth/` | Telegram বটের মাধ্যমে অ্যাপে লগইন |
| `supabase/functions/setup/` | একবারের সেটআপ: webhook ও cron সংযোগ |
| `app/` | Expo (React Native) অ্যাপ |

## চালু করার ধাপ

আগে থেকে লাগবে: Node.js, আর Supabase CLI (`npm i -g supabase`)।

### ১. ব্যাকএন্ড

```bash
supabase login
supabase link --project-ref <আপনার-project-ref>
supabase db push

cp supabase/functions/.env.example supabase/functions/.env
# .env ফাইলে চারটি মান বসান: TELEGRAM_BOT_TOKEN, ANTHROPIC_API_KEY,
# ELEVENLABS_API_KEY, ADMIN_SECRET (openssl rand -hex 32 দিয়ে তৈরি করুন)
supabase secrets set --env-file supabase/functions/.env

supabase functions deploy
```

এরপর একবার সেটআপ চালান:

```bash
curl -X POST https://<project-ref>.supabase.co/functions/v1/setup \
  -H "x-admin-secret: <আপনার ADMIN_SECRET>"
```

উত্তরে `"can_read_all_group_messages": true` থাকতে হবে। `false` এলে BotFather-এ Privacy Mode বন্ধ করে বটকে গ্রুপ থেকে সরিয়ে আবার যোগ করুন।

### ২. অ্যাপ

```bash
cd app
cp .env.example .env   # Supabase URL ও anon key বসান
npm install
npx expo start         # Expo Go দিয়ে পরীক্ষা
```

APK বানাতে: `npx eas-cli build -p android --profile preview`

### ৩. প্রথমবার ব্যবহার

1. অ্যাপে "Telegram দিয়ে লগইন" চাপুন, Telegram-এ বটের **Start** চাপুন, অ্যাপে ফিরুন। প্রথম যিনি লগইন করবেন তিনিই মালিক; পরে অন্য কেউ ঢুকতে পারবে না।
2. গ্রুপে নিজে যেকোনো একটি মেসেজ পাঠান। এতে বট গ্রুপটিকে আপনার বলে চিনে নেয় এবং তখন থেকে বিশ্লেষণ শুরু হয় (এর আগের মেসেজও সংরক্ষিত থাকে এবং তখন বিশ্লেষিত হয়)।

## যেভাবে কাজ করে

- **আগে সংরক্ষণ, পরে বিশ্লেষণ।** webhook মেসেজ সেভ করেই উত্তর দেয়। সেভ ব্যর্থ হলে Telegram আবার পাঠায়।
- **একসাথে বিশ্লেষণ।** শেষ মেসেজের প্রায় ১২ সেকেন্ড পরে ওই সময়ের সব মেসেজ একসাথে Claude-এ যায়, তাই কয়েকটি ছোট মেসেজ মিলে একটি কাজ হয়।
- **ব্যর্থ হলে পুনরায় চেষ্টা।** প্রতি মিনিটে cron বাকি মেসেজ তুলে নেয়, সর্বোচ্চ ৫ বার। তারপরও না হলে আপনাকে Telegram-এ জানানো হয়।
- **অনিশ্চিত হলে Inbox।** AI-এর আস্থা ০.৭-এর নিচে হলে আইটেমটি "যাচাই করুন" ভাগে যায়।
- **বট গ্রুপে কখনো কিছু লেখে না।** সব বার্তা আপনার ব্যক্তিগত চ্যাটে আসে।

## সীমাবদ্ধতা

- বট যোগ হওয়ার আগের মেসেজ পাওয়া যায় না।
- ২০ MB-এর বড় ফাইল Telegram বটকে ডাউনলোড করতে দেয় না; সেগুলোর শুধু নাম থাকে।
- "Telegram-এ দেখুন" লিংক শুধু supergroup-এ কাজ করে।
- PDF ও ভিডিওর ভেতরের লেখা বিশ্লেষণ হয় না, শুধু ফাইল সংরক্ষিত হয়। ছবির লেখা পড়া হয়।
