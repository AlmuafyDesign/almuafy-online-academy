# আলমুয়াফী অনলাইন একাডেমি

বাংলা-প্রথম অনলাইন একাডেমি, প্রশাসনিক প্যানেল, শিক্ষার্থী পোর্টাল ও ইনস্টলযোগ্য PWA। অ্যাপে কোনো নমুনা শিক্ষার্থী, ক্লাস, উপস্থিতি, পাঠ, হোমওয়ার্ক বা নোটিশ নেই; Supabase-এ বাস্তব তথ্য যোগ হলে তবেই দেখায়।

## চালানো

```sh
npm install
npm run dev
```

## Supabase সংযোগ

`.env.example` অনুসারে `.env.local` তৈরি করে Supabase Project URL এবং public anon key দিন। কখনো `service_role` key ব্রাউজার বা GitHub Pages build-এ দেবেন না।

নতুন Supabase setup হলে `supabase/migrations/`-এর SQL ফাইলগুলো Supabase SQL Editor-এ ক্রমানুসারে চালান। এই একাডেমির existing project-এ আগের migrations চালানো থাকলে শুধু নতুন migration `20261112060000_academy_video_calls.sql` চালাতে হবে। মূল schema কোনো seed/dummy data যোগ করে না। `20261112020000_academy_public_content.sql` অ্যাডভান্সড সেটিংসের প্রকাশ্য বিষয়, পাঠদান পদ্ধতি, সুবিধা ও অনলাইন ক্লাসের ধাপের কলাম যোগ করে। `20261112030000_secure_homework_submission_windows.sql` নতুন হোমওয়ার্কের deadline এবং শিক্ষক-নির্দেশিত revision অনুযায়ী শিক্ষার্থীর জমা/পরিবর্তন সীমিত করে। `20261112050000_public_english_content.sql` পাবলিক সাইটের English translation fields যোগ করে; এটি চালানোর পর Advanced Settings, ক্লাস, লাইব্রেরি ও নোটিশে ইংরেজি তথ্যও লিখে Save করুন। `20261112060000_academy_video_calls.sql` call access secure করে; কোনো নমুনা call বা শিক্ষার্থী তৈরি করে না।

প্রথম মালিকের verified account তৈরি হওয়ার পর `supabase/provision-admin.template.sql`-এর placeholder SQL Editor-এ ব্যক্তিগতভাবে বদলে admin role দিন। শিক্ষার্থীর signup থেকে কখনো admin role দেওয়া হয় না।

## চালু থাকা মডিউল

- অ্যাডমিন: শিক্ষার্থী, ভর্তি, ক্লাস, সময়সূচি, উপস্থিতি, দৈনিক পাঠ, পাঠের লিংক, হোমওয়ার্ক, জমা মূল্যায়ন, লাইব্রেরি বিভাগ/উপকরণ, নোটিশ, শিক্ষার্থী বিজ্ঞপ্তি, কার্যক্রম লগ, CSV রিপোর্ট এবং অ্যাডভান্সড সেটিংস।
- অ্যাডমিন ও শিক্ষার্থী: যেকোনো সময় একে অন্যকে audio বা video call, incoming call গ্রহণ/বাতিল, mic/camera control এবং সরানো/ছোট-বড়/minimize করা call window। কল পেতে অপর ব্যক্তিকে app খোলা রেখে sign in থাকতে হবে। Browser/device-এর camera ও microphone permission দিতে হবে।
- শিক্ষার্থী: নিজ ক্লাস, আসন্ন/চলমান ক্লাস, পাঠ/লিংক, হোমওয়ার্ক জমা, শিক্ষক feedback/marks, উপস্থিতি, প্রকাশিত লাইব্রেরি/নোটিশ/ব্যক্তিগত বিজ্ঞপ্তি এবং নিজ প্রোফাইল।
- পাবলিক সাইট: বাংলা/English toggle, একাডেমির পরিচিতি, ক্লাস, শেখার পদ্ধতি/সুবিধা, পাঠ্য বিষয়, লাইব্রেরি, ব্যবহার-ধাপ, নোটিশ এবং যোগাযোগ। শিক্ষক পরিচিতি বা ছবি ফর্ম/পাবলিক সাইটে নেই।

## Audio/video call সেটআপ (Daily.co)

কলটি Daily.co Video SDK ব্যবহার করে। Supabase Authentication/Database-এ থাকা বিদ্যমান `admin` (একাডেমি কর্তৃপক্ষ) ও `student` account-ই ব্যবহার হয়; নতুন login বা user table নেই। Supabase Realtime call alert ও online/offline presence দেয়। `daily-call-session` Edge Function authenticated account ও call participant যাচাই করে private Daily room এবং স্বল্পমেয়াদি join token তৈরি করে। Daily API key frontend-এ যায় না।

1. Supabase SQL Editor-এ `supabase/migrations/20261112070000_daily_calls_push_history.sql` ফাইলটি পুরোটা চালান। এটি বর্তমান call table-ই প্রসারিত করে; history, usage, push subscription ও presence-এর নিরাপদ access যোগ করে।
2. Daily.co account-এ একটি Video SDK domain ও API key তৈরি করুন। Supabase CLI-তে project sign-in/link করা থাকলে নিচের command চালান:

