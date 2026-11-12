# আলমুয়াফী অনলাইন একাডেমি

বাংলা ভাষার একাডেমি অ্যাডমিন ড্যাশবোর্ডের responsive frontend prototype। বর্তমানে ড্যাশবোর্ডে উদাহরণস্বরূপ mock data রয়েছে; authentication, database ও backend যুক্ত করা হয়নি।

## Local development

```sh
npm install
npm run dev
```

Production build:

```sh
npm run build
```

## GitHub Pages

এই repository-র Pages deployment GitHub Actions দিয়ে build ও publish হয়। Repository Settings → Pages-এ source হিসেবে **GitHub Actions** নির্বাচন করুন। Build output `dist/` Pages-এ প্রকাশিত হয়।

## বর্তমান সীমা

- পরিসংখ্যান ও কার্যক্রম demo data।
- লগইন, Supabase, API বা role-based authorization এখনো যুক্ত নয়।
- Web app manifest ও academy icon আছে; offline service worker এখনো নেই।
