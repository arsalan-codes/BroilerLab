/* =====================================================================
   Arian — Centralized API client (services/api.js)
   Single source of truth for backend communication.
   Depends on: config.js (window.ARIAN_API)
   Loaded before: all page/component modules
   ===================================================================== */
"use strict";
(function () {
  var base = (window.ARIAN_API || "http://127.0.0.1:8755").replace(/\/+$/, "");
  var wsBase = base.replace(/^http/, "ws");

  function authHeaders() {
    var tok;
    try { tok = localStorage.getItem("arian_token") || ""; } catch (e) { tok = ""; }
    return tok ? { "Authorization": "Bearer " + tok } : {};
  }

  function api(path, opts) {
    opts = opts || {};
    var url = base + path;
    var headers = Object.assign(
      { "Content-Type": "application/json" },
      authHeaders(),
      opts.headers || {}
    );
    var init = {
      method: opts.method || "GET",
      headers: headers,
    };
    if (opts.body != null && opts.method !== "GET") {
      init.body = typeof opts.body === "string" ? opts.body : JSON.stringify(opts.body);
    }
    var signal = opts.signal || null;
    if (signal) init.signal = signal;

    return fetch(url, init).then(function (r) {
      if (r.status === 401) {
        // Fail-closed: clear stale auth, gate UI, notify
        try { localStorage.removeItem("arian_token"); localStorage.removeItem("arian_user"); localStorage.removeItem("broiler_token"); localStorage.removeItem("broiler_user"); } catch (e) {}
        window.ARIAN_TOKEN = "";
        window.ARIAN_USER = null;
        if (typeof window.reportUnauthorized === "function") window.reportUnauthorized();
        var msg = "Unauthorized";
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.detail || msg);
        });
      }
      if (!r.ok) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          throw new Error(j.detail || ("HTTP " + r.status));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  window.API = {
    base: base,
    wsBase: wsBase,
    fetch: api,
    get: function (path) { return api(path, { method: "GET" }); },
    post: function (path, body) { return api(path, { method: "POST", body: body }); },
    del: function (path) { return api(path, { method: "DELETE" }); },
    /* ws(url) returns a WebSocket targeting the backend; url is relative e.g. "/ws/device" */
    ws: function (url) {
      return new WebSocket(wsBase + url);
    },
    /* raw token from storage (for direct fetch calls outside this module) */
    token: function () {
      try { return localStorage.getItem("arian_token") || localStorage.getItem("broiler_token") || ""; } catch (e) { return ""; }
    },
  };
})();