/*
 * BroilerLab — Shamsi (Jalali / Persian) date utilities
 * Self-contained, no external dependency (works offline).
 *
 * Method: day-offset from a fixed anchor (Nowruz 1405 = 2026-03-21, Tehran).
 * Both the anchor and the input are converted to UTC ms via Date.UTC so
 * timezone / DST differences cancel out. Jalali month lengths then account
 * for leap years (Esfand = 30 in leap years 1402, 1406, 1410, ...).
 *
 * Public API:
 *   window.Shamsi.toShamsi(input, opts)
 *       input : ISO string "YYYY-MM-DD" / "...THH:MM:SS+03:30" / Date
 *       opts  : { withTime:bool, longMonth:bool }
 *       → "۱۴۰۵/۰۶/۰۵" یا "۱۴۰۵/۰۶/۰۵ ۱۵:۵۵"
 *   window.Shamsi.today() → { jy, jm, jd }
 */
(function () {
  "use strict";

  // Jalali month lengths (Esfand is 29, or 30 in a leap year)
  var JDAYS = [31, 31, 31, 31, 31, 31, 30, 30, 30, 30, 30, 29];

  // Nowruz 1405 = 2026-03-21 12:00 Asia/Tehran = 2026-03-21 08:30 UTC.
  // Noon avoids the DST midnight gap (Iran springs forward at 00:00 on Mar 21).
  var ANCHOR_MS = Date.UTC(2026, 2, 21, 8, 30, 0);

  // Jalali leap year: year Y is leap iff (Y+11)*31 % 128 < 31  is WRONG for
  // the 33-year cycle. Correct rule (equivalent to the 2820-yr astronomical
  // cycle, valid AD 1178–2242): a year is leap if (Y % 33) ∈ {1,5,9,13,17,22,26,30}.
  function jLeap(jy) {
    var r = ((jy % 33) + 33) % 33;
    return r === 1 || r === 5 || r === 9 || r === 13 || r === 17 || r === 22 || r === 26 || r === 30;
  }

  function daysInMonth(jm, jy) {
    if (jm === 12) return jLeap(jy) ? 30 : 29;
    return JDAYS[jm - 1];
  }

  function toJalaaliFromMs(ms) {
    // Normalize to local noon of the input day so midnight/DST boundaries
    // never shift the Jalali day by ±1.
    var d = new Date(ms);
    var localNoon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
    var dayDiff = Math.round((localNoon.getTime() - ANCHOR_MS) / 86400000);
    var jy = 1405, jm = 1, jd = 1 + dayDiff;
    // advance
    while (jd > daysInMonth(jm, jy)) {
      jd -= daysInMonth(jm, jy);
      jm++;
      if (jm > 12) { jm = 1; jy++; }
    }
    // step back
    while (jd < 1) {
      jm--;
      if (jm < 1) { jm = 12; jy--; }
      jd += daysInMonth(jm, jy);
    }
    return { jy: jy, jm: jm, jd: jd };
  }

  var FA_DIGITS = ["۰", "۱", "۲", "۳", "۴", "۵", "۶", "۷", "۸", "۹"];
  function digits(n) {
    var s = String(n);
    if (typeof LANG !== "undefined" && LANG === "fa") {
      return s.replace(/[0-9]/g, function (c) { return FA_DIGITS[+c]; });
    }
    return s;
  }
  function pad2(n) { return n < 10 ? "0" + n : "" + n; }

  var MONTHS_FA = ["فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور",
    "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"];

  function toShamsi(input, opts) {
    opts = opts || {};
    var d;
    if (input instanceof Date) d = input;
    else if (typeof input === "string") {
      var s = input.trim().replace("Z", "+00:00");
      s = s.replace(/([+-]\d{2})(\d{2})$/, "$1:$2");
      d = new Date(s);
      if (isNaN(d.getTime())) {
        var m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
      }
    }
    if (!d || isNaN(d.getTime())) return typeof input === "string" ? input : "—";

    var j = toJalaaliFromMs(d.getTime());
    var dateStr;
    if (opts.longMonth) {
      dateStr = digits(j.jd) + " " + MONTHS_FA[j.jm - 1] + " " + digits(j.jy);
    } else {
      dateStr = digits(j.jy) + "/" + digits(pad2(j.jm)) + "/" + digits(pad2(j.jd));
    }
    if (opts.withTime) {
      var t = digits(pad2(d.getHours())) + ":" + digits(pad2(d.getMinutes()));
      return dateStr + " " + t;
    }
    return dateStr;
  }

  function today() {
    return toJalaaliFromMs(new Date().getTime());
  }

  window.Shamsi = { toShamsi: toShamsi, today: today, toJalaaliFromMs: toJalaaliFromMs };
})();
