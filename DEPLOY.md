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
| `WEIGHT_API_TOKEN` | توکن `ttoken` دستگاه توزین آنلاین — فقط سمت سرور، هرگز به مرورگر نمی‌رسد. بدون آن دکمه «دریافت داده دستگاه» خطای 400 می‌دهد (نام قدیمی `UKTECH_API_TOKEN` هم کار می‌کند) |
| `WEIGHT_API_URL` | آدرس پایه API دستگاه (پیش‌فرض `https://uktech.ir/Login/api_weight_data.php`) — نام قدیمی `UKTECH_API_BASE` هم کار می‌کند |
| `UKTECH_SERIAL` | سریال دستگاه (پیش‌فرض `ESP800`) — اختیاری |
| `UKTECH_VERIFY_SSL` | پیش‌فرض `auto`: اول strict بعد با هشدار fallback بدون تأیید (هاست uktech گواهی self-signed دارد). `true` = همیشه strict، `false` = همیشه بدون تأیید |
| `UKTECH_MIN_WEIGHT` | حداقل وزن شروع سشن توزین به گرم (پیش‌فرض `20`) — کمتر از این در حالت خالی نادیده گرفته می‌شود |
| `UKTECH_STABLE_TOL` | تلرانس پایداری به گرم (پیش‌فرض `2`): خوانش‌های داخل این باند «همان بار» حساب می‌شوند |
| `UKTECH_STABLE_READINGS` | تعداد خوانش پیاپی داخل باند برای تأیید توزین (پیش‌فرض `2`)؛ `1` یعنی لبه‌ای (هر لمس ثبت می‌شود) |
| `UKTECH_ZERO_THRESHOLD` | زیر این وزن (گرم، پیش‌فرض `5`) ترازو خالی حساب می‌شود |
| `UKTECH_ZERO_CONFIRMATIONS` | تعداد خوانش زیر صفر پیاپی برای پایان سشن (پیش‌فرض `2` — صفر تکیِ dropout ویزیت را تکه‌تکه نمی‌کند) |
| `UKTECH_SESSION_TIMEOUT_S` | ریست سشن گیرکرده پس از این ثانیه (پیش‌فرض `14400` = ۴ ساعت) |
| `UKTECH_BIRD_CHANNEL` | فیلد وزن پرنده (پیش‌فرض `weight_2`، fallback به `total_weight`) |
| `UKTECH_BIN_CHANNEL` | فیلد وزن مخزن (پیش‌فرض `weight_1`، گرم → کیلوگرم) |
| `DEVICE_INGEST_RATE_LIMIT` | سقف رویداد هر دستگاه در پنجره (پیش‌فرض `120`) — لیمیتر per-process و best-effort است، نه تضمین سراسری |
| `DEVICE_INGEST_RATE_WINDOW` | پنجره ریت‌لیمیت به ثانیه (پیش‌فرض `60`) |
| `DEVICE_ONLINE_SECONDS` | آستانه «آنلاین» از روی `last_seen_at` (پیش‌فرض `300`) |
| `DEVICE_MAX_CLOCK_SKEW_S` | تلرانس ساعت آینده دستگاه (پیش‌فرض `300`)؛ بیشتر از این → خطای 400 |
| `DEVICE_MAX_BATCH` | سقف رویداد هر بچ (پیش‌فرض `50`) |
| `UKTECH_PAGE_SIZE` | اندازه صفحه واکشی upstream (پیش‌فرض `500`) |
| `UKTECH_MAX_PAGES` | سقف ایمنی صفحات هر سینک (پیش‌فرض `20`) |
| `UKTECH_PAGES_PER_TICK` | سقف صفحه در هر تیک سرورلس (پیش‌فرض `4`) — مازاد در تیک بعد |
| `UKTECH_EMPTY_THRESHOLD_G` | وزن خالی یونیت به گرم (پیش‌فرض `15`) — صفر و پسماند زیر این حد = مرغ خارج |
| `UKTECH_EMPTY_DEBOUNCE` | خوانش خالی پیاپی برای بستن ویزیت (پیش‌فرض `2`) — فلیکر تکی نمی‌بندد |
| `UKTECH_FEED_NOISE_G` | نویز لودسل مخزن (پیش‌فرض `0.5`) — افت کمتر نادیده گرفته می‌شود |
| `UKTECH_REFILL_JUMP_G` | جهش شارژ مخزن (پیش‌فرض `50`) — re-baseline بدون مصرف منفی |
| `UKTECH_RFID_SWAP_POLICY` | سیاست تعویض تگ (`keep-open` پیش‌فرض؛ `close-open` هم ممکن) |
| `UKTECH_BIRD_JUMP_G` | پرش تک‌مرحله‌ای وزن پرنده (پیش‌فرض `30`) — شیب تخلیه وزن زنده را فریز می‌کند |
| `UKTECH_INVALID_EJECT_S` / `EJECTION_TIMEOUT_SECONDS` | پنجره تخلیه INVALID (پیش‌فرض `30`) — ددلاین persisted، با restart ریست نمی‌شود |
| `UKTECH_FALLBACK_MAX_GAP_S` | سقف سکوت مجاز fallback دیواری (پیش‌فرض `120`) — شکاف بزرگ‌تر re-baseline می‌شود و به elapsed/‏presence/‏feed اضافه نمی‌شود (`0` = بدون سقف) |
| `UKTECH_PRESENCE_TOL_S` | تلرانس اختلاف presence/elapsed برای لاگ (پیش‌فرض `30`) |
| `UKTECH_AUTO_POLL` / `UKTECH_POLL_SECONDS` / `UKTECH_CYCLE_ID` | پول پس‌زمینه فقط dev (`false` پیش‌فرض؛ روی Vercel همیشه خاموش — تیک ۳s کلاینت) |

