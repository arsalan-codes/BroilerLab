/* Arian — Climate Control (v-env) module.
   Live MQTT telemetry: tiles, house chart, machine-vision health,
   hardware table, Excel export. Backend contract:
     GET  /api/env/summary            -> { houses:[{id,name,online,tiles:{temp,rh,bed,feed,water,nh3,o2,fan,light}, health:{activity,distribution,respiratory,alert}, devices:[{id,metric,rssi,last,state}] }], series:{t:[{h:houseId,temps:[...]}]} }
     GET  /api/env/export?scope=hour|day|month|range&from&to -> xlsx stream
   Polls summary every 5s (fast path); degrades to demo data offline. */
(function () {
  "use strict";
  var API = (window.API && window.API.base) || (window.BROILER_API || "").replace(/\/+$/, "");
  var POLL_MS = 5000;
  var HOUSES = [
    { id: 1, name: "House 1" }, { id: 2, name: "House 2" }, { id: 3, name: "House 3" }
  ];
  var METRICS = [
    { k: "temp",  ic: "🌡️", unit: "°C", min: 18, max: 34 },
    { k: "rh",    ic: "💧", unit: "%",  min: 40, max: 75 },
    { k: "bed",   ic: "🌾", unit: "%",  min: 15, max: 40 },
    { k: "feed",  ic: "🌽", unit: "kg", min: 0,  max: 600 },
    { k: "water", ic: "🚰", unit: "L",  min: 0,  max: 900 },
    { k: "nh3",   ic: "☠️", unit: "ppm",min: 0,  max: 25 },
    { k: "o2",    ic: "🫁", unit: "%",  min: 18, max: 22 },
    { k: "fan",   ic: "🌀", unit: "%",  min: 0,  max: 100 },
    { k: "light", ic: "💡", unit: "lux",min: 0,  max: 60 }
  ];
  var CUR = { house: 1, data: null, timer: null, canvas: null };

  function tr(k, fb) { try { return window.tr ? window.tr(k) : (fb || k); } catch (e) { return fb || k; } }
  function fmt(v, d) { try { return window.lnum ? window.lnum(v, d == null ? 1 : d) : (+v).toFixed(d == null ? 1 : d); } catch (e) { return v; } }
  function tok() { try { return (window.Auth && window.Auth.getToken && window.Auth.getToken()) || localStorage.getItem("broiler_token") || localStorage.getItem("arian_token") || ""; } catch (e) { return ""; } }

  function level(m, v) {
    if (v == null || isNaN(v)) return "";
    var t = (m.max - m.min) * 0.18;
    if (m.k === "nh3") return v > 20 ? "bad" : v > 12 ? "warn" : "";
    if (m.k === "o2")  return v < 19 ? "bad" : v < 19.5 ? "warn" : "";
    if (v < m.min - t || v > m.max + t) return "bad";
    if (v < m.min || v > m.max) return "warn";
    return "";
  }

  function demo() {
    function rnd(a, b, d) { return +(a + Math.random() * (b - a)).toFixed(d == null ? 1 : d); }
    return {
      houses: HOUSES.map(function (h, hi) {
        var base = 26 + hi * 0.6 + rnd(-1, 1);
        return {
          id: h.id, name: h.name, online: hi !== 2,
          tiles: {
            temp: base, rh: rnd(52, 64), bed: rnd(22, 30), feed: rnd(320, 520, 0),
            water: rnd(480, 720, 0), nh3: rnd(6, 16), o2: rnd(19.6, 20.8),
            fan: rnd(35, 85, 0), light: rnd(10, 45, 0)
          },
          health: { activity: rnd(78, 96), distribution: rnd(82, 95), respiratory: rnd(90, 99, 0), alert: hi === 1 ? 2 : 0 },
          devices: [
            { id: "ENV-" + h.id + "01", metric: "temp", rssi: rnd(-72, -55, 0), last: "2s", state: "ok" },
            { id: "ENV-" + h.id + "02", metric: "rh", rssi: rnd(-78, -58, 0), last: "3s", state: "ok" },
            { id: "ENV-" + h.id + "03", metric: "nh3", rssi: rnd(-80, -60, 0), last: hi === 2 ? "128s" : "4s", state: hi === 2 ? "offline" : "ok" },
            { id: "CAM-" + h.id, metric: "vision", rssi: rnd(-66, -52, 0), last: "1s", state: "ok" }
          ]
        };
      }),
      series: { temps: [24.2, 24.6, 25.1, 24.8, 25.3, 25.9, 26.2, 25.8, 26.1, 26.4] }
    };
  }

  function fetchSummary() {
    if (!API) return Promise.resolve(null);
    return fetch(API + "/api/env/summary", {
      headers: { Authorization: "Bearer " + tok() }
    }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  function renderHouses(d) {
    var wrap = document.getElementById("env-houses");
    if (!wrap) return;
    wrap.innerHTML = "";
    d.houses.forEach(function (h) {
      var b = document.createElement("button");
      b.className = "env-house" + (h.id === CUR.house ? " on" : "");
      b.setAttribute("role", "tab");
      b.innerHTML = '<span class="dot"></span><span>' + h.name + "</span><b>" +
        (h.online ? fmt(h.tiles.temp) + "°" : tr("env.state.offline", "Offline")) + "</b>";
      b.addEventListener("click", function () { CUR.house = h.id; renderAll(CUR.data); });
      wrap.appendChild(b);
    });
  }

  function renderBanner(d) {
    var el = document.getElementById("env-banner");
    if (!el) return;
    var h = d.houses.filter(function (x) { return x.id === CUR.house; })[0] || d.houses[0];
    var t = h.tiles || {};
    var offline = !h.online;
    var warn = !offline && ((t.nh3 != null && t.nh3 > 12) || (t.o2 != null && t.o2 < 19.5));
    el.classList.toggle("warn", warn && !offline);
    el.classList.toggle("bad", offline);
    var title = el.querySelector("b"), sub = el.querySelector("small");
    if (title) title.textContent = offline ? tr("env.banner.bad") : warn ? tr("env.banner.warn") : tr("env.banner.ok");
    if (sub) sub.textContent = tr("env.banner.sub");
    var kpis = document.getElementById("env-banner-kpis");
    if (kpis) {
      var items = [
        { k: "temp", v: t.temp, u: "°C", d: 1 },
        { k: "rh", v: t.rh, u: "%", d: 0 },
        { k: "nh3", v: t.nh3, u: "ppm", d: 0 },
        { k: "fan", v: t.fan, u: "%", d: 0 }
      ];
      kpis.innerHTML = items.map(function (it) {
        return '<div class="env-kpi"><b>' + (it.v == null ? "—" : fmt(it.v, it.d)) +
          '<small> ' + it.u + '</small></b><span>' + tr("env.banner.kpi." + it.k) + "</span></div>";
      }).join("");
    }
  }

  function renderTiles(d) {
    var wrap = document.getElementById("env-tiles");
    if (!wrap) return;
    var h = d.houses.filter(function (x) { return x.id === CUR.house; })[0] || d.houses[0];
    wrap.innerHTML = "";
    METRICS.forEach(function (m) {
      var v = h.tiles[m.k];
      var lv = level(m, v);
      var pct = v == null ? 0 : Math.max(0, Math.min(100, ((v - m.min) / (m.max - m.min)) * 100));
      var el = document.createElement("div");
      el.className = "env-tile " + lv;
      el.innerHTML =
        '<div class="tl"><span>' + m.ic + "</span><span>" + tr("env.metric." + m.k) + '</span><span class="tic">' + m.ic + "</span></div>" +
        '<div class="tv">' + (v == null ? "—" : fmt(v)) + " <small>" + m.unit + "</small></div>" +
        '<div class="tb"><i style="width:' + pct.toFixed(0) + '%"></i></div>';
      wrap.appendChild(el);
    });
  }

  function renderHealth(d) {
    var wrap = document.getElementById("env-health");
    if (!wrap) return;
    var h = d.houses.filter(function (x) { return x.id === CUR.house; })[0] || d.houses[0];
    var items = [
      { k: "activity", v: h.health.activity, unit: "%", st: h.health.activity > 85 ? "ok" : h.health.activity > 75 ? "wn" : "bad" },
      { k: "distribution", v: h.health.distribution, unit: "%", st: h.health.distribution > 88 ? "ok" : h.health.distribution > 78 ? "wn" : "bad" },
      { k: "respiratory", v: h.health.respiratory, unit: "%", st: h.health.respiratory > 95 ? "ok" : h.health.respiratory > 88 ? "wn" : "bad" },
      { k: "alert", v: h.health.alert, unit: "", st: h.health.alert > 0 ? "wn" : "ok" }
    ];
    wrap.innerHTML = "";
    items.forEach(function (it) {
      var el = document.createElement("div");
      el.className = "env-hcard " + it.st;
      el.innerHTML =
        '<div class="hh">👁️ <span>' + tr("env.health." + it.k) + "</span></div>" +
        '<div class="hv">' + fmt(it.v, it.k === "alert" ? 0 : 0) + (it.unit ? '<small style="font-size:12px">' + it.unit + "</small>" : "") + "</div>" +
        '<div class="hs">' + (it.k === "alert" ? (it.v > 0 ? tr("env.state.warn") : tr("env.state.ok")) : it.st === "ok" ? tr("env.state.ok") : it.st === "wn" ? tr("env.state.warn") : tr("env.state.bad")) + "</div>";
      wrap.appendChild(el);
    });
  }

  function renderHw(d) {
    var tb = document.getElementById("tb-env-hw");
    if (!tb) return;
    var h = d.houses.filter(function (x) { return x.id === CUR.house; })[0] || d.houses[0];
    tb.innerHTML = "";
    h.devices.forEach(function (dev) {
      var tr_ = document.createElement("tr");
      var st = dev.state === "ok" ? '<span class="tag ok">' + tr("env.state.ok") + "</span>"
        : dev.state === "offline" ? '<span class="tag bl">' + tr("env.state.offline") + "</span>"
        : '<span class="tag bd">' + tr("env.state.bad") + "</span>";
      tr_.innerHTML =
        "<td><code>" + dev.id + "</code></td>" +
        "<td>" + tr("env.metric." + dev.metric, dev.metric) + "</td>" +
        '<td class="num">' + dev.rssi + " dBm</td>" +
        "<td>" + dev.last + "</td>" +
        "<td>" + st + "</td>";
      tb.appendChild(tr_);
    });
  }

  function drawChart(d) {
    var c = document.getElementById("env-chart");
    if (!c || !window.CanvasChart) return;
    var temps = (d.series && d.series.temps) || [];
    var labels = temps.map(function (_, i) { return String(i + 1); });
    try {
      window.CanvasChart.line(c, { labels: labels, datasets: [{ label: "°C", data: temps }] },
        { yMin: 18, yMax: 34, legend: false });
    } catch (e) { /* chart lib optional */ }
  }

  function renderAll(d) {
    if (!d) return;
    CUR.data = d;
    renderBanner(d); renderHouses(d); renderTiles(d); renderHealth(d); renderHw(d); drawChart(d);
  }

  function tick(force) {
    fetchSummary().then(function (live) {
      renderAll(live || CUR.data || demo());
      if (force) renderAll(CUR.data);
    });
  }

  function start() {
    if (CUR.timer) return;
    tick(true);
    CUR.timer = setInterval(function () { tick(false); }, POLL_MS);
  }
  function stop() { if (CUR.timer) { clearInterval(CUR.timer); CUR.timer = null; } }

  var SCOPE = "hour";
  function setScope(scope) {
    SCOPE = scope;
    var wrap = document.getElementById("env-scope");
    if (wrap) wrap.querySelectorAll("button").forEach(function (b) {
      b.classList.toggle("on", b.getAttribute("data-scope") === scope);
    });
    var range = document.getElementById("env-range-fields");
    if (range) range.classList.toggle("hidden", scope !== "range");
  }

  function exportXlsx(scope) {
    var lbl = document.getElementById("env-exp-lbl");
    var from = (document.getElementById("env-exp-from") || {}).value || "";
    var to = (document.getElementById("env-exp-to") || {}).value || "";
    var qs = "scope=" + encodeURIComponent(scope) + "&house=" + CUR.house +
      (from ? "&from=" + from : "") + (to ? "&to=" + to : "");
    var url = (API || "") + "/api/env/export?" + qs;
    if (lbl) { lbl.className = "env-exp-status busy"; lbl.textContent = ""; }
    fetch(url, { headers: { Authorization: "Bearer " + tok() } })
      .then(function (r) {
        if (!r.ok) throw new Error("http " + r.status);
        return r.blob().then(function (b) {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(b);
          a.download = "Arian_env_trends_" + scope + ".xlsx";
          document.body.appendChild(a); a.click(); a.remove();
          if (lbl) { lbl.className = "env-exp-status done"; lbl.textContent = tr("env.export.done"); }
        });
      })
      .catch(function () {
        if (lbl) { lbl.className = "env-exp-status err"; lbl.textContent = "✗ " + scope; }
      });
  }

  function bind() {
    var wrap = document.getElementById("env-scope");
    if (wrap) wrap.addEventListener("click", function (e) {
      var b = e.target.closest("button[data-scope]");
      if (b) setScope(b.getAttribute("data-scope"));
    });
    var go = document.getElementById("btn-env-exp-go");
    if (go) go.addEventListener("click", function () { exportXlsx(SCOPE); });
    window.addEventListener("arian:route", function (e) {
      if (e && e.detail && e.detail.view === "v-env") start(); else stop();
    });
    // also start when the tab is clicked (router event may carry no detail)
    document.addEventListener("click", function (e) {
      var t = e.target.closest && e.target.closest('.tab[data-v="v-env"]');
      if (t) start();
    });
    window.addEventListener("rossim:lang", function () { if (CUR.data) renderAll(CUR.data); });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind);
  else bind();

  window.EnvControl = { start: start, stop: stop, tick: tick };
})();
