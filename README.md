# FX ⚡ Volt — RED MAX Signal Server
## دليل النشر الكامل على Render (مجاني 100%)

---

## الخطوة 1 — رفع الكود على GitHub

1. اذهب إلى https://github.com وسجّل دخول أو أنشئ حساباً مجانياً
2. اضغط **New Repository**
3. سمّه: `fxvolt-server`
4. اضغط **Create Repository**
5. ارفع كل الملفات (package.json + server/index.js + public/index.html)

أو استخدم GitHub Desktop للرفع السهل.

---

## الخطوة 2 — نشر على Render

1. اذهب إلى https://render.com وسجّل بحساب Google مجاناً
2. اضغط **New +** → **Web Service**
3. اختر **Connect a repository** → اختر `fxvolt-server`
4. اضبط الإعدادات:
   - **Name:** fxvolt
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. اضغط **Create Web Service**
6. انتظر 2-3 دقائق حتى ينتهي البناء
7. ستحصل على رابط مثل: `https://fxvolt.onrender.com`

---

## الخطوة 3 — منع النوم مع UptimeRobot (مجاني)

Render free tier ينام بعد 15 دقيقة عدم استخدام.
UptimeRobot يضربه كل 5 دقائق ليبقى مستيقظاً.

1. اذهب إلى https://uptimerobot.com وسجّل مجاناً
2. اضغط **Add New Monitor**
3. اختر **HTTP(s)**
4. **Friendly Name:** FX Volt
5. **URL:** `https://fxvolt.onrender.com/ping`
6. **Monitoring Interval:** 5 minutes
7. اضغط **Create Monitor**

✅ الآن السيرفر يشتغل 24/7 بدون توقف.

---

## الخطوة 4 — فتح التطبيق

افتح المتصفح وادخل رابط Render:
```
https://fxvolt.onrender.com
```

أو احفظه كـ shortcut على شاشة هاتفك.

---

## كيف يعمل النظام

```
السيرفر (Render) — يشتغل 24/7
  ↓ كل 60 ثانية
يحلل 9 أزواج بخوارزمية RED MAX
  ↓ إذا توافقت RSY1 + RSY2 + VC + TDF
يحفظ الإشارة في قاعدة البيانات
  ↓ بعد دقيقة من الإشارة
يحسب النتيجة WIN/LOSS من سعر السوق الحقيقي
  ↓
التطبيق يجلب كل 5 ثوانٍ
يعرض الإشارات والنتائج
```

---

## API Endpoints

| Endpoint | الوصف |
|----------|-------|
| GET /api/signals/active | الإشارات النشطة الآن |
| GET /api/signals/history | كل الإشارات آخر 24 ساعة |
| GET /api/stats | إحصائيات WIN/LOSS |
| GET /ping | فحص الخادم (لـ UptimeRobot) |

---

## ملاحظات مهمة

- الإشارات تعتمد على تحليل حقيقي بخوارزمية RED MAX فقط
- لا توجد إشارات عشوائية
- إذا لم تتوافق الشروط الأربعة → لا إشارة
- النتائج WIN/LOSS محسوبة من سعر السوق الفعلي بعد انتهاء الصفقة
- كل الإشارات محفوظة 24 ساعة في قاعدة البيانات
