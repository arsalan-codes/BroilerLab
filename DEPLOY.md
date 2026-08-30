# دیپلوی آرین (Arian) — GitHub Pages + Vercel + PostgreSQL ابری

معماری اجرا:

```
مرورگر کاربر
  ├── فرانت استاتیک:  https://arsalan-codes.github.io/BroilerLab/
  │     (GitHub Pages — همین ریپو، فایل‌های webapp/)
  └── بک‌اند FastAPI:  https://<project>.vercel.app/api/...
        (Vercel — پوشه api/ + backend/ + vercel.json)
        دیتابیس: PostgreSQL ابری (Neon — رایگان)
```

`config.js` به‌صورت خودکار تشخیص می‌دهد فرانت روی Pages است یا Vercel یا لوکال،
و آدرس API را درست انتخاب می‌کند. تنها کاری که باید بکنید: آدرس Vercel را
در `config.local.js` بنویسید (یک‌بار).

---

## گام ۱ — دیتابیس PostgreSQL ابری (Neon)

1. به https://neon.tech بروید و با گیت‌هاب ثبت‌نام کنید (پلن رایگان).
2. پروژه بسازید (مثلا `arian`) — Region نزدیک: `Frankfurt`.
3. از داشبورد، **Connection string** را کپی کنید. شکل آن:

```
postgresql://USER:PASSWORD@ep-xxxx-pooler.eu-central-1.aws.neon.tech/neondb?sslmode=require
```

این رشته هرگز در گیت کامیت نمی‌شود — فقط متغیر محیطی Vercel می‌شود.

## گام ۲ — بک‌اند روی Vercel

1. به https://vercel.com بروید و با گیت‌هاب وارد شوید.
2. **Add New → Project** → ریپوی `arsalan-codes/BroilerLab` را import کنید.
3. قبل از Deploy، در بخش **Environment Variables** این‌ها را بگذارید
   (برای Production و Preview هر دو):

| کلید | مقدار |
|---|---|
| `BROILER_DATABASE_URL` | همان connection string مرحله ۱ |
| `BROILER_JWT_SECRET` | یک رشته تصادفی ۳۲+ کاراکتری (مثلا خروجی `openssl rand -hex 32`) |
| `BROILER_CORS_ORIGINS` | `https://arsalan-codes.github.io` |

4. **Deploy** را بزنید. Vercel با `vercel.json`، درخواست‌های `/api/*` را به
   `api/index.py` (FastAPI) می‌فرستد و جدول‌ها اولین بار خودکار ساخته می‌شوند
   (`init_db`).
5. آدرس پروژه را کپی کنید، مثلا `https://broilerlab.vercel.app`

> نکته امنیتی: CORS در بک‌اند باز است (`allow_origins=["*"]`) چون صفحات عمومی
> لندینگ به API پینگ می‌زنند؛ تمام مسیرهای داده‌ای با JWT محافظت می‌شوند و
> مرز امنیتی واقعی بک‌اند است (`WHERE user_id` برای هر کوئری).

## گام ۳ — اتصال فرانت Pages به بک‌اند

1. `config.local.example.js` را به `config.local.js` کپی کنید.
2. مقدار را بگذارید:

```js
window.ARIAN_PROD_API = "https://broilerlab.vercel.app";
```

3. این فایل در `.gitignore` است و به‌صورت محلی صفحات را تغذیه می‌کند؛
   برای Pages باید همین فایل (بدون مقادیر حساس) کامیت شود چون مرورگرِ
   بازدیدکننده به آن نیاز دارد. آدرس Vercel محرمانه نیست (عمومی است)،
   پس کامیتش مشکلی ندارد:

```bash
git add -f config.local.js
```

   (اگر ترجیح می‌دهید کامیت نشود، به‌جای آن خط زیر را قبل از `config.js`
   در `index.html` به‌صورت inline اضافه کنید و همان را نگه دارید.)

## گام ۴ — فعال‌سازی GitHub Pages

1. روی گیت‌هاب: **Settings → Pages**
2. **Source**: `Deploy from a branch` → Branch: `main` → Folder: `/ (root)`
3. **Save**. پس از یک دقیقه آدرس زیر فعال می‌شود:

```
https://arsalan-codes.github.io/BroilerLab/
```

## گام ۵ — دستی کامیت و پوش (از پوشه github-deploy)

```bash
cd ~/poultry_sim/github-deploy
git add -A
git commit -m "v1.5.5 deploy: Pages + Vercel backend wiring (config.local, reqs fix)"
git push origin main
```

## گام ۶ — تست نهایی

| تست | روش |
|---|---|
| فرانت لود شد؟ | `https://arsalan-codes.github.io/BroilerLab/` → صفحه اصلی آرین |
| API زنده است؟ | `curl https://<vercel-url>/api/health` → `{"status":"ok"}` |
| ثبت‌نام/ورود؟ | مودال ورود → حساب بسازید → محیط کاربری باز می‌شود |
| داده ایزوله؟ | یک دوره بسازید → در مرورگر دیگر با حساب دیگر دیده نمی‌شود |
| روتینگ؟ | `#/dashboard` مستقیم باز شود؛ back/forward کار کند |
| دوزبانه؟ | FA/EN سوییچ بدون ریلود؛ تاریخ شمسی/میلادی |

## محدودیت‌های شناخته‌شده

- **WebSocket** روی `vercel.json` ری‌رایت شده ولی پلن رایگان Vercel برای
  WS پایدار ضعیف است؛ جریان زنده دستگاه در Pages حالت polling/دستی دارد.
  (شبیه‌سازی کاملا سمت کلاینت است و بی‌تأثیر اجرا می‌شود.)
- **MQTT** (`mqtt_consumer.py`) روی Vercel لود نمی‌شود — مخصوص سرور شخصی است.
- دیتابیس لوکال (docker `broilerlab-pg:5434`) فقط برای توسعه است؛ با
  Neon اشتباه گرفته نشود.
