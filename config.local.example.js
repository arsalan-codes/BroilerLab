/* =====================================================================
   Arian — LOCAL DEPLOYMENT OVERRIDES (edit this file, never commit it)
   ---------------------------------------------------------------------
   On GitHub Pages the frontend is static; the FastAPI backend runs on
   Vercel (api/ + vercel.json) with a hosted PostgreSQL (e.g. Neon).
   After your FIRST Vercel deploy you get a URL like:

       https://arian-<something>.vercel.app

   1. Copy config.local.example.js -> config.local.js
   2. Put that URL below.
   3. The Pages mirror then talks to the Vercel backend (CORS is open).

   This file is git-ignored (see .gitignore) so secrets/URLs never leak.
   ===================================================================== */
window.ARIAN_PROD_API = ""; // e.g. "https://arian-your-team.vercel.app"
