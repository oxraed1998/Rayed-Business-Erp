# النشر على Railway — Deployment

## المتطلبات
- خدمة PostgreSQL على Railway (موجودة مسبقًا في المشروع).
- خدمة التطبيق مربوطة بمستودع GitHub `oxraed1998/Rayed-Business-Erp`.

## متغيرات البيئة لخدمة التطبيق

| المتغير | القيمة | ملاحظات |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | مرجع لمتغير خدمة PostgreSQL (الشبكة الداخلية، دون كشف القاعدة للعامة). |
| `SETUP_TOKEN` | قيمة عشوائية طويلة (`openssl rand -hex 32`) | مطلوبة مرة واحدة لإنشاء حساب مالك المنصة عبر `/setup`. **احذفها بعد الإعداد.** |
| `APP_URL` | `https://<your-domain>` | تُستخدم في روابط الدعوات وإعادة تعيين كلمات المرور. |
| `DB_SCHEMA` | (اختياري) الافتراضي `erp` | مخطط PostgreSQL الذي يعمل فيه النظام. |
| `ENCAR_API_KEY` | مفتاح encar-api.com | يُرسل في الترويسة `x-api-key` إلى `autokoreablendi.com/api` لصفحة "سوق Encar الكوري". يبقى على الخادم فقط. |

لا يُحفظ أي سر في المستودع. ملف `.env.example` يوضّح الأسماء فقط.

## ماذا يحدث عند النشر
1. **البناء:** `pnpm install` ← `prisma generate` ← `next build` (الأمر `pnpm run build`).
2. **التشغيل:** `pnpm start` ← `scripts/start.mjs`:
   - يضيف `?schema=erp` إلى `DATABASE_URL` تلقائيًا.
   - يطبق الترحيلات بأمان عبر `prisma migrate deploy` (إضافية فقط، ولا يحذف بيانات).
   - يشغّل Next.js على `$PORT`.
3. **فحص الصحة:** `GET /api/health` يعيد `{"ok":true,"db":"up"}` عند اتصال القاعدة.

## البيانات القديمة
النموذج الأولي (`legacy/server.js`) أنشأ جداول `companies` و`entries` و`branches` و`contacts` في المخطط `public`.
النظام الجديد يعمل في مخطط مستقل `erp` **ولا يقرأ أو يعدّل أو يحذف هذه الجداول**. يمكن ترحيل بياناتها لاحقًا يدويًا بعد مراجعتها.

## الإعداد الأول بعد النشر
1. اضبط `SETUP_TOKEN` وأعد النشر.
2. افتح `https://<domain>/setup` وأدخل الرمز وبيانات المالك.
3. أنشئ شركتك الأولى (يُنشأ دليل الحسابات والمستودع والفترة المالية تلقائيًا).
4. احذف `SETUP_TOKEN` من المتغيرات.

## التشغيل محليًا
```bash
pnpm install
cp .env.example .env    # ثم عدّل DATABASE_URL
pnpm db:migrate         # أو: DATABASE_URL=... node scripts/start.mjs
pnpm dev
```

## الاختبارات
```bash
pnpm typecheck && pnpm lint
pnpm test:unit
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/rayed_test?schema=erp" pnpm test:integration
BASE_URL=http://localhost:3000 E2E_EMAIL=... E2E_PASSWORD=... pnpm test:e2e
```
اختبارات التكامل تعيد بناء المخطط المحدد في `TEST_DATABASE_URL` من الصفر، فلا تستخدم قاعدة الإنتاج أبدًا.
