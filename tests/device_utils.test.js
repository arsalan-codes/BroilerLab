/* Node tests for services/device-utils.js (spec: failure/duplicates/
   bad-data/refresh/polling helpers). Run: node tests/device_utils.test.js */
"use strict";
var path = require("path");
var U = require(path.join("..", "services", "device-utils.js"));
var assert = require("assert");
var n = 0;
function ok(cond, msg) {
  n++;
  assert.ok(cond, msg);
}

// --- toNum: strict validation, no fake zeros ---
ok(U.toNum(null) === null, "null -> null");
ok(U.toNum(undefined) === null, "undefined -> null");
ok(U.toNum("") === null, "empty -> null");
ok(U.toNum("   ") === null, "blank -> null");
ok(U.toNum("N/A") === null, "N/A -> null");
ok(U.toNum("nan") === null, "nan string -> null");
ok(U.toNum("none") === null, "none -> null");
ok(U.toNum("-") === null, "dash -> null");
ok(U.toNum(NaN) === null, "NaN -> null");
ok(U.toNum(Infinity) === null, "Infinity -> null");
ok(U.toNum(true) === null, "bool -> null");
ok(U.toNum(0) === 0, "real zero preserved");
ok(U.toNum("0") === 0, "string zero preserved");
ok(U.toNum(219.34999999999999) === 219.34999999999999, "raw precision kept");
ok(U.toNum(" 455.20 ") === 455.2, "trims strings");

// --- formatWeight: display-only, 2 decimals, null-safe ---
ok(U.formatWeight(null) === "\u2014", "null -> em dash");
ok(U.formatWeight(undefined) === "\u2014", "undefined -> em dash");
ok(U.formatWeight("N/A") === "\u2014", "N/A -> em dash");
ok(U.formatWeight(NaN) === "\u2014", "NaN -> em dash");
ok(U.formatWeight(219.34999999999999, "en") === "219.35", "rounds en");
ok(U.formatWeight(6.7699999999999996, "en") === "6.77", "rounds en 2");
ok(U.formatWeight(456.7, "en") === "456.70", "pads en");
ok(U.formatWeight(0, "en") === "0.00", "real zero formats");
ok(U.formatWeight(219.35, "fa") === "\u06F2\u06F1\u06F9.\u06F3\u06F5", "fa digits");
ok(U.formatWeight(219.35, "fa").indexOf("g") === -1, "no unit appended");

// --- onlineStatus: ONLINE/STALE/OFFLINE from last success ---
var NOW = 1000000;
ok(U.onlineStatus(null, NOW) === "offline", "never -> offline");
ok(U.onlineStatus(0, NOW) === "offline", "zero -> offline");
ok(U.onlineStatus(NOW - 1000, NOW) === "online", "1s -> online");
ok(U.onlineStatus(NOW - 9999, NOW) === "online", "just under 10s");
ok(U.onlineStatus(NOW - 10000, NOW) === "stale", "10s boundary");
ok(U.onlineStatus(NOW - 20000, NOW) === "stale", "20s -> stale");
ok(U.onlineStatus(NOW - 30000, NOW) === "offline", "30s boundary");
ok(U.onlineStatus(NOW - 99999, NOW) === "offline", "old -> offline");
ok(U.onlineStatus(NOW + 5000, NOW) === "online", "future clamped");

// --- nextBackoffMs: 3/5/10/20/30 capped ---
ok(JSON.stringify([1, 2, 3, 4, 5, 6, 99].map(U.nextBackoffMs)) ===
   JSON.stringify([3000, 5000, 10000, 20000, 30000, 30000, 30000]),
   "backoff ladder");
ok(U.nextBackoffMs(0) === 3000, "zero fails -> base");

// --- sortNewestFirst: never trust API order ---
var rows = [
  { id: 1, timestamp: "2026-09-18T10:00:00Z" },
  { id: 2, timestamp: "2026-09-18T12:00:00Z" },
  { id: 3, timestamp: "2026-09-18T11:00:00Z" },
  { id: 4, timestamp: "garbage" },
];
var sorted = U.sortNewestFirst(rows);
ok(sorted.map(function (r) { return r.id; }).join(",") === "2,3,1,4",
   "newest first, bad dates sink");
ok(rows[0].id === 1, "input not mutated");
var regs = [
  { registered_at: "2026-09-18T10:00:00+00:00" },
  { registered_at: "2026-09-18T09:00:00+00:00" },
];
ok(U.sortNewestFirst(regs)[0].registered_at.indexOf("10:00") !== -1,
   "falls back to registered_at");

// --- dedupeKey / uniqueByKey ---
ok(U.dedupeKey({ id: 9 }) === "id:9", "real id wins");
ok(U.dedupeKey({ deviceId: "D", chickenId: "C", timestamp: "T", chickenWeight: 1 }) ===
   "cmp:D|C|T|1", "composite fallback");
var dupes = [
  { id: 1 }, { id: 1 },
  { sensor_id: "S", bird_id: "B", timestamp: "T", weight_g: 5 },
  { sensor_id: "S", bird_id: "B", timestamp: "T", weight_g: 5 },
  { sensor_id: "S", bird_id: "B", timestamp: "T", weight_g: 6 },
];
ok(U.uniqueByKey(dupes).length === 3, "dupes collapsed, distinct kept");
ok(U.uniqueByKey([]).length === 0, "empty safe");
ok(U.uniqueByKey(null).length === 0, "null safe");

console.log("device-utils: all " + n + " assertions passed");
