/* =====================================================================
   Arian — formatting utilities (utils/formatters.js)
   Thin facade over the centralized i18n formatters (i18n.js exposes them
   on window.format*). Future modules import these instead of reaching
   into the i18n global directly.
   ===================================================================== */
"use strict";
(function () {
  function pick(name, fb) {
    return (typeof window[name] === "function") ? window[name] : fb;
  }
  window.FMT = {
    number:   function (v) { return pick("formatNumber", function (x) { return String(x); })(v); },
    date:     function (v) { return pick("formatDate", function (x) { return String(x); })(v); },
    time:     function (v) { return pick("formatTime", function (x) { return String(x); })(v); },
    dateTime: function (v) { return pick("formatDateTime", function (x) { return String(x); })(v); },
    relative: function (v) { return pick("formatRelativeTime", function (x) { return String(x); })(v); },
    currency: function (v) { return pick("formatCurrency", function (x) { return String(x); })(v); },
    percent:  function (v) { return pick("formatPercent", function (x) { return String(x); })(v); },
    /* locale-aware digit formatting (fa digits / en) */
    digits:   function (v) { return pick("num", function (x) { return String(x); })(v); },
  };
})();
