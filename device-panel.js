/*
 * BroilerLab — Device Panel (frontend)
 * Connects the "Devices & Data" view (v-dev) to the FastAPI backend:
 *   - lists / creates / deletes rearing cycles
 *   - shows per-cycle aggregate stats
 *   - live device event stream over WebSocket
 *
 * Backend base URL is overridable via window.ARIAN_API (default dev port).
 */
(function () {
  "use strict";
  // centralized API client (services/api.js) — loaded before this module
  var API = (window.API && window.API.base) || (window.ARIAN_API || "http://127.0.0.1:8755").replace(/\/+$/, "");
  var WS = (window.API && window.API.wsBase) || API.replace(/^http/, "ws");
  var selectedCycle = null;
  var ws = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    // Quote-escaping is required: output lands inside attributes too
    // (e.g. title="..."), where " alone breaks out without any < >.
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }
  function tr(k, fb) { return (window.tr && window.tr(k)) || fb || k; }
  // pure, tested helpers (services/device-utils.js) with local fallbacks
  var DU = window.DeviceUtils || {};
  function formatWeight(v) {
    if (DU.formatWeight) return DU.formatWeight(v, (window.LANG || "fa"));
    var f = (v == null || isNaN(+v)) ? null : +v;
    if (f === null) return "—";
    var s = f.toFixed(2);
    if ((window.LANG || "fa") === "fa") {
      var FA = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
      s = s.replace(/[0-9]/g, function (c) { return FA[+c]; });
    }
    return s;
  }
  function devLog() {
    // development-only diagnostics (never tokens/URLs with secrets)
    try {
      var h = window.location ? window.location.hostname : "";
      if (h === "localhost" || h === "127.0.0.1" || h === "") {
        if (window.console && console.debug) console.debug.apply(console, arguments);
      }
    } catch (e) {}
  }

  // ---------- REST helpers ----------
  function api(path, opts) {
    opts = opts || {};
    var authH = (window.Auth && window.Auth.authHeaders) ? window.Auth.authHeaders() : (window.ARIAN_TOKEN ? { "Authorization": "Bearer " + window.ARIAN_TOKEN } : {});
    // also try localStorage directly
    if (!authH.Authorization) { try { var tk = localStorage.getItem("arian_token"); if (tk) authH.Authorization = "Bearer " + tk; } catch(e){} }
    var fetchOpts = Object.assign({
      headers: Object.assign({ "Content-Type": "application/json" }, authH)
    }, opts);
    return fetch(((window.ARIAN_API||"").replace(/\/+$/,"")||API) + path, fetchOpts).then(function (r) {
      if (r.status === 401) {
        var cur=document.querySelector("section.view.on"); var isPublic=cur && (cur.id==="v-landing" || cur.id==="v-about");
        // stale token: clear it so the gated UI reflects the real state
        try { if (window.Auth && window.Auth.clearAuth) window.Auth.clearAuth(); } catch(e){}
        if(!isPublic && window.showAuthModal) window.showAuthModal("login");
        throw new Error("401 Unauthorized - please login");
      }
      if (!r.ok) return r.json().catch(function(){ return {}; }).then(function(j){
        var d = (j && (j.detail || j.message)) || ("HTTP " + r.status);
        // surface backend detail for uktech 400/502 while keeping generic fallback
        if (typeof d === "string" && d.indexOf("HTTP ") === 0) d = j.detail || d;
        throw new Error(d);
      });
      return r.status === 204 ? null : r.json();
    });
  }

  // ---------- Cycles ----------
  function loadCycles() {
    api("/api/cycles").then(function (list) {
      var box = $("cy-list");
      if (!box) return;
      box.innerHTML = "";
      if (!list.length) {
        box.innerHTML = '<div class="cy-meta" style="padding:8px">'+(window.tr?window.tr("dev.empty"):"دوره‌ای ثبت نشده است.")+'</div>';
        return;
      }
      list.forEach(function (c) {
        var el = document.createElement("div");
        el.className = "cy-item" + (c.id === selectedCycle ? " active" : "");
        el.innerHTML =
          '<span class="cy-code">' + esc(c.cycle_code) + '</span>' +
          '<span class="cy-label">' + esc(c.label) + '</span>' +
          '<span class="cy-meta">' + esc(c.strain) + ' · ' + (c.bird_count || 0) + ' '+(window.tr?window.tr("dev.birds"):"پرنده")+'</span>' +
          '<button class="cy-del" title="'+(window.tr?window.tr("dev.delete"):"حذف")+'"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>';
        el.addEventListener("click", function (e) {
          if (e.target.closest(".cy-del")) {
            if(window.MDialog){ MDialog.confirm({title:window.tr?window.tr("dev.deleteTitle"):"حذف دوره", message:(window.tr?window.tr("dev.deleteMsg").replace("{code}",c.cycle_code):"دوره " + c.cycle_code + " و تمام داده‌های آن حذف شود؟\nاین عمل قابل بازگشت نیست."), confirmText:window.tr?window.tr("dev.deleteConfirm"):"حذف", cancelText:window.tr?window.tr("dialog.cancel"):"انصراف", icon:"danger", danger:true}).then(function(ok){ if(!ok) return; api("/api/cycles/" + c.id, { method: "DELETE" }).then(function () { if (selectedCycle === c.id) { selectedCycle = null; clearStats(); clearRegs(); } loadCycles(); }); }); return; } if (!confirm(window.tr?window.tr("dev.deleteMsg").replace("{code}",c.cycle_code):"دوره " + c.cycle_code + " و تمام داده‌های آن حذف شود؟")) return;
            api("/api/cycles/" + c.id, { method: "DELETE" }).then(function () {
              if (selectedCycle === c.id) { selectedCycle = null; clearStats(); clearRegs(); stopUkLive(); }
              loadCycles();
            });
            return;
          }
          selectedCycle = c.id;
          loadCycles();
          loadStats(c.id);
          loadRegistrations(c.id);
          loadUkStatus();
          loadCycleSource();
          startUkLive();
        });
        box.appendChild(el);
      });
    }).catch(function (e) {
      var box = $("cy-list");
      if (box) box.innerHTML = '<div class="cy-meta" style="padding:8px;color:#e5484d">'+(window.tr?window.tr("dev.backendError"):"خطا در اتصال به بک‌اند: ")+ esc(e.message) + '</div>';
    });
  }

  function createCycle() {
    var code = ($("cy-code").value || "").trim();
    var label = ($("cy-label").value || "").trim();
    var strain = getCyStrain();
    if (!code || !label) { toast(window.tr?window.tr("dev.codeRequired"):"کد و نام دوره الزامی است"); return; }
    api("/api/cycles", {
      method: "POST",
      body: JSON.stringify({ cycle_code: code, label: label, strain: strain, bird_count: 0 })
    }).then(function (c) {
      $("cy-code").value = ""; $("cy-label").value = "";
      selectedCycle = c.id;
      loadCycles(); loadStats(c.id);
      clearRegs(); loadRegistrations(c.id); loadCycleSource(); startUkLive();
      toast(window.tr?window.tr("dev.created").replace("{code}",c.cycle_code):"دوره " + c.cycle_code + " ایجاد شد");
    }).catch(function (e) { toast((window.tr?window.tr("dev.backendError"):"خطا: ") + e.message); });
  }

  // read selected strain from the custom .strain-select component
  function getCyStrain() {
    var sel = $("cy-strain-list") && $("cy-strain-list").querySelector('[aria-selected="true"]');
    return sel ? sel.getAttribute("data-key") : "ross308";
  }

  function loadStats(id) {
    api("/api/cycles/" + id + "/stats").then(function (s) {
      if (id !== selectedCycle) return; // stale response: a newer selection won
      $("st-visits").textContent = lnum(s.visits);
      $("st-birds").textContent = lnum(s.unique_birds);
      $("st-rows").textContent = lnum(s.device_rows);
      $("st-intake").textContent = lnum(s.total_intake_g || 0, 2);
      $("st-avgw").textContent = lnum(s.avg_initial_weight_g || 0, 2);
      $("st-miss").textContent = lnum(s.missed_rfid);
    }).catch(function () {});
  }
  function clearStats() {
    ["st-visits", "st-birds", "st-rows", "st-intake", "st-avgw", "st-miss"]
      .forEach(function (id) { var e = $(id); if (e) e.textContent = "—"; });
    stopUkLive();
  }
  function regEmptyHtml() {
    return '<div class="reg-empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i>'+(window.tr?window.tr("dev.regEmpty"):"هنوز ثبت لحظه‌ای دریافت نشده است.<br>پرنده‌ها هنگام ورود اینجا ظاهر می‌شوند.")+'</div>';
  }
  function clearRegs() {
    ["reg-body-u1", "reg-body-u2"].forEach(function (id) {
      var body = $(id);
      if (body) body.innerHTML = regEmptyHtml();
    });
  }
  function regBodyFor(unit) {
    return $(unit === 2 ? "reg-body-u2" : "reg-body-u1") || $("reg-body-u1");
  }

  // ---------- Live WebSocket (auth via ?token=, polling fallback) ----------
  var wsFails = 0, pollTimer = null;
  function currentToken() {
    try {
      if (window.Auth && window.Auth.getToken) return window.Auth.getToken() || "";
      return localStorage.getItem("arian_token") || "";
    } catch (e) { return ""; }
  }
  function setDot(on) {
    var d = $("ws-dot");
    if (!d) return;
    d.className = "ws-dot " + (on ? "on" : "off");
  }
  function startPoll() {
    // Fallback for transports without WS (serverless): refresh the selected
    // cycle on a timer instead of hammering reconnects.
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (selectedCycle) { loadStats(selectedCycle); loadRegistrations(selectedCycle); }
    }, 15000);
  }
  function stopPoll() {
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
  }
  function connectWS() {
    if (!("WebSocket" in window)) { startPoll(); return; }
    var tk = currentToken();
    var url = WS + "/ws/device" + (tk ? "?token=" + encodeURIComponent(tk) : "");
    try { ws = new WebSocket(url); }
    catch (e) { setDot(false); scheduleRetry(); return; }
    ws.onopen = function () { setDot(true); wsFails = 0; stopPoll(); };
    ws.onclose = function () { setDot(false); scheduleRetry(); };
    ws.onerror = function () { try { ws.close(); } catch (e) {} };
    ws.onmessage = function (ev) {
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      pushLive(d);
      pushReg(d);
    };
  }
  function scheduleRetry() {
    // After repeated failures (auth rejected, serverless WS, offline),
    // switch to polling instead of a tight reconnect loop.
    if (++wsFails >= 3) { startPoll(); setTimeout(connectWS, 60000); }
    else setTimeout(connectWS, 3000);
  }
  function pushLive(d) {
    var feed = $("live-feed");
    if (!feed) return;
    var row = document.createElement("div");
    row.className = "lf-row";
    var t = (d.timestamp || "");
    var shamsi = (typeof window.formatDateTime==="function" ? window.formatDateTime(t, {withTime:true}) : ((window.Shamsi && t && (typeof LANG==="undefined" || LANG==="fa")) ? window.Shamsi.toShamsi(t, { withTime: true }) : t.replace("T", " ").slice(0, 19)));
    row.innerHTML =
      '<span class="t">' + esc(shamsi) + '</span>  ' +
      '<span class="b">bird:' + esc(d.bird_id || "?") + '</span>  ' +
      'w=<span class="w">' + lnum(d.weight_g, 2) + 'g</span>  ' +
      'f=<span class="f">' + (d.feed_delta_g != null ? lnum(d.feed_delta_g, 2) + "g" : "—") + '</span>';
    feed.insertBefore(row, feed.firstChild);
    while (feed.childNodes.length > 60) feed.removeChild(feed.lastChild);
  }

  // ---------- Realtime registrations (bird entry log, per unit) ----------
  var regMax = 50;
  function regUnitOf(d) {
    var u = parseInt(d && d.unit, 10);
    return u === 2 ? 2 : 1;
  }
  function regUnitLabel(u) {
    // Unit column per spec: fa «یونیت ۱/۲» (Persian digits), en Unit 1/2.
    if (u == null) return "—";
    var s = String(u);
    if ((window.LANG || "fa") === "fa") {
      var FA = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
      s = s.replace(/[0-9]/g, function (c) { return FA[+c]; });
    }
    return s;
  }
  function regPosHtml(o) {
    // Business-state badge (server-authoritative; the browser only renders
    // it): FEEDING green «inside», EJECTING orange with the persisted
    // countdown («29s», from eject_in_s — never computed locally),
    // EXITED gray «outside», STALE yellow. The elapsed value shown is
    // always the latest record's — never ticked locally.
    var st = o.state || (o.pos === "outside" ? "EXITED" : "FEEDING");
    var label, cls, extra = "", tip = "";
    if (st === "EJECTING") {
      cls = "ejecting";
      label = tr("dev.pos.ejecting", "در حال تخلیه");
      if (o.eject_in != null && !isNaN(+o.eject_in)) {
        extra = " · " + lnum(Math.max(0, Math.round(+o.eject_in))) +
          tr("dev.reg.sec", "s");
      } else if (o.paused) {
        extra = " ⏸";
      }
      tip = tr("dev.pos.ejectTip", "داده نامعتبر — موتور تا ۳۰ ثانیه دیگر مرغ را خارج می‌کند");
    } else if (st === "EXITED") {
      cls = "out";
      label = tr("dev.pos.outside", "خارج از دستگاه");
    } else if (st === "STALE") {
      cls = "in";
      label = tr("dev.pos.inside", "داخل دستگاه");
      extra = " ⌛";
    } else {
      cls = "in";
      label = tr("dev.pos.inside", "داخل دستگاه");
      if (o.paused) extra = " ⏸";
    }
    if (o.stale && st !== "STALE") extra += " ⌛";
    return '<span class="reg-cell reg-cell--pos"><span class="reg-pos ' +
      cls + '"' + (tip ? ' title="' + esc(tip) + '"' : "") + ">" +
      esc(label + extra) + "</span></span>";
  }
  function regRowHtml(o) {
    // o: {feed, w, bin, elap, dtJoin, bird, sensor, unit, pos, state,
    // eject_in, paused, stale} — weights via the shared 2-decimal
    // formatter (display only, stored values untouched). w is the LIVE
    // weight (final first).
    return '<span class="reg-cell reg-cell--feed">' + formatWeight(o.feed) + '<span class="reg-unit">g</span></span>' +
      '<span class="reg-cell reg-cell--w">' + formatWeight(o.w) + '<span class="reg-unit">g</span></span>' +
      '<span class="reg-cell reg-cell--bin">' + formatWeight(o.bin) + '<span class="reg-unit">g</span></span>' +
      '<span class="reg-cell reg-cell--elapsed">' + (o.elap != null ? lnum(o.elap, 2) : "—") + '<span class="reg-unit">' + tr("dev.reg.sec", "s") + '</span></span>' +
      '<span class="reg-cell reg-cell--dt">' + esc(o.dtJoin) + '</span>' +
      '<span class="reg-cell reg-cell--tag">' + esc(o.bird || "—") + '</span>' +
      '<span class="reg-cell reg-cell--sensor">' + esc(o.sensor || "—") + '</span>' +
      '<span class="reg-cell reg-cell--unit">' + esc(regUnitLabel(o.unit)) + "</span>" +
      regPosHtml(o);
  }
  function regSkeletonHtml() {
    return '<div class="reg-skel"></div><div class="reg-skel"></div><div class="reg-skel"></div>';
  }
  function regDateJoin(dt) {
    var datePart = "", timePart = "";
    if (dt) {
      if (typeof window.formatDate==="function") {
        datePart = window.formatDate(dt);
        timePart = window.formatTime(dt);
      } else if (window.Shamsi && (typeof LANG==="undefined" || LANG==="fa")) {
        datePart = window.Shamsi.toShamsi(dt);
        timePart = window.Shamsi.toShamsi(dt, { withTime: true }).split(" ").pop();
      } else {
        var m = dt.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
        if (m) { datePart = m[1]; timePart = m[2]; }
        else { datePart = dt.slice(0, 10); timePart = dt.slice(11, 19); }
      }
    }
    return (datePart && timePart) ? datePart + " " + timePart : (datePart || timePart || "—");
  }
  function pushReg(d) {
    var body = regBodyFor(regUnitOf(d));
    if (!body) return;
    // clear empty placeholder on first entry
    var empty = body.querySelector(".reg-empty");
    if (empty) empty.remove();
    // Only validated weighing events open table rows: the uktech sync path
    // sets is_visit_start exclusively on REGISTERED session events (with a
    // visit attached). The old fallback heuristic (any bird+weight row)
    // would reintroduce unloading residuals like 6.77 as table rows.
    var isEntry = d.is_visit_start === true && d.visit_id != null;
    if (!isEntry) return;
    // client-side dedupe: the same visit may arrive via REST history and
    // the live socket within one poll window — render it once.
    try {
      if (body.querySelector('[data-visit-id="' + d.visit_id + '"]')) return;
    } catch (e) {}
    var w = d.final_weight_g != null ? d.final_weight_g
          : d.live_weight_g != null ? d.live_weight_g
          : (d.initial_weight_g != null ? d.initial_weight_g : d.weight_g);
    var feed = d.visit_feed_g != null ? d.visit_feed_g : d.feed_intake_g;
    var row = document.createElement("div");
    row.className = "reg-row new";
    if (d.visit_id != null) {
      try { row.setAttribute("data-visit-id", d.visit_id); } catch (e) {}
    }
    row.innerHTML = regRowHtml({
      feed: feed, w: w, bin: d.bin_weight_g, elap: d.elapsed_s,
      dtJoin: regDateJoin(d.timestamp || d.registered_at || ""),
      bird: d.bird_id, sensor: d.sensor_id, unit: d.unit,
      pos: d.bird_position || (d.is_visit_end ? "outside" : "inside"),
      state: d.business_state || null, eject_in: d.eject_in_s,
      paused: !!d.paused, stale: !!d.stale
    });
    body.insertBefore(row, body.firstChild);
    while (body.childNodes.length > regMax) body.removeChild(body.lastChild);
    // remove flash class after animation
    setTimeout(function () { row.classList.remove("new"); }, 1700);
  }

  function fillRegRow(row, r) {
    // single mapping from a registrations-shaped object onto a row —
    // shared by full reloads and smart change patches so both render
    // identical cells. w: CLOSED visits freeze at final; OPEN visits show
    // the LIVE weight (updating every record), falling back to the last
    // VALID reading and then the entry weight; elapsed is the latest
    // record's value, never ticked locally.
    if (r.id != null) {
      try { row.setAttribute("data-visit-id", r.id); } catch (e) {}
    }
    var w = r.final_weight_g != null ? r.final_weight_g
          : r.live_weight_g != null ? r.live_weight_g
          : r.last_valid_weight_g != null ? r.last_valid_weight_g
          : r.initial_weight_g;
    row.innerHTML = regRowHtml({
      feed: r.feed_intake_g, w: w, bin: r.bin_weight_g,
      elap: r.elapsed_s, dtJoin: regDateJoin(r.registered_at || ""),
      bird: r.bird_id, sensor: r.sensor_id, unit: r.unit,
      pos: r.bird_position || null, state: r.business_state || null,
      eject_in: r.eject_in_s, paused: !!r.paused, stale: !!r.stale
    });
  }
  function patchRegChanges(changes) {
    // Smart incremental update: patch exactly the visits the sync's change
    // analysis reports (new weighings, weight/hopper/feed updates, closes)
    // instead of a full re-render — no flicker, ticker bases stay exact.
    // Returns false on any unknown shape so the caller falls back to a
    // full reload (correctness over cleverness).
    if (!changes || !changes.length) return false;
    var touched = 0;
    for (var i = changes.length - 1; i >= 0; i--) {
      var c = changes[i];
      if (!c || c.id == null) return false;
      var body = regBodyFor(regUnitOf(c));
      if (!body) return false;
      if (body.querySelector(".reg-empty")) body.innerHTML = "";
      var row = null;
      try { row = body.querySelector('[data-visit-id="' + c.id + '"]'); }
      catch (e) { return false; }
      if (row) {
        row.classList.remove("new");
        fillRegRow(row, c);
      } else {
        row = document.createElement("div");
        row.className = "reg-row new";
        fillRegRow(row, c);
        body.insertBefore(row, body.firstChild);
        while (body.childNodes.length > regMax) body.removeChild(body.lastChild);
        (function (rw) { setTimeout(function () { rw.classList.remove("new"); }, 1700); })(row);
      }
      body.dataset.loaded = "1";
      touched++;
    }
    return touched > 0;
  }

  function loadRegistrations(id) {
    var b1 = $("reg-body-u1"), b2 = $("reg-body-u2");
    if (!b1 && !b2) return;
    // initial load -> skeleton rows; refresh keeps old rows until replaced
    [[1, b1], [2, b2]].forEach(function (pair) {
      var body = pair[1];
      if (body && body.querySelector(".reg-empty") && !body.dataset.loaded) {
        body.innerHTML = regSkeletonHtml();
      }
    });
    api("/api/cycles/" + id + "/registrations?limit=100").then(function (list) {
      if (id !== selectedCycle) return; // stale response: a newer selection won
      var arr = (list || []).slice();
      // defensive newest-first sort (never trust API order for display)
      if (DU.sortNewestFirst) {
        try { arr = DU.sortNewestFirst(arr, function (r) { return r.registered_at; }); } catch (e) {}
      }
      var groups = { 1: [], 2: [] };
      arr.forEach(function (r) {
        groups[regUnitOf(r)].push(r);
      });
      [[1, b1], [2, b2]].forEach(function (pair) {
        var body = pair[1];
        if (!body) return;
        body.innerHTML = "";
        body.dataset.loaded = "1";
        var rows = groups[pair[0]].slice(0, regMax);
        if (!rows.length) { body.innerHTML = regEmptyHtml(); return; }
        rows.forEach(function (r) {
          var row = document.createElement("div");
          row.className = "reg-row";
          fillRegRow(row, r);
          body.appendChild(row);
        });
      });
      devLog("[device] registrations rendered", "n=" + arr.length);
    }).catch(function () {});
  }

  // ---------- Cycle strain custom selector ----------
  function initCyStrain() {
    var box = $("cy-strain");
    var cur = $("cy-strain-current");
    var list = $("cy-strain-list");
    var valEl = $("cy-strain-value");
    if (!box || !cur || !list || !valEl) return;

    function open() {
      list.hidden = false;
      box.setAttribute("aria-expanded", "true");
      var sel = list.querySelector('[aria-selected="true"]');
      if (sel) sel.focus();
    }
    function close() {
      list.hidden = true;
      box.setAttribute("aria-expanded", "false");
    }
    function isOpen() { return !list.hidden; }

    cur.addEventListener("click", function (e) {
      e.stopPropagation();
      isOpen() ? close() : open();
    });

    list.addEventListener("click", function (e) {
      var opt = e.target.closest(".strain-select__option");
      if (!opt) return;
      list.querySelectorAll(".strain-select__option")
        .forEach(function (o) { o.setAttribute("aria-selected", o === opt ? "true" : "false"); });
      valEl.textContent = opt.textContent.trim();
      close();
    });

    box.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { close(); return; }
      if (e.key === "Enter" || e.key === " ") {
        if (isOpen()) {
          var s = list.querySelector('[aria-selected="true"]');
          if (s) s.click();
        } else open();
        e.preventDefault(); return;
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        var opts = Array.prototype.slice.call(list.querySelectorAll(".strain-select__option"));
        if (!opts.length) return;
        if (!isOpen()) { open(); return; }
        var i = opts.findIndex(function (o) { return o.getAttribute("aria-selected") === "true"; });
        i = (i + (e.key === "ArrowDown" ? 1 : -1) + opts.length) % opts.length;
        opts.forEach(function (o) { o.setAttribute("aria-selected", o === opts[i] ? "true" : "false"); });
        opts[i].focus();
        e.preventDefault();
      }
    });

    document.addEventListener("click", function (e) {
      if (isOpen() && !box.contains(e.target)) close();
    });
  }
  function toast(msg) {
    if (window.toast) { window.toast(msg); return; }
    var t = $("toast"); if (!t) return;
    t.textContent = msg; t.classList.add("show");
    setTimeout(function () { t.classList.remove("show"); }, 2600);
  }

  // ---------- Online device sync (uktech weight API via backend) ----------
  var ukLiveTimer = null, ukSyncing = false, ukWantLive = false,
      ukFails = 0, ukLastOk = 0, ukAbort = null, ukTick = null;
  function setUkStatus(msg) {
    var st = $("uk-sync-status");
    if (st) st.textContent = msg;
  }
  // Hardware panel link (uktech vendor dashboard): keep the serial query
  // param in step with the backend's UKTECH_SERIAL (default ESP800).
  function updateHwPanel(serial) {
    var a = $("uk-hwpanel");
    if (!a || !serial) return;
    var base = "https://uktech.ir/Login/device_weight_dashboard.php";
    a.href = base + "?serial=" + encodeURIComponent(String(serial));
  }
  function fmtDT(iso) {
    if (!iso) return "";
    try {
      if (typeof window.formatDateTime === "function") return window.formatDateTime(iso, { withTime: true });
    } catch (e) {}
    return String(iso).replace("T", " ").slice(0, 19);
  }
  function loadUkStatus() {
    var q = selectedCycle ? "?cycle_id=" + encodeURIComponent(selectedCycle) : "";
    api("/api/uktech/status" + q).then(function (s) {
      // proactive hint: token missing server-side (saves a failed sync click)
      if (s && s.configured === false) {
        setUkStatus(tr("dev.syncNoToken", "توکن API دستگاه روی سرور تنظیم نشده است."));
        return;
      }
      if (s && s.serial) updateHwPanel(s.serial);
      if (s && s.updated_at) {
        var t = fmtDT(s.updated_at);
        var last = s.last_id || 0;
        var base = tr("dev.syncLast", "آخرین همگام‌سازی: {t}").replace("{t}", t).replace("{n}", lnum(last));
        // live indicator when auto-poll is active
        if (ukLiveTimer && selectedCycle) base += " · " + tr("dev.liveOn", "زنده");
        setUkStatus(base);
      } else {
        var txt = tr("dev.syncNever", "هنوز همگام‌سازی انجام نشده است.");
        if (ukLiveTimer && selectedCycle) txt += " · " + tr("dev.liveOn", "زنده");
        setUkStatus(txt);
      }
      // toggle live badge
      var badge = document.querySelector(".dev-regs__live");
      if (badge) badge.style.opacity = (ukLiveTimer && selectedCycle) ? "1" : "0.45";
    }).catch(function () {});
    // session state badge (most recently active lane for this cycle)
    if (selectedCycle) {
      api("/api/uktech/sessions?cycle_id=" + encodeURIComponent(selectedCycle)).then(function (list) {
        var el = $("uk-sess-state");
        if (!el) return;
        if (!list || !list.length) { el.textContent = ""; el.style.display = "none"; return; }
        var st = list[0].state || "EMPTY";
        el.style.display = "";
        el.textContent = "● " + tr("dev.sess." + st, st);
        el.setAttribute("data-state", st);
      }).catch(function () {});
    }
  }
  function setUkLiveDot(on) {
    var b = document.querySelector(".dev-regs__live i");
    if (!b) return;
    b.style.color = on ? "#19c39a" : "";
    b.style.animation = on ? "ukPulse 1.2s infinite" : "";
  }
  // Live polling: chained 3s ticks (never overlapping), progressive backoff
  // 3/5/10/20/30s on consecutive failures, aborted cleanly on stop/unmount.
  var UK_POLL_MS = 3000;
  function ukBackoffMs() {
    if (DU.nextBackoffMs) return DU.nextBackoffMs(ukFails);
    var steps = [3000, 5000, 10000, 20000, 30000];
    return steps[Math.min(Math.max(ukFails - 1, 0), steps.length - 1)];
  }
  function ukOnlineState() {
    if (DU.onlineStatus) return DU.onlineStatus(ukLastOk, Date.now());
    if (!ukLastOk) return "offline";
    var dt = Date.now() - ukLastOk;
    return dt < 10000 ? "online" : (dt < 30000 ? "stale" : "offline");
  }
  function renderUkOnline() {
    var el = $("uk-online");
    if (el) {
      var st = ukOnlineState();
      var map = { online: "dev.online", stale: "dev.stale", offline: "dev.offline" };
      var fb = { online: "آنلاین", stale: "با تأخیر", offline: "آفلاین" };
      el.textContent = "● " + tr(map[st], fb[st]);
      el.setAttribute("class", "uk-online " + (st === "online" ? "on" : st));
    }
    var lf = $("uk-lastfetch");
    if (lf) {
      if (ukLastOk) {
        var d = new Date(ukLastOk);
        var p = function (n) { return (n < 10 ? "0" : "") + n; };
        lf.textContent = tr("dev.lastFetch", "آخرین دریافت: {t}")
          .replace("{t}", p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds()));
      } else lf.textContent = "";
    }
  }
  function showUkRefresh(on) {
    var el = $("uk-refresh");
    if (el) el.style.display = on ? "" : "none";
  }
  function ukSchedule(ms) {
    ukClearTimer();
    ukLiveTimer = setTimeout(function () {
      ukLiveTimer = null;
      if (!ukWantLive || !selectedCycle) return;
      if (document.hidden) { ukSchedule(UK_POLL_MS); return; } // pause tick, keep chain
      autoSyncUktech(true);
    }, ms);
  }
  function ukClearTimer() {
    if (ukLiveTimer) { clearTimeout(ukLiveTimer); ukLiveTimer = null; }
  }
  function ukTickStart() {
    // No local ticking of elapsed: the cell always shows the latest
    // record's value (device counter / fallback). The 1s tick only keeps
    // the online indicator fresh.
    ukTickStop();
    ukTick = setInterval(function () {
      renderUkOnline();
    }, 1000);
  }
  function ukTickStop() {
    if (ukTick) { clearInterval(ukTick); ukTick = null; }
  }
  function startUkLive() {
    stopUkLive();
    if (!selectedCycle) return;
    ukWantLive = true;
    setUkLiveDot(true);
    renderUkOnline();
    ukTickStart();
    autoSyncUktech(true); // immediate silent sync; chain continues after it
    loadUkStatus();
  }
  function stopUkLive() {
    ukWantLive = false;
    ukClearTimer();
    ukTickStop();
    if (ukAbort) { try { ukAbort.abort(); } catch (e) {} ukAbort = null; }
    setUkLiveDot(false);
    showUkRefresh(false);
    renderUkOnline();
    loadUkStatus();
  }
  // ---------- data-source selector (API poll vs direct ESP pushes) ----
  // Exactly one source is active per cycle (server 409s the other one).
  // On "direct" the 3s tick refreshes the table straight from the DB so
  // pushes surface within one cycle — no sync POST is ever sent.
  var cycleSource = "api";
  function loadCycleSource() {
    var sel = $("cy-source");
    if (!selectedCycle) return;
    api("/api/cycles/" + selectedCycle + "/source").then(function (r) {
      cycleSource = (r && r.source) || "api";
      if (sel) {
        sel.value = cycleSource;
        var o0 = sel.options[0], o1 = sel.options[1];
        if (o0) o0.textContent = tr("dev.srcApi", "API (پول توزین)");
        if (o1) o1.textContent = tr("dev.srcDirect", "ESP32 مستقیم");
      }
      renderSourceNote();
    }).catch(function () {});
  }
  function renderSourceNote() {
    var note = $("cy-source-note"), btn = $("uk-sync");
    var direct = cycleSource === "direct";
    if (note) note.textContent = direct ? tr("dev.srcDirectNote", "پول API خاموش است — داده از ESP32 مستقیم می‌آید و جدول هر ۳ ثانیه تازه می‌شود.") : "";
    if (btn) btn.disabled = !!direct;
  }
  function srcInit() {
    var sel = $("cy-source");
    if (!sel) return;
    sel.addEventListener("change", function () {
      if (!selectedCycle) { sel.value = cycleSource; return; }
      var want = sel.value;
      api("/api/cycles/" + selectedCycle + "/source", { method: "PATCH", body: JSON.stringify({ source: want }) })
        .then(function (r) {
          cycleSource = (r && r.source) || want;
          sel.value = cycleSource;
          renderSourceNote();
          startUkLive();
          toast(tr("dev.srcSwitched", "منبع داده عوض شد."));
        })
        .catch(function (e) { sel.value = cycleSource; toast(String((e && e.message) || e)); });
    });
    loadCycleSource();
  }
  function autoSyncUktech(silent) {
    if (!selectedCycle) return;
    if (cycleSource === "direct") {
      loadStats(selectedCycle); loadRegistrations(selectedCycle);
      ukLastOk = Date.now(); renderUkOnline();
      if (ukWantLive && ukLiveTimer === null) ukSchedule(UK_POLL_MS);
      return;
    }
    if (ukSyncing) { if (ukWantLive) ukSchedule(UK_POLL_MS); return; }
    ukSyncing = true;
    showUkRefresh(true);
    if (ukAbort) { try { ukAbort.abort(); } catch (e) {} }
    ukAbort = (typeof AbortController !== "undefined") ? new AbortController() : null;
    var signal = ukAbort ? ukAbort.signal : undefined;
    devLog("[device] poll start", selectedCycle);
    // default limit lets the first poll catch up fully; subsequent polls stop
    // after 1 page when min_id <= last_id — cheap live polling.
    api("/api/uktech/sync", { method: "POST", body: JSON.stringify({ cycle_id: selectedCycle }), signal: signal }).then(function (r) {
      if (!r || r.cycle_id !== selectedCycle) return; // stale: selection changed mid-flight
      var n = (r && r.inserted) || 0;
      ukFails = 0;
      ukLastOk = Date.now();
      devLog("[device] poll ok", "inserted=" + n, "events=" + ((r && r.events) || 0),
             "delta=" + ((r && r.upstream_delta) || 0),
             "reset=" + !!(r && r.reset), "stalled=" + ((r && r.stalled_reason) || "-"));
      if (r && r.stalled) {
        // cursor ahead of upstream without corroborating evidence: show the
        // reason instead of freezing silently like before.
        setUkStatus(tr("dev.syncStalled", "همگام‌سازی متوقف مانده است.") + " " + (r.stalled_reason || ""));
      } else if (r && r.changes && r.changes.length) {
        if (patchRegChanges(r.changes)) {
          // smart path: the sync analysed exactly which visits changed — patch
          // those rows in place; stats still reload, no full re-render needed.
          loadStats(selectedCycle);
          devLog("[device] poll patched", "rows=" + r.changes.length);
        } else {
          // DB changed in a shape the patcher does not know: fall back to a
          // precise full reload so the table always matches the database.
          loadStats(selectedCycle); loadRegistrations(selectedCycle);
        }
      } else if (n > 0 || ((r && r.events) || 0) > 0) {
        // refresh on visit events too (ratchet/close/timeout can change
        // open rows with zero new logs), toast only for new records.
        if (!silent && n > 0) toast(tr("dev.syncDone", "همگام‌سازی انجام شد: {n} رکورد جدید").replace("{n}", lnum(n)));
        loadStats(selectedCycle); loadRegistrations(selectedCycle);
      } else if (!silent) {
        toast(tr("dev.syncNone", "رکورد جدیدی نبود."));
      }
      if (!(r && r.stalled)) loadUkStatus();
      if (r && r.tls_insecure) {
        var st = $("uk-sync-status");
        var cur = st ? st.textContent : "";
        if (cur.indexOf("self-signed") === -1 && cur.indexOf("خودامضا") === -1) {
          setUkStatus(cur + " " + tr("dev.syncInsecure", "⚠ اتصال بدون تأیید گواهی (self-signed)"));
        }
      }
    }).catch(function (e) {
      if (e && e.name === "AbortError") { ukSyncing = false; showUkRefresh(false); return; }
      ukFails++;
      devLog("[device] poll error", String((e && e.message) || e));
      var m = String((e && e.message) || e || "");
      if (/token is not configured/i.test(m)) {
        // configuration error: stop polling instead of hammering the server
        stopUkLive();
        setUkStatus(tr("dev.syncNoToken", "توکن API دستگاه روی سرور تنظیم نشده است."));
        toast(tr("dev.syncFail", "خطا در دریافت داده: ") + tr("dev.syncNoToken", "توکن API دستگاه روی سرور تنظیم نشده است."));
        ukSyncing = false; showUkRefresh(false); renderUkOnline();
        return;
      }
      if (/CERTIFICATE_VERIFY|certificate verify|SSL/i.test(m)) m = tr("dev.syncTLS", "خطای گواهی TLS هاست دستگاه.");
      else if (/429/.test(m)) m = tr("dev.syncRateLimit", "درخواست‌ها زیاد است — کمی صبر کنید.");
      // silent mode: keep old rows, show a short controlled error line
      setUkStatus(tr("dev.syncFail", "خطا در دریافت داده: ") + m);
      if (!silent) toast(tr("dev.syncFail", "خطا در دریافت داده: ") + m);
    }).then(function () {
      ukSyncing = false;
      showUkRefresh(false);
      renderUkOnline();
      if (ukWantLive && selectedCycle && ukLiveTimer === null) {
        ukSchedule(ukFails > 0 ? ukBackoffMs() : UK_POLL_MS);
      }
    });
  }
  function syncUktech() {
    if (!selectedCycle) { toast(tr("dev.syncNeedCycle", "اول یک دوره را انتخاب کنید.")); return; }
    if (cycleSource === "direct") { toast(tr("dev.srcDirectNote", "پول API خاموش است — داده از ESP32 مستقیم می‌آید و جدول هر ۳ ثانیه تازه می‌شود.")); return; }
    var btn = $("uk-sync");
    if (btn) btn.disabled = true;
    // Chunked sync loop: each call writes one batch (server default 60) and
    // returns complete=false while rows remain — repeat until done so big
    // backlogs never hit the serverless time limit (was HTTP 504).
    var total = 0, guard = 0, insecure = false, sawReset = false,
        sawStalled = null, events = 0, idleChunks = 0;
    ukSyncing = true;
    setUkStatus(tr("dev.syncing", "در حال دریافت..."));
    function oneChunk() {
      if (++guard > 200 || !selectedCycle) { finish(null); return; }
      api("/api/uktech/sync", { method: "POST", body: JSON.stringify({ cycle_id: selectedCycle }) }).then(function (r) {
        total += (r && r.inserted) || 0;
        events += (r && r.events) || 0;
        if (r && r.tls_insecure) insecure = true;
        if (r && r.reset) sawReset = true;
        if (r && r.stalled) sawStalled = r.stalled_reason || true;
        var rem = (r && r.remaining) || 0;
        // zero-progress backstop: the cursor always advances past processed
        // rows, so repeated empty chunks mean nothing left to do — stop
        // instead of spinning (auto-poll picks up genuinely new rows later).
        if (((r && r.inserted) || 0) === 0) idleChunks++; else idleChunks = 0;
        if (total > 0 || rem > 0) setUkStatus(tr("dev.syncing", "در حال دریافت...") + " (" + lnum(total) + (rem > 0 ? " · +" + lnum(rem) : "") + ")");
        // Continue while ANY work remains — remaining>0 alone (even with
        // complete=true) means rows were fetched but not yet written.
        if (idleChunks < 3 && (((r && r.inserted) || 0) > 0 || rem > 0)) { oneChunk(); return; }
        finish(r);
      }).catch(function (e) { finish(null, e); });
    }
    function finish(r, e) {
      if (e) {
        var m = String((e && e.message) || e || "");
        if (/token is not configured/i.test(m)) m = tr("dev.syncNoToken", "توکن API دستگاه روی سرور تنظیم نشده است.");
        else if (/CERTIFICATE_VERIFY|certificate verify|SSL/i.test(m)) m = tr("dev.syncTLS", "خطای گواهی TLS هاست دستگاه.");
        else if (/504|timeout|timed out/i.test(m)) m = tr("dev.syncTimeout", "سرور دیر جواب داد — دوباره تلاش کنید (ادامه خودکار از همان‌جا).");
        toast(tr("dev.syncFail", "خطا در دریافت داده: ") + m);
      } else if (total > 0) {
        var doneMsg = tr("dev.syncDone", "همگام‌سازی انجام شد: {n} رکورد جدید").replace("{n}", lnum(total));
        if (events > 0) doneMsg += " · " + tr("dev.syncEvents", "{n} رویداد توزین").replace("{n}", lnum(events));
        toast(doneMsg);
        if (sawReset) toast(tr("dev.syncReset", "منبع دستگاه ریست شده بود — همگام‌سازی از اول شروع شد."));
        if (sawStalled) toast(tr("dev.syncStalled", "همگام‌سازی متوقف مانده است.") + " " + sawStalled);
      } else if (sawStalled) {
        toast(tr("dev.syncStalled", "همگام‌سازی متوقف مانده است.") + " " + sawStalled);
      } else {
        toast(tr("dev.syncNone", "رکورد جدیدی نبود."));
      }
      loadStats(selectedCycle); loadRegistrations(selectedCycle); loadUkStatus();
      if (sawStalled) setUkStatus(tr("dev.syncStalled", "همگام‌سازی متوقف مانده است.") + " " + sawStalled);
      else if (insecure) setUkStatus(($("uk-sync-status") ? $("uk-sync-status").textContent + " " : "") + tr("dev.syncInsecure", "⚠ اتصال بدون تأیید گواهی (self-signed)"));
      ukSyncing = false; if (btn) btn.disabled = false;
    }
    oneChunk();
  }

  // ---------- ESP32 direct-ingest devices ----------
  // Human-JWT management UI for per-device keys: list health (online /
  // last_seen), register on the selected cycle (key shown ONCE), enable /
  // disable, rotate. The key itself is never fetched back from the server.
  function espShowKey(k) {
    var box = $("esp-keybox"), el = $("esp-key");
    if (!box || !el) return;
    el.textContent = k;
    box.style.display = "flex";
    var cp = $("esp-keycopy");
    if (cp) cp.onclick = function () {
      try {
        if (navigator.clipboard) navigator.clipboard.writeText(k);
        else { var t = document.createElement("textarea"); t.value = k; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
      } catch (e) {}
    };
  }
  function espHideKey() { var box = $("esp-keybox"); if (box) box.style.display = "none"; }
  function espRender(list) {
    var body = $("esp-list");
    if (!body) return;
    body.innerHTML = "";
    if (!(list || []).length) {
      // proper empty message (the shared .cy-list:empty::before says
      // "no cycles" — wrong text for the device inventory)
      body.innerHTML = '<div class="cy-meta" style="padding:10px">' +
        esc(tr("dev.espEmpty", "دستگاهی ثبت نشده است.")) + '</div>';
      return;
    }
    (list || []).forEach(function (d) {
      var row = document.createElement("div");
      row.className = "cy-item";
      var dot = d.online ? '<span class="uk-online on">●</span>' : '<span class="uk-online off">●</span>';
      var seen = d.last_seen_at ? esc(d.last_seen_at.replace("T", " ").slice(0, 19)) : "—";
      row.innerHTML = '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' + dot +
        '<b dir="ltr">' + esc(d.device_id || "") + '</b>' +
        '<span class="cy-meta">' + esc(d.name || "") + '</span>' +
        '<span class="cy-meta">cycle ' + esc(String(d.cycle_id)) + '</span>' +
        '<span class="cy-meta">' + esc(seen) + '</span>' +
        (d.active ? "" : '<span class="cy-meta">(' + esc(tr("dev.espOff", "غیرفعال")) + ')</span>') +
        '<span style="flex:1"></span>' +
        '<button type="button" class="btn" data-act="toggle">' + esc(d.active ? tr("dev.espDisable", "غیرفعال") : tr("dev.espEnable", "فعال")) + '</button>' +
        '<button type="button" class="btn" data-act="rotate">' + esc(tr("dev.espRotate", "کلید جدید")) + '</button>' +
        '</div>';
      row.querySelector('[data-act="toggle"]').onclick = function () {
        api("/api/devices/" + encodeURIComponent(d.device_id) + "/status",
            { method: "PATCH", body: JSON.stringify({ active: !d.active }) })
          .then(function () { espLoad(); }).catch(function (e) { toast(String((e && e.message) || e)); });
      };
      row.querySelector('[data-act="rotate"]').onclick = function () {
        if (!confirm(tr("dev.espRotateMsg", "کلید قبلی بلافاصله باطل می‌شود. ادامه؟"))) return;
        api("/api/devices/" + encodeURIComponent(d.device_id) + "/rotate-key", { method: "POST" })
          .then(function (r) { if (r && r.api_key) espShowKey(r.api_key); espLoad(); })
          .catch(function (e) { toast(String((e && e.message) || e)); });
      };
      body.appendChild(row);
    });
  }
  function espLoad() {
    if (!$("esp-list")) return;
    api("/api/devices").then(espRender).catch(function () {});
  }
  function espInit() {
    var form = $("esp-form");
    if (!form) return;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!selectedCycle) { toast(tr("dev.syncNeedCycle", "اول یک دوره را انتخاب کنید.")); return; }
      var idEl = $("esp-id"), nmEl = $("esp-name");
      var did = idEl ? idEl.value.trim() : "";
      if (!did) return;
      api("/api/devices", { method: "POST", body: JSON.stringify({ device_id: did, name: nmEl ? nmEl.value.trim() : "", cycle_id: selectedCycle }) })
        .then(function (r) {
          if (r && r.api_key) espShowKey(r.api_key);
          if (idEl) idEl.value = "";
          if (nmEl) nmEl.value = "";
          espLoad();
        })
        .catch(function (er) { toast(String((er && er.message) || er)); });
    });
    espLoad();
  }

  // ---------- init ----------
  function init() {
    var form = $("cy-form");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); createCycle(); });
    var syncBtn = $("uk-sync");
    if (syncBtn) syncBtn.addEventListener("click", syncUktech);
    initCyStrain();
    var authed2=false; try{ var tk2=localStorage.getItem("arian_token"); authed2 = window.isTokenValid && window.isTokenValid(tk2); }catch(e){}
    var curP=document.querySelector("section.view.on"); var onPub=curP && (curP.id==="v-landing" || curP.id==="v-about");
    if(authed2 || !onPub) loadCycles();
    espInit();
    srcInit();
    connectWS();
    // pause live when tab hidden, resume on visible
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && selectedCycle && !ukLiveTimer) startUkLive();
    });
    // stop live when leaving device view (router dispatches arian:route)
    window.addEventListener("arian:route", function (e) {
      var v = e && e.detail && e.detail.view;
      if (v && v !== "v-dev") stopUkLive();
      else if (v === "v-dev" && selectedCycle) { startUkLive(); espLoad(); }
    });
  }

  // Full teardown for the reset flow (app.js resetWorkspaceData): stop
  // every timer/WS the panel owns so nothing keeps polling a wiped cycle.
  window.clearDevicePanel = function () {
    stopUkLive();
    stopPoll();
    if (ws) { try { ws.onclose = null; ws.close(); } catch (e) {} ws = null; }
    setDot(false);
  };

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
