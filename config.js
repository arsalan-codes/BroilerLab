/* Arian runtime configuration — loaded before app/auth/device-panel.
   On GitHub Pages the frontend is static; the API base must point at the
   FastAPI host. Same-origin is tried first (custom domain / reverse proxy),
   otherwise the deploy-time constant below. */
window.BROILER_API = (function () {
  try {
    var h = window.location;
    // same-origin backend (served behind reverse proxy or custom domain with /api)
    if (h.protocol === "http:" || (h.hostname === "localhost" || h.hostname === "127.0.0.1")) {
      return h.origin;                       // dev: uvicorn also serves static on same origin
    }
    // production: explicit API host — set by CI or edited manually
    return window.BROILER_API_OVERRIDE || "https://arian-api.arsalan-codes.workers.dev";
  } catch (e) { return ""; }
})();
