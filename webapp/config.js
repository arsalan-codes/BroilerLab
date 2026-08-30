/* Arian runtime configuration — loaded before app/auth/device-panel.
   API base resolution order:
     1. window.BROILER_API_OVERRIDE  (manual override, e.g. ?api= or injected script)
     2. same-origin                  (Vercel deployment serves /api via rewrite; local dev)
     3. PROD_API_FALLBACK            (GitHub Pages mirror -> Vercel backend URL)
   Set PROD_API_FALLBACK to the Vercel deployment URL after the first deploy. */
(function () {
  var h = window.location;
  var isPages = h.hostname.indexOf("github.io") > -1;
  var sameOriginOK = h.protocol === "http:" && (h.hostname === "localhost" || h.hostname === "127.0.0.1");
  var onVercel = h.hostname.indexOf(".vercel.app") > -1 || (h.protocol === "https:" && !isPages && window.ARIAN_API_SAME_ORIGIN === true);
  var PROD_API_FALLBACK = window.ARIAN_PROD_API || "";  // e.g. "https://arian-xyz.vercel.app"
  var base = "";
  try {
    if (window.BROILER_API_OVERRIDE) base = window.BROILER_API_OVERRIDE;
    else if (onVercel || sameOriginOK) base = h.origin;
    else if (isPages && PROD_API_FALLBACK) base = PROD_API_FALLBACK;
    else base = h.origin;                                // last resort: same origin
  } catch (e) { base = ""; }
  window.BROILER_API = String(base).replace(/\/+$/, "");
})();