```sh
supabase functions deploy daily-call-session --project-ref hojatyfstvtrazvisjim
supabase secrets set --project-ref hojatyfstvtrazvisjim DAILY_API_KEY=আপনার_DAILY_API_KEY DAILY_DOMAIN=আপনার-domain.daily.co
```

3. Web Push চাইলে VAPID key pair তৈরি করুন (`npx --yes web-push generate-vapid-keys --json`)। private key শুধু Supabase Function secret হবে; public key GitHub repository **Settings → Secrets and variables → Actions → Variables**-এ `VITE_VAPID_PUBLIC_KEY` নামে যোগ করুন। এরপর public key ও private key Supabase-এ সংরক্ষণ করুন:

```sh
supabase secrets set --project-ref hojatyfstvtrazvisjim VAPID_PUBLIC_KEY=আপনার_public_key VAPID_PRIVATE_KEY=আপনার_private_key VAPID_SUBJECT=https://almuafydesign.github.io/almuafy-online-academy/
```

4. GitHub Actions আবার চালিয়ে site deploy করুন। Admin ও student—দুজনেই কল প্যানেল থেকে browser notification অনুমতি চালু করবেন। iPhone-এ notification পেতে সাইটটি Home Screen-এ install করে সেখান থেকে খুলে notification অনুমতি দিন; বন্ধ browser-এ notification OS/browser সমর্থনের ওপর নির্ভর করে।

`DAILY_API_KEY` ও `VAPID_PRIVATE_KEY` কখনো `.env`, GitHub frontend variable, বা source code-এ রাখবেন না। শুধু Daily room domain, VAPID public key এবং Supabase-এর public anon key browser build-এ থাকতে পারে। `DAILY_API_KEY`, VAPID private key, ও service-role key কাউকে পাঠাবেন না।

### ব্যবহার ও খরচ

Daily-এর বর্তমান Video SDK মূল্যতালিকায় প্রতি মাসে 10,000 participant-minutes বিনা খরচে আছে। ২ ঘণ্টা/দিন, ৩০ দিন, ১ জন শিক্ষক-প্রশাসক ও ১ জন শিক্ষার্থী হলে আনুমানিক `120 × 2 × 30 = 7,200 participant-minutes`; এ ব্যবহার free allowance-এর ভেতরে। 10,000-এর পর video/audio call-এর অতিরিক্ত participant-minute বর্তমানে $0.004; audio-only rate $0.00099। Daily জানায়, free allowance শেষ হলেও তাদের সিস্টেম কল স্বয়ংক্রিয়ভাবে থামায় না। মূল্য বদলাতে পারে, তাই ব্যবহারের আগে [Daily-এর বর্তমান pricing](https://www.daily.co/pricing/video-sdk/) এবং Daily dashboard দেখুন।

Admin কল প্যানেলে app-এর এই মাসের participant-minute আনুমানিক হিসাব ও পরিবর্তনযোগ্য limit দেখা যায়। Limit পূর্ণ হলে app নতুন কল আটকে দেয় এবং চলমান কলের heartbeat-এ (সর্বোচ্চ প্রায় 15 সেকেন্ডের মধ্যে) কল বন্ধ করে। এটি Daily account-এর global billing cap নয়—Daily account-এ অন্য app থেকেও ব্যবহার হলে, বা Daily-এর প্রকৃত billing rounding ভিন্ন হলে, সেই পার্থক্য app জানে না। Billing usage যাচাইয়ের মূল জায়গা Daily dashboard।

Call history দুই পক্ষের অংশগ্রহণকারী ছাড়া অন্য কেউ পড়তে পারে না। Busy account-এ নতুন কল database-side-এ আটকায়, 45 সেকেন্ডে উত্তর না এলে missed হয়, Daily room private এবং দুই participant-এ সীমিত। Push বন্ধ থাকলেও app খোলা অবস্থায় Supabase Realtime incoming alert কাজ করে।

### পরীক্ষা

Migration চালানো ও Edge Function secrets বসানোর পর আলাদা admin ও student account দিয়ে আলাদা device/browser-এ পরীক্ষা করুন: audio/video শুরু, গ্রহণ, প্রত্যাখ্যান, 45-second missed, hangup, mic/camera toggle, no-camera fallback, history, push permission, এবং একই Wi-Fi বনাম আলাদা network। এখানে বাস্তব Daily key, দুই account, এবং physical-device/browser access ছাড়া authenticated end-to-end call বা closed-browser push যাচাই করা যায় না।

## GitHub Pages ও ফোনে ইনস্টল

GitHub Actions `main` branch থেকে `dist/` publish করে। Repository Actions variables-এ `VITE_SUPABASE_URL` এবং `VITE_SUPABASE_ANON_KEY` যোগ না করলে public static site দেখা যাবে, কিন্তু authentication/database চালু হবে না।

HTTPS-এ Android Chrome দিয়ে সাইট খুলে **অ্যাপ ইনস্টল** বা Chrome menu → **Install app / Add to Home screen** ব্যবহার করুন। Logo, standalone manifest, Bornomala font ও app shell offline cache দেওয়া আছে। Supabase API বা ব্যক্তিগত তথ্য offline cache হয় না।

## Font attribution

Bornomala designed by Jayed Ahsan Saad, sourced from [Bangla Web Fonts](https://banglawebfonts.pages.dev/font/bornomala/) and distributed under the [SIL Open Font License](https://openfontlicense.org/).
