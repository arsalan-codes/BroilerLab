# ققنوس | سامانه هوشمند پرورش و اصلاح نژاد

شبیه‌ساز آکادمیک چندسویه (Ross 308 / Cobb 500 / Arbor Acres Plus / Hubbard Efficiency Plus) با دستگاه پایش مصرف خوراک (RFID + لودسل) — داده‌محور، کاربرمحور، ایزوله per-user.

## اجرای محلی

```bash
# Backend (FastAPI + PostgreSQL 5434)
cd backend
BROILER_DB_PORT=5434 BROILER_DB_PASS=broiler_dev .venv/bin/uvicorn main:app --host 127.0.0.1 --port 8755

# Frontend
python3 webapp_server.py  # http://127.0.0.1:8080
```

## متغیرهای محیطی
`BROILER_DB_HOST/PORT/NAME/USER/PASS`, `BROILER_JWT_SECRET`, `BROILER_API_PORT`

## معماری
`webapp/` SPA vanilla JS + `backend/` FastAPI + PostgreSQL (per-user CASCADE) + MQTT/WS + `simulator.py` engine
