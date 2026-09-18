# ققنوس | سامانه هوشمند پرورش و اصلاح نژاد

شبیه‌ساز آکادمیک چندسویه (Ross 308 / Cobb 500 / Arbor Acres Plus / Hubbard Efficiency Plus) با دستگاه پایش مصرف خوراک (RFID + لودسل) — داده‌محور، کاربرمحور، ایزوله per-user.

## اجرای محلی

```bash
# Backend (FastAPI + PostgreSQL 5434)
cd backend
BROILER_DB_PORT=5434 BROILER_DB_PASS=«پسورد دیتابیس — از env» .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8755

# Frontend
python3 webapp_server.py  # http://127.0.0.1:8080
```

## متغیرهای محیطی
`BROILER_DB_HOST/PORT/NAME/USER/PASS`, `BROILER_JWT_SECRET`, `BROILER_API_PORT`

## معماری
`webapp/` SPA vanilla JS + `backend/` FastAPI + PostgreSQL (per-user CASCADE) + MQTT/WS + `simulator.py` engine

# ESP32 Direct Ingestion

```text
ESP32
  │  HTTPS + X-Device-Key
  ▼
Vercel (FastAPI POST /api/device/ingest)
  │  Device Authentication (SHA256 key, active?)
  ▼
Device → Cycle Mapping (server-side; firmware never picks a cycle)
  │  timestamp validation + event_id idempotency
  ▼
Existing CycleProcessor (get_processor(cycle_id).ingest)
  │
  ├── DeviceLog
  └── Visit
        │
        ▼
     Neon PostgreSQL
        │
        ▼
 BroilerLab Dashboard (same registrations/stats/live UI)
```

1. **ساخت دوره** در داشبورد (مثل همیشه).
2. **ثبت دستگاه**: `POST /api/devices` با JWT کاربر (`device_id`, `name`, `cycle_id`) — از کارت «دستگاه‌های ESP32» صفحه device هم می‌شود.
3. **کپی کلید** `BLD_...` — فقط همین یک‌بار نمایش داده می‌شود (هش SHA256 ذخیره می‌شود، برگشت‌ناپذیر).
4. **کانفیگ ESP32**: `esp32/config.example.h` را به `esp32/config.h` کپی کنید (git-ignored)، وای‌فای + آدرس API + کلید + root CA را بگذارید. جزئیات کامل: `esp32/README.md`.
5. **اتصال**: ESP32 به وای‌فای وصل می‌شود، با NTP ساعت را سینک می‌کند (اجباری — ساعت 1970 رد می‌شود)، بعد هر رویداد را می‌فرستد:
```json
{
  "event_id": "esp32-feedstation-01:8F21A4:10492",
  "timestamp": "2026-09-18T12:30:00Z",
  "event": "entry",
  "bird_id": "RFID-001",
  "sensor_id": "ESP32-01",
  "weight_g": 1825.4,
  "feed_bin_kg": 22.4,
  "temp_c": 24.5,
  "humidity": 58.3,
  "firmware": "1.0.0"
}
```
فیلدهای اضافه آزادند؛ `cycle_id`/`user_id`/`owner` ممنوع‌اند (400). `timestamp` باید ISO-8601 با timezone صریح (Z) باشد؛ خالی = زمان سرور.
6. **تعیین دوره**: سرور از روی کلید، دستگاه → دوره → کاربر را پیدا می‌کند. دستکاری دوره از سمت دستگاه بی‌اثر/مردود است.
7. **رسیدن به Neon**: همان `CycleProcessor` و همان جدول‌ها (`DeviceLog` با `external_id = dev:<sha256…>` برای idempotency، بعد `Visit`) — دیتا در `registrations`/`stats`/لایو دیده می‌شود.
8. **تأیید در داشبورد**: کارت دستگاه‌ها `last_seen_at` و `online` را نشان می‌دهد؛ ردیف‌های جدید در جدول ثبت‌نامی‌ها می‌آیند.
9. **عیب‌یابی**: `401` کلید اشتباه، `403` دستگاه غیرفعال/دوره حذف‌شده، `400` payload/ساعت، `429` ریت‌لیمیت، `200 + duplicate:true` ارسال تکراری (سالم).

## تست با cURL

```bash
curl -X POST \
  "https://YOUR_PROJECT.vercel.app/api/device/ingest" \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: YOUR_DEVICE_KEY" \
  -d '{
    "event_id": "test-device:1",
    "timestamp": "2026-09-18T12:30:00Z",
    "event": "entry",
    "bird_id": "RFID-001",
    "sensor_id": "ESP32-TEST",
    "weight_g": 1825.4,
    "temp_c": 24.5,
    "humidity": 58.2,
    "feed_delta_g": 3.2
  }'
```

Batch (حداکثر `DEVICE_MAX_BATCH` رویداد، نتیجه per-event):

```bash
curl -X POST \
  "https://YOUR_PROJECT.vercel.app/api/device/ingest/batch" \
  -H "Content-Type: application/json" \
  -H "X-Device-Key: YOUR_DEVICE_KEY" \
  -d '{"events": [
    {"event_id": "test-device:2", "timestamp": "2026-09-18T12:30:02Z", "bird_id": "RFID-001", "weight_g": 1821.0},
    {"event_id": "test-device:2", "timestamp": "2026-09-18T12:30:02Z", "bird_id": "RFID-001", "weight_g": 1821.0}
  ]}'
```

## اجرای محلی و مایگریشن

```bash
# تست‌ها
python -m pytest tests/ -q
# مایگریشن رسمی (پروداکشن): BROILER_DB_MIGRATE=alembic (جدول devices = 012_devices)
alembic upgrade head
```
