#!/usr/bin/env bash
# Keeps deploy mirrors identical to the source of truth:
#   webapp/      <- repo-root frontend (Vercel serves root files; tests pin webapp/)
#   api/backend/ <- backend/           (Vercel serverless bundle; pinned by
#                                       tests/test_vendored_parity.py)
#   404.html     <- index.html         (GitHub Pages SPA fallback for clean URLs)
set -e
cd "$(dirname "$0")"

# --- frontend files (root -> webapp/) ---
for f in index.html 404.html app.js auth.js config.js config.local.js router.js version.js \
         i18n.js shamsi.js dialog.js device-panel.js engine.js strains.js \
         stats.js xlsx.js dd-select.js env-control.js favicon.png logo.svg; do
  [ -f "$f" ] && cp "$f" "webapp/$f"
done
for d in assets fa data locales services components utils; do
  [ -d "$d" ] && { mkdir -p "webapp/$d"; cp -r "$d/." "webapp/$d/"; }
done
cp logo_*.png logo_*.webp webapp/ 2>/dev/null || true

# --- backend (backend/ -> api/backend/) ---
for f in backend/*.py; do
  cp "$f" "api/backend/$(basename "$f")"
done

echo "mirrors synced (webapp/ + api/backend/)"
