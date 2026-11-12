# আলমুয়াফী অনলাইন একাডেমি

বাংলা-প্রথম অনলাইন একাডেমি ও শিক্ষার্থী ব্যবস্থাপনা PWA। অ্যাপে নমুনা শিক্ষার্থী, ক্লাস, উপস্থিতি বা নোটিশ নেই; কনটেন্ট Supabase ডেটাবেজে যোগ হলে তবেই দেখাবে।

## চালানো

```sh
npm install
npm run dev
```

## Supabase সংযোগ

`.env.example` অনুসারে `.env.local` তৈরি করে Supabase Project URL এবং public anon key দিন। কখনো `service_role` key ব্রাউজার বা GitHub Pages build-এ দেবেন না।

`supabase/migrations/20261112010000_academy_core.sql` SQL Editor-এ একবার চালালে কোর টেবিল, RLS এবং নিরাপদ default policy তৈরি হয়। এটি কোনো seed data যোগ করে না। প্রথম মালিকের verified account তৈরি হওয়ার পর `supabase/provision-admin.template.sql`-এর placeholder SQL Editor-এ ব্যক্তিগতভাবে বদলে admin role দিন।

## GitHub Pages ও ফোনে ইনস্টল

GitHub Actions `main` branch থেকে `dist/` publish করে। Repository Actions variables-এ `VITE_SUPABASE_URL` এবং `VITE_SUPABASE_ANON_KEY` যোগ না করলে public static site দেখা যাবে, কিন্তু authentication/database চালু হবে না।

HTTPS-এ Android Chrome দিয়ে সাইট খুলে **অ্যাপ ইনস্টল** বা Chrome menu → **Install app / Add to Home screen** ব্যবহার করুন। Logo, standalone manifest, Bornomala font ও app shell offline cache দেওয়া আছে। Supabase API বা ব্যক্তিগত তথ্য offline cache হয় না।

## Font attribution

Bornomala designed by Jayed Ahsan Saad, sourced from [Bangla Web Fonts](https://banglawebfonts.pages.dev/font/bornomala/) and distributed under the [SIL Open Font License](https://openfontlicense.org/).
