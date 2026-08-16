#!/bin/sh
set -e

npx prisma migrate deploy
node --import tsx prisma/seed.ts

# يعمل دومًا الآن — منتج الاختبار (المطلوب لاختبار إنشاء الطلبات) لا يعتمد على Supabase.
# الجزء الوحيد المشروط بأسرار Supabase حقيقية (حساب Owner) يُقرَّر داخل السكربت نفسه.
node --import tsx scripts/dockerVerifySeed.ts
