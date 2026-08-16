#!/bin/sh
set -e

npx prisma migrate deploy
node --import tsx prisma/seed.ts

# scripts/dockerVerifySeed.ts (حسابات admin + منتج اختبار) اختياري بلا NEXT_PUBLIC_SUPABASE_URL/
# SUPABASE_SERVICE_ROLE_KEY حقيقيَّين — نتخطّاه محليًا بلا أسرار Supabase بدل فشل الخدمة
# كاملةً (migrate/seed الأساسيَّين يبقيان يعملان دومًا بلا أي اعتماد خارجي).
if [ -n "$NEXT_PUBLIC_SUPABASE_URL" ] && [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  node --import tsx scripts/dockerVerifySeed.ts
else
  echo "Skipping dockerVerifySeed.ts: no Supabase credentials provided."
fi