> جدول `devices` (کلیدهای ESP32) با مایگریشن `012_devices` می‌آید؛ روی
> دیتابیس‌های موجود هم `init_db` در بوت آن را خودش می‌سازد (self-heal)، و
> اگر `BROILER_DB_MIGRATE=alembic` دارید همان مسیر رسمی آلمبیک اعمال می‌شود.
> کلید سراسری دستگاه وجود ندارد — هر ESP32 فقط کلید خودش (`BLD_...`) را دارد.

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

3. همین فایل با placeholder خالی در ریپو track شده است (آدرس Vercel عمومی
   است و محرمانه نیست)؛ کافی است مقدار را بگذارید و commit/push کنید.

> اگر روزی مقدار محرمانه‌ای در آن گذاشتید، اول `.gitignore` را فعال کنید و
> `git rm --cached config.local.js` بزنید تا از تاریخچه خارج شود.

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

## پیوست: معماری زنده دستگاه (device live pipeline)

```
Browser (device-panel.js, polling 3s + backoff)
  ↓  POST /api/uktech/sync {cycle_id}  (JWT, per-cycle ownership)
FastAPI (backend/main.py) — توکن هرگز به مرورگر نمی‌رسد
  ↓  uktech.sync_serial_to_cycle
Remote Weight API (WEIGHT_API_URL + WEIGHT_API_TOKEN از env سرور)
  ↓  record_to_unit_events → validate (_to_float strict) → dedupe
Neon (DeviceLog raw + Visit validated + SyncState cursor + WeighingSession)
  ↓  GET registrations/status/sessions (جدیدترین اول، no-store)
Frontend tables (یونیت ۱/۲ جدا، ۲ رقم اعشار، بج ONLINE/STALE/OFFLINE)
```

### نگاشت واقعی API (مشاهده‌شده، نه حدسی)
| داخلی | منبع | توضیح |
|---|---|---|
| id | `id` | کلید dedupe (`serial:id:uN`) |
| deviceId | `device_id` | مثل `ESP32-S3-001` |
| serial | query param | مثل `ESP800` |
| chickenId | `rfid1`/`rfid2` (per-unit) | strip فقط، بدون تبدیل |
| chickenWeight | `weight_2`/`weight_4` (fallback: `total_weight` برای ردیف تک‌یونیتی قدیمی) | گرد کردن فقط نمایشی |
| tankWeight | `weight_1`/`weight_3` (گرم→کیلو) | ستون مخزن |
| feedConsumed | مستقیم از API نمی‌آید (حالت B): افت مخزن بین ردیف‌های پیاپی ×۱۰۰۰ | مخزن ثابت → ۰ واقعی؛ مخزن ناموجود → null/— |
| elapsedSeconds | مجموع spanهای VALID (حالت C روی زمان) | NULL قدیمی → wall-clock fallback |
| timestamp | `created_at` (Asia/Tehran wall) → UTC ذخیره، شمسی نمایشی | بدون parse دستی (fromisoformat/zoneinfo) |
| receivedAt | زمان ingest سرور | |
| raw | کل DeviceLog (status flag هم ذخیره می‌شود) | |

### چرا feed گاهی ۰٫۰۰ است؟
علت باگ نیست: وقتی سطح مخزن ثابت است مصرف واقعی صفر است (۰ اندازه‌گیری‌شده، نه جعلی). وقتی مخزن اصلاً دیتا ندارد (NULL) API حالا `null` می‌دهد و UI `—` نشان می‌دهد (قبلاً `or 0` جعل می‌کرد — حذف شد).

### چرا elapsed قبلاً عجیب بود؟
قبلاً همیشه wall-clock بود (ویزیت‌های بازِ قدیمی تا ساعت‌ها رشد می‌کردند). حالا `presence_s` انباشته‌شده روی spanهای VALID است؛ legacyها fallback wall-clock.

### چرا duplicate دیده می‌شد؟
دو مسیر (WS زنده + REST تاریخچه) در یک پنجره poll هم‌پوشانی داشتند. حالا هر دو `data-visit-id` دارند و WS قبل از prepend چک می‌کند؛ بک‌اند هم `external_id` یکتا + سشن دارد. ترتیب همیشه جدیدترین‌اول (بک‌اند desc + مرتب‌سازی دفاعی کلاینت).

### online/offline
از آخرین fetch موفق: زیر ۱۰ ثانیه ONLINE، ۱۰ تا ۳۰ STALE، بیشتر OFFLINE (نه از باز بودن صفحه). خطای کانفیگ (توکن) polling را متوقف می‌کند؛ بقیه خطاها backoff ‏۳/۵/۱۰/۲۰/۳۰ ثانیه با سقف ۳۰ و دیتای قبلی حفظ می‌شود.

### لاگ توسعه
فقط روی localhost (`console.debug`): شروع poll، تعداد رکورد/نرمال‌شده/duplicate، خطاها، آخرین موفقیت. هیچ توکن/URL حساسی لاگ نمی‌شود (توکن فقط در env سرور: `WEIGHT_API_TOKEN`).

### اسکیمای persistence (معادل weight_records درخواستی)
| درخواستی | واقعی |
|---|---|
| device_id/serial/chicken_id/chicken_weight/feed_consumed | DeviceLog.sensor_id + flock `UKTECH-<serial>` / bird_id / weight_g / feed via Visit.feed_intake_g |
| tank_weight/elapsed_seconds | DeviceLog.feed_bin_kg / Visit.presence_s |
| event_timestamp/received_at/raw_payload/created_at | DeviceLog.timestamp/created_at + full row |
| unique constraint | `uq_log_cycle_external (cycle_id, external_id)` |
