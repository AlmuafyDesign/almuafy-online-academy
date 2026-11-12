# আলমুয়াফী অনলাইন একাডেমি

বাংলা-প্রথম অনলাইন একাডেমি, প্রশাসনিক প্যানেল, শিক্ষার্থী পোর্টাল ও ইনস্টলযোগ্য PWA। অ্যাপে কোনো নমুনা শিক্ষার্থী, ক্লাস, উপস্থিতি, পাঠ, হোমওয়ার্ক বা নোটিশ নেই; Supabase-এ বাস্তব তথ্য যোগ হলে তবেই দেখায়।

## চালানো

```sh
npm install
npm run dev
```

## Supabase সংযোগ

`.env.example` অনুসারে `.env.local` তৈরি করে Supabase Project URL এবং public anon key দিন। কখনো `service_role` key ব্রাউজার বা GitHub Pages build-এ দেবেন না।

`supabase/migrations/`-এর SQL ফাইলগুলো Supabase SQL Editor-এ ক্রমানুসারে চালান। মূল schema কোনো seed/dummy data যোগ করে না। `20261112020000_academy_public_content.sql` অ্যাডভান্সড সেটিংসের প্রকাশ্য বিষয়, পাঠদান পদ্ধতি, সুবিধা ও অনলাইন ক্লাসের ধাপের কলাম যোগ করে। `20261112030000_secure_homework_submission_windows.sql` নতুন হোমওয়ার্কের deadline এবং শিক্ষক-নির্দেশিত revision অনুযায়ী শিক্ষার্থীর জমা/পরিবর্তন সীমিত করে। `20261112050000_public_english_content.sql` পাবলিক সাইটের English translation fields যোগ করে; এটি চালানোর পর Advanced Settings, ক্লাস, লাইব্রেরি ও নোটিশে ইংরেজি তথ্যও লিখে Save করুন। এই migration কোনো record/নমুনা content তৈরি করে না।

প্রথম মালিকের verified account তৈরি হওয়ার পর `supabase/provision-admin.template.sql`-এর placeholder SQL Editor-এ ব্যক্তিগতভাবে বদলে admin role দিন। শিক্ষার্থীর signup থেকে কখনো admin role দেওয়া হয় না।

## চালু থাকা মডিউল

- অ্যাডমিন: শিক্ষার্থী, ভর্তি, ক্লাস, সময়সূচি, উপস্থিতি, দৈনিক পাঠ, পাঠের লিংক, হোমওয়ার্ক, জমা মূল্যায়ন, লাইব্রেরি বিভাগ/উপকরণ, নোটিশ, শিক্ষার্থী বিজ্ঞপ্তি, কার্যক্রম লগ, CSV রিপোর্ট এবং অ্যাডভান্সড সেটিংস।
- শিক্ষার্থী: নিজ ক্লাস, আসন্ন/চলমান ক্লাস, পাঠ/লিংক, হোমওয়ার্ক জমা, শিক্ষক feedback/marks, উপস্থিতি, প্রকাশিত লাইব্রেরি/নোটিশ/ব্যক্তিগত বিজ্ঞপ্তি এবং নিজ প্রোফাইল।
- পাবলিক সাইট: বাংলা/English toggle, একাডেমির পরিচিতি, ক্লাস, শেখার পদ্ধতি/সুবিধা, পাঠ্য বিষয়, লাইব্রেরি, ব্যবহার-ধাপ, নোটিশ এবং যোগাযোগ। শিক্ষক পরিচিতি বা ছবি ফর্ম/পাবলিক সাইটে নেই।

ভিডিও কল এখনো পরের ধাপ; সময়সূচিতে আপাতত বাহ্যিক meeting URL ব্যবহার করা যায়।

## GitHub Pages ও ফোনে ইনস্টল

GitHub Actions `main` branch থেকে `dist/` publish করে। Repository Actions variables-এ `VITE_SUPABASE_URL` এবং `VITE_SUPABASE_ANON_KEY` যোগ না করলে public static site দেখা যাবে, কিন্তু authentication/database চালু হবে না।

HTTPS-এ Android Chrome দিয়ে সাইট খুলে **অ্যাপ ইনস্টল** বা Chrome menu → **Install app / Add to Home screen** ব্যবহার করুন। Logo, standalone manifest, Bornomala font ও app shell offline cache দেওয়া আছে। Supabase API বা ব্যক্তিগত তথ্য offline cache হয় না।

## Font attribution

Bornomala designed by Jayed Ahsan Saad, sourced from [Bangla Web Fonts](https://banglawebfonts.pages.dev/font/bornomala/) and distributed under the [SIL Open Font License](https://openfontlicense.org/).
