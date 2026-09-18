/* =====================================================================
   Arian — device live-view pure helpers (services/device-utils.js)

   Dependency-free functions shared by device-panel.js and exercised by
   tests/device_utils.test.js under plain node (no DOM, no globals).
   In the browser they attach to window.DeviceUtils; under node they are
   exported via module.exports.
   ===================================================================== */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  } else {
    root.DeviceUtils = api;
  }
}(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var FA_DIGITS = ["\u06F0", "\u06F1", "\u06F2", "\u06F3", "\u06F4",
                   "\u06F5", "\u06F6", "\u06F7", "\u06F8", "\u06F9"];
  var BACKOFF_MS = [3000, 5000, 10000, 20000, 30000];
  var ONLINE_MS = 10000;
  var STALE_MS = 30000;

  /* Strict numeric coercion mirroring backend _to_float: null/""/"N/A"/
     NaN/Infinity (and friends) all become null — never a fake 0. */
  function toNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === "boolean") return null;
    if (typeof v === "string") {
      var s = v.trim();
      if (!s) return null;
      var low = s.toLowerCase();
      if (low === "n/a" || low === "na" || low === "nan" ||
          low === "none" || low === "null" || low === "-") return null;
      v = s;
    }
    var f = Number(v);
    if (!isFinite(f)) return null;
    return f;
  }

  /* Weight display ONLY (2 decimals, locale digits). Never feeds back into
     logic; the stored/backend value keeps full precision. Unit ("g") is
     added by the caller in the presentation layer. */
  function formatWeight(v, lang) {
    var f = toNum(v);
    if (f === null) return "\u2014";
    var s = f.toFixed(2);
    if (lang === "fa") {
      s = s.replace(/[0-9]/g, function (c) { return FA_DIGITS[+c]; });
    }
    return s;
  }

  /* Device online status from the last SUCCESSFUL fetch (never from mere
     page-openness): online <10s, stale 10-30s, offline otherwise/never. */
  function onlineStatus(lastSuccessMs, nowMs) {
    if (!lastSuccessMs) return "offline";
    var dt = nowMs - lastSuccessMs;
    if (dt < 0) dt = 0;
    if (dt < ONLINE_MS) return "online";
    if (dt < STALE_MS) return "stale";
    return "offline";
  }

  /* Progressive retry delays: 3s, 5s, 10s, 20s, 30s (capped). failCount is
     the number of CONSECUTIVE failures (>=1). Resets on success. */
  function nextBackoffMs(failCount) {
    var i = (failCount | 0) - 1;
    if (i < 0) i = 0;
    if (i >= BACKOFF_MS.length) i = BACKOFF_MS.length - 1;
    return BACKOFF_MS[i];
  }

  /* Newest-first sort WITHOUT trusting API order. Records with unparsable
     timestamps sink to the end, input order otherwise preserved (stable). */
  function sortNewestFirst(records, getTs) {
    var get = getTs || function (r) { return r && (r.timestamp || r.registered_at); };
    return (records || []).slice().map(function (r, i) {
      var t = Date.parse(get(r));
      return { r: r, i: i, t: isNaN(t) ? -Infinity : t };
    }).sort(function (a, b) {
      if (b.t !== a.t) return b.t - a.t;
      return a.i - b.i;
    }).map(function (x) { return x.r; });
  }

  /* Deterministic dedupe key: real upstream id when present, otherwise the
     device|bird|timestamp|weight composite from the spec. */
  function dedupeKey(r) {
    if (!r) return "null";
    if (r.id !== null && r.id !== undefined && r.id !== "") {
      return "id:" + String(r.id);
    }
    var dev = r.deviceId || r.device_id || r.sensor_id || "";
    var bird = r.chickenId || r.chicken_id || r.bird_id || "";
    var ts = r.timestamp || r.registered_at || "";
    var w = r.chickenWeight != null ? r.chickenWeight
          : (r.chicken_weight != null ? r.chicken_weight : r.weight_g);
    return "cmp:" + dev + "|" + bird + "|" + ts + "|" + String(w);
  }

  /* First-wins dedupe preserving order (for merging polled pages). */
  function uniqueByKey(records, keyFn) {
    var seen = {};
    var out = [];
    (records || []).forEach(function (r) {
      var k = (keyFn || dedupeKey)(r);
      if (!Object.prototype.hasOwnProperty.call(seen, k)) {
        seen[k] = true;
        out.push(r);
      }
    });
    return out;
  }

  return {
    BACKOFF_MS: BACKOFF_MS,
    ONLINE_MS: ONLINE_MS,
    STALE_MS: STALE_MS,
    toNum: toNum,
    formatWeight: formatWeight,
    onlineStatus: onlineStatus,
    nextBackoffMs: nextBackoffMs,
    sortNewestFirst: sortNewestFirst,
    dedupeKey: dedupeKey,
    uniqueByKey: uniqueByKey
  };
}));
