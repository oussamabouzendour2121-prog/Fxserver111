# FX ⚡ Volt — RED MAX Server
## دليل النشر على Render (مجاني 100%)

---

## الخطوة 1 — رفع على GitHub

1. اذهب إلى https://github.com → سجّل دخول
2. اضغط **New Repository** → سمّه `fxvolt`
3. اضغط **Create Repository**
4. ارفع هذه الملفات:
   - `package.json`
   - `server/index.js`
   - `public/index.html`

---

## الخطوة 2 — نشر على Render

1. اذهب إلى https://render.com → سجّل بـ Google
2. اضغط **New +** → **Web Service**
3. اختر repository الـ `fxvolt`
4. الإعدادات:
   - **Runtime:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. اضغط **Create Web Service**
6. انتظر 2 دقيقة → ستحصل على رابط مثل:
   `https://fxvolt.onrender.com`

---

## الخطوة 3 — منع النوم (UptimeRobot مجاني)

1. اذهب إلى https://uptimerobot.com → سجّل مجاناً
2. **Add New Monitor** → **HTTP(s)**
3. **URL:** `https://fxvolt.onrender.com/ping`
4. **Interval:** 5 minutes
5. اضغط **Save**

✅ السيرفر الآن يشتغل 24/7 بدون توقف

---

## الاستخدام

افتح الرابط من أي هاتف:
```
https://fxvolt.onrender.com
```

- السيرفر يحلل 9 أزواج كل 60 ثانية
- الإشارات تظهر تلقائياً عند توافق RSY1+RSY2+VC+TDF
- النتائج WIN/LOSS تُحسب من السعر الحقيقي بعد انتهاء الصفقة
- كل شيء محفوظ 24 ساعة

---

## API

| Endpoint | الوصف |
|----------|-------|
| GET /api/signals/active | الإشارات النشطة |
| GET /api/signals/history | التاريخ آخر 24h |
| GET /api/stats | إحصائيات WIN/LOSS |
| GET /ping | فحص السيرفر |
