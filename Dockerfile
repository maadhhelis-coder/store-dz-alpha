# syntax=docker/dockerfile:1

# صورة أساس مثبَّتة بإصدار محدد (لا :latest) — Alpine لصغر الحجم، ونفس عائلة Node المستعملة
# فعليًا فCI (.github/workflows/e2e.yml: node-version 22 — مطلوب فعليًا لـ@supabase/realtime-js).
ARG NODE_IMAGE=node:22-alpine3.20


# ---------------------------------------------------------------------------
# Stage 1: deps — تثبيت التبعيات فقط، منفصلة عن الكود المصدري لأقصى استفادة من Build Cache:
# طبقة هذه المرحلة لا تُعاد بناؤها إلا عند تغيّر package*.json أو schema.prisma فعليًا.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
WORKDIR /app
# ترقية حزم نظام Alpine الأساسية داخل نفس فرع الإصدار (3.20) — اكتُشف فعليًا عبر فحص أمني
# حقيقي بـTrivy على الصورة النهائية أن libcrypto3/libssl3 (OpenSSL) المرفقتين مع صورة القاعدة
# تحملان ثغرة CRITICAL مُصلَحة أصلًا فإصدار أحدث من نفس فرع 3.20 (لا تغيير إصدار توزيعة).
RUN apk upgrade --no-cache
# libc6-compat: بعض الحزم الأصلية (native bindings) تحتاجها فوق musl (Alpine).
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
# postinstall (prisma generate) يحتاج prisma/schema.prisma حاضرًا وقت npm ci.
COPY prisma ./prisma
RUN npm ci


# ---------------------------------------------------------------------------
# Stage 2: builder — بناء إنتاجي حقيقي. عمدًا "npx next build" مباشرة وليس "npm run build"
# (الذي يشمل "prisma migrate deploy && next build" فpackage.json) — البناء (تحويل TS/تجميع
# الصفحات) لا يجب أن يعتمد على اتصال حيّ بقاعدة بيانات فمرحلة Docker build؛ الترحيل (migrate)
# ينتقل لخدمة/خطوة تشغيل منفصلة (راجع docker-compose.yml: service "migrate") — هذا يجعل بناء
# الصورة قابلًا للتكرار (reproducible) ومستقلًا عن حالة أي قاعدة بيانات فعلية.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS builder
WORKDIR /app
RUN apk upgrade --no-cache
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx next build


# ---------------------------------------------------------------------------
# Stage 3: runner — صورة الإنتاج النهائية. تحتوي فقط على .next/standalone (متعقَّب تلقائيًا،
# يشمل فقط تبعيات node_modules الفعليًا المُستعملة زمن التشغيل) + public/ + .next/static —
# وليس شجرة node_modules/المصدر الكاملة لمرحلتَي deps/builder. تشغيل كمستخدم غير جذر.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runner
WORKDIR /app
RUN apk upgrade --no-cache
# إزالة npm/npx/corepack من الصورة النهائية — الحاوية تشغّل "node server.js" مباشرة ولا تستدعي
# npm إطلاقًا زمن التشغيل. اكتُشف فعليًا عبر Trivy أن جميع ثغرات Node.js الـ33 (CRITICAL×3،
# HIGH×30) المتبقية فالصورة لم تكن فتبعيات المشروع نفسه إطلاقًا (npm overrides فpackage.json
# لا علاقة لها بها)، بل فتبعيات npm الداخلية المرفقة مع صورة node الأساس نفسها تحت
# usr/local/lib/node_modules/npm/node_modules/{tar,glob,minimatch,brace-expansion,sigstore,
# ip-address} — أدوات npm الداخلية (تُستعمل فعمليات npm install/pack ونحوها)، غير قابلة
# للإصلاح عبر overrides لأنها ليست جزءًا من شجرة تبعيات هذا المشروع. حذفها كليًا من صورة
# التشغيل (بدل محاولة ترقيعها) يزيل الثغرة فعليًا ويقلّل حجم الصورة أيضًا — لا فائدة تشغيلية
# من وجود npm فحاوية إنتاجية أصلًا.
# اكتُشف فعليًا (مراجعة docker-patterns، فحص تقرير Trivy الحقيقي لهذه الصورة بالذات): السطر
# السابق كان يحذف رابط corepack الرمزي (/usr/local/bin/corepack) فقط، ويترك مجلد الحزمة
# الفعلي (/usr/local/lib/node_modules/corepack) كاملاً فالصورة النهائية — Trivy مسحه فعليًا
# ضمن الصورة رغم أن التعليق أعلاه ينص صراحة على إزالة corepack "كليًا". صفر ثغرات فيه حاليًا،
# لكنه وزن ميت لا فائدة تشغيلية منه (نفس منطق npm/npx تمامًا) ولا يطابق النية الموثَّقة أعلاه.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

RUN addgroup -g 1001 -S nodejs && adduser -S nextjs -u 1001

COPY --from=builder /app/public ./public
# .next/standalone يشمل server.js + node_modules مُقلَّصة تلقائيًا (file tracing).
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
# محرك Prisma يُحمَّل ديناميكيًا زمن التشغيل — تتبع الملفات فNext.js لا يضمن دومًا اكتشافه
# تلقائيًا فالنسخة standalone؛ نسخه صراحة هنا يزيل هذا الخطر (مشكلة معروفة وموثَّقة فمجتمع
# Next.js+Prisma). نفس بنية alpine فكل المراحل، فالمحرك المُولَّد فـdeps متوافق زمن التشغيل.
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=deps --chown=nextjs:nodejs /app/node_modules/@prisma/client ./node_modules/@prisma/client

USER nextjs

EXPOSE 3000

# فحص صحة حقيقي: يتحقق من استجابة /api/health (التي تتحقق بدورها من اتصال قاعدة البيانات
# الفعلي عبر SELECT 1)، وليس فقط أن العملية حيّة. start_period يمنح الحاوية وقتًا للإقلاع
# الأول قبل بدء عدّ محاولات الفشل.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://127.0.0.1:3000/api/health || exit 1

# server.js (standalone) هو عملية Node مباشرة (PID 1 هنا) — لا وسيط npm/npx يبتلع
# SIGTERM/SIGINT، فـGraceful Shutdown يعمل فعليًا (Next.js 15+ يتعامل مع SIGTERM ذاتيًا
# لإنهاء الطلبات الجارية بأدب قبل الإغلاق).
CMD ["node", "server.js"]
