#!/usr/bin/env bash
# Keeps webapp/ (Vercel function bundle) identical to repo-root frontend (Pages source).
set -e
cd "$(dirname "$0")"
for f in index.html app.js auth.js config.js router.js i18n.js shamsi.js dialog.js device-panel.js engine.js strains.js stats.js xlsx.js favicon.png logo.svg; do
  [ -f "$f" ] && cp "$f" "webapp/$f"
done
cp -r assets/. webapp/assets/ 2>/dev/null || true
cp -r fa webapp/ 2>/dev/null || true
cp logo_*.png logo_*.webp webapp/ 2>/dev/null || true
cp -r data webapp/ 2>/dev/null || true
echo "webapp/ synced"
