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

## চালু করার ধাপ (শুধু GitHub দিয়ে)

কম্পিউটারে কিছু ইনস্টল করতে হবে না।

### ১. Secrets বসান

GitHub-এ রিপোর **Settings → Secrets and variables → Actions → New repository secret** থেকে এগুলো যোগ করুন:

| নাম | কোথায় পাবেন |
|---|---|
| `SUPABASE_ACCESS_TOKEN` | supabase.com → Account → Access Tokens |
| `SUPABASE_PROJECT_REF` | প্রজেক্ট URL-এর `https://` আর `.supabase.co`-র মাঝের অংশ |
| `SUPABASE_DB_PASSWORD` | প্রজেক্ট তৈরির সময় দেওয়া ডেটাবেস পাসওয়ার্ড |
| `SUPABASE_ANON_KEY` | Project Settings → API → anon public |
| `TELEGRAM_BOT_TOKEN` | BotFather |
| `ANTHROPIC_API_KEY` | Claude Console |
| `ELEVENLABS_API_KEY` | ElevenLabs |
| `ADMIN_SECRET` | নিজে বানানো যেকোনো লম্বা এলোমেলো লেখা (৩০+ অক্ষর) |

### ২. ব্যাকএন্ড ডিপ্লয়

**Actions → Deploy backend → Run workflow**। শেষ ধাপের আউটপুটে `"can_read_all_group_messages": true` থাকতে হবে। `false` এলে BotFather-এ Privacy Mode বন্ধ করে বটকে গ্রুপ থেকে সরিয়ে আবার যোগ করুন।

### ৩. অ্যাপ

**Actions → Build Android APK → Run workflow**। শেষ হলে ওই রানের পাতার নিচে **Artifacts** থেকে `taskbot-apk` নামিয়ে ফোনে ইনস্টল করুন।

### অ্যাপ আপডেট পাঠানো (EAS Update)

অ্যাপের কোড বদলালে নতুন APK লাগে না: **Actions → Publish app update → Run workflow** চালালে ইনস্টল করা অ্যাপ পরেরবার খোলার সময় নতুন সংস্করণ নামিয়ে নেয়, তার পরেরবার খুললে সেটা চালু হয়। এর জন্য `EXPO_TOKEN` secret লাগে (expo.dev → Account Settings → Access Tokens)।

নতুন নেটিভ মডিউল যোগ হলে `app.json`-এর `version` বাড়িয়ে নতুন APK বানাতে হবে; আপডেট শুধু একই `version`-এর APK-তে পৌঁছায়।

### ওয়েব ভার্সন

একই অ্যাপ ব্রাউজারেও চলে, GitHub Pages থেকে: `https://<আপনার-username>.github.io/taskbot/`

1. একবার: রিপোর **Settings → Pages → Source**-এ "GitHub Actions" বেছে নিন।
2. **Actions → Deploy web app → Run workflow**।

লগইন অ্যাপের মতোই Telegram দিয়ে। ঠিকানাটা যে কেউ খুলতে পারে, কিন্তু লগইন ছাড়া কোনো ডেটা দেখা যায় না।

### বসের জন্য পাতা

অ্যাপের **Settings → Page for your boss** থেকে একটি গোপন লিংক বানানো যায়। সেই লিংকে বস লগইন ছাড়াই নিজের পাঠানো ছবি, ডকুমেন্ট, ভয়েস ও লিংক দেখতে ও ডাউনলোড করতে পারেন। আপনার নিজের কিছুই সেখানে দেখা যায় না, আর লিংক যেকোনো সময় বাতিল করা যায়। এটা চালাতে ওয়েব ভার্সন ডিপ্লয় করা থাকতে হবে।

### ৪. প্রথমবার ব্যবহার

1. অ্যাপে "Telegram দিয়ে লগইন" চাপুন, Telegram-এ বটের **Start** চাপুন, অ্যাপে ফিরুন। প্রথম যিনি লগইন করবেন তিনিই মালিক; পরে অন্য কেউ ঢুকতে পারবে না।
2. গ্রুপে নিজে যেকোনো একটি মেসেজ পাঠান। এতে বট গ্রুপটিকে আপনার বলে চিনে নেয় এবং তখন থেকে বিশ্লেষণ শুরু হয় (এর আগের মেসেজও সংরক্ষিত থাকে এবং তখন বিশ্লেষিত হয়)।

কম্পিউটার থেকে হাতে চালাতে চাইলে workflow ফাইল দুটির (`.github/workflows/`) কমান্ডগুলোই অনুসরণ করুন।

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
