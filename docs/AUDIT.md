# ARCHITECTURE AUDIT — BroilerLab/Arian (Phase 1)
> تاریخ: 2026-08-31 · شاخه: `main` @ `4f5cb9d` · scope: repo `arsalan-codes/BroilerLab`
> وضعیت: audit کامل شد؛ هیچ تغییر رفتاری داده نشده. تست baseline سبز: **4 passed**.

---

## 1. معماری فعلی (واقعیت، نه آرزو)

```
Browser ──► GitHub Pages (static root)  ──┐
        └─► Vercel Function (api/index.py)│ ──► Neon PostgreSQL (env: BROILER_DATABASE_URL)
                                          ┘
Local dev: webapp_server.py:8080 (gzip+SPA fallback) + uvicorn:8755 + docker pg:5434
```

- **Frontend:** vanilla JS، بدون build. ۱۲ فایل JS + یک `index.html` (2454 خط) + `fa/all.min.css`.
  هیچ ES-module/import وجود ندارد — همه اسکریپت‌ها IIFE با namespace سراسری (`window.Router`, `window.Auth`, `tr()` …).
- **Backend:** FastAPI تک‌فایلی (`backend/main.py` ~۵۰۰ خط) + `auth.py/config.py/models.py/processor.py/hub.py/mqtt_consumer.py/seed.py`.
- **DB:** SQLAlchemy 2 (declarative) با ۴ جدول: `users, cycles, visits, device_logs` — همه با FK به users، isolation با `WHERE user_id` در هر کوئری (fail-closed).
- **Deploy:** Pages (workflow `.github/workflows/deploy.yml`) + Vercel (`api/index.py` با بک‌اند vendored در `api/backend/` — پارتی که parity guard دارد).

## 2. قرارداد API (مرز ثابت مهاجرت)
۱۵ مسیر (لیست کامل در `tests/test_baseline.py::EXPECTED_ROUTES`):
`/api/health`, `auth/register|login|me|change-password`, `cycles CRUD + stats/visits/registrations/ingest`, `WS /ws/device`, `WS /ws/cycle/{id}`.

⚠️ **یافته audit:** فرانت (`auth.js:275-276`) به `/api/scenarios` و `/api/device/records` صدا می‌زند که **در بک‌اند وجود ندارند** (404 می‌خورند، اما `.catch(()=>{})` دارند و فقط آمار Workspace را خالی می‌گذارند). این باید یا endpoint بگیرد یا call حذف شود — در Phase 3.

## 3. بدهی فنی (به ترتیب ریسک)
| # | مورد | ریسک | فاز |
|---|------|------|-----|
| 1 | `index.html` ۲.۴k خط، CSS inline ~۱۲۰۰ خط | بالا (تغییر خطرناک) | 5 |
| 2 | `app.js` ~1800 خط: charts+state+UI+API مخلوط | بالا | 5 |
| 3 | `auth.js` هم JWT client است هم UI | متوسط | 5 |
| 4 | i18n: یک `i18n.js` ۷۲۱ خطی با dict inline — قابل مرکزی‌سازی | متوسط | 6 |
| 5 | duplicate کد: root/* و webapp/* (سینک دستی با `sync_webapp.sh`) | متوسط | 2-حل شده با guard، Phase 5 ریشه‌کنی |
| 6 | `ensure_admin_seed` + migration دستی `user_id` در `init_db` | متوسط | 4 (Alembic) |
| 7 | WS روی Vercel serverless (پلن رایگان) غیرپایدار | شناخته‌شده | مستند، مانع نیست |
| 8 | CORS `allow_origins=["*"]` | متوسط | 10 (سخت‌گیری با `BROILER_CORS_ORIGINS`) |

## 4. نقاط شکننده (دست نزن بدون تست)
- `backend/main.py` WEBAPP_DIR math و `_STATIC_FILES` — با Pages و Vercel هر دو سرو می‌شوند.
- `config.js` resolution (pages/vercel/localhost) — تغییرش هر دو محیط را می‌شکند.
- `api/backend/` vendored copy — **هر تغییر در `backend/` باید سینک شود** (حالا test parity داریم).
- ترتیب اسکریپت‌ها در `index.html`: `config.js` (بدون defer) قبل از بقیه.
- کلیدهای i18n بین `data-i18n` HTML و dict — هر افزودنی با اسکریپت missing-check.

## 5. فایل‌هایی که نباید بی‌دلیل دست بخورند
`vercel.json`, `api/index.py`, `api/backend/**`, `config.js`, `webapp_server.py`,
`.github/workflows/deploy.yml`, `fa/all.min.css`, `assets/*`.

## 6. ترتیب فازها (به‌روز شده پس از audit)
1. ✅ **Audit + baseline regression** — `tests/` (route surface, health contract, auth+isolation روی DB واقعی, vendored parity)
2. ✅ **Vercel** — فیکس و پایدار (vendored function + health db-state)
3. ✅ **Backend stabilize** (2026-08-31):
   - `/api/scenarios` → 200 [] (قرارداد پایدار) + `/api/device/records` → رکوردهای خام user-scoped
   - Pydantic کامل: RegisterIn/LoginIn/ChangePasswordIn/CycleIn/**IngestIn (extra=allow)** — صفر `dict=Body` باقی‌مانده
   - CORS env-aware: `BROILER_CORS_ORIGINS` (fallback `["*"]`)
   - ingest round-trip تست شد با فیلد اضافه فریم‌ور (extra passthrough سالم)
   - Suite: **6 passed**
4. ✅ **Alembic** (2026-08-31): `alembic.ini` + `migrations/env.py` + `versions/001_baseline.py`
   (users/cycles/visits/device_logs — مطابق مدل‌ها، بدون تخریب)؛ `init_db` با
   `BROILER_DB_MIGRATE=alembic` → `alembic upgrade head` (dev: create_all idempotent)؛
   تأیید: SQL آفلاین روی scratch Postgres اعمال شد → هر ۴ جدول + alembic_version ✓
5. ✅ **Frontend modularize** (2026-08-31):
   - `services/api.js` — client مرکزی (base/wsBase/token/fetch با 401 hook) — 7/7 unit tests
   - `auth.js` + `device-panel.js` — اتصال به `window.API` (حذف تکرار base-URL)
   - `utils/formatters.js` — façade بر `format*`
   - **`components/chart.js`** — chart engine (۷ تابع: rr..clearChart) — استخراج از app.js
   - **`services/export.js`** — export/row builders (۷ تابع: summaryRows..expTotals) — استخراج از app.js
   - app.js: 91KB → 82KB (-۱۰KB)
   - structure فعال: `services/`, `utils/`, `components/`, `locales/`
6. **i18n** — استخراج dict به `locales/{fa,en}/*.json`
7. **CI** — workflow: ruff + pytest روی هر push
8-10. logging/Sentry → multi-tenant (فقط طرح مدل `Organization`) → hardening

## 7. قواعد اجرا (ثابت)
- هر فاز: pytest سبز → diff review → commit مستقل با conventional message.
- هیچ endpoint/کلید i18n/CSS classname تغییر contract نمی‌کند بدون جستجوی کل repo.
- مهم‌ترین سنجه: **suite بعد از هر فاز باید همان ۴+ تست سبز را بدهد.**
