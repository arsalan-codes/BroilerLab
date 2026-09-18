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
      clearRegs(); loadRegistrations(c.id); startUkLive();
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
  function regRowHtml(o) {
    // o: {feed, w, bin, elap, dtJoin, bird, sensor} — weights via the
    // shared 2-decimal formatter (display only, stored values untouched).
    return '<span class="reg-cell reg-cell--feed">' + formatWeight(o.feed) + '<span class="reg-unit">g</span></span>' +
      '<span class="reg-cell reg-cell--w">' + formatWeight(o.w) + '<span class="reg-unit">g</span></span>' +
      '<span class="reg-cell reg-cell--bin">' + formatWeight(o.bin) + '<span class="reg-unit">g</span></span>' +
      '<span class="reg-cell reg-cell--elapsed">' + (o.elap != null ? lnum(o.elap, 2) : "—") + '<span class="reg-unit">' + tr("dev.reg.sec", "s") + '</span></span>' +
      '<span class="reg-cell reg-cell--dt">' + esc(o.dtJoin) + '</span>' +
      '<span class="reg-cell reg-cell--tag">' + esc(o.bird || "—") + '</span>' +
      '<span class="reg-cell reg-cell--sensor">' + esc(o.sensor || "—") + '</span>';
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
    var w = d.initial_weight_g != null ? d.initial_weight_g : d.weight_g;
    var feed = d.visit_feed_g != null ? d.visit_feed_g : d.feed_intake_g;
    var row = document.createElement("div");
    row.className = "reg-row new";
    if (d.visit_id != null) {
      try { row.setAttribute("data-visit-id", d.visit_id); } catch (e) {}
    }
    row.innerHTML = regRowHtml({
      feed: feed, w: w, bin: d.bin_weight_g, elap: d.elapsed_s,
      dtJoin: regDateJoin(d.timestamp || d.registered_at || ""),
      bird: d.bird_id, sensor: d.sensor_id
    });
    body.insertBefore(row, body.firstChild);
    while (body.childNodes.length > regMax) body.removeChild(body.lastChild);
    // remove flash class after animation
    setTimeout(function () { row.classList.remove("new"); }, 1700);
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
          if (r.id != null) {
            try { row.setAttribute("data-visit-id", r.id); } catch (e) {}
          }
          var w = r.initial_weight_g != null ? r.initial_weight_g : r.final_weight_g;
          row.innerHTML = regRowHtml({
            feed: r.feed_intake_g, w: w, bin: r.bin_weight_g,
            elap: r.elapsed_s, dtJoin: regDateJoin(r.registered_at || ""),
            bird: r.bird_id, sensor: r.sensor_id
          });
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
    ukTickStop();
    ukTick = setInterval(renderUkOnline, 1000);
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
  function autoSyncUktech(silent) {
    if (!selectedCycle) return;
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
      var n = (r && r.inserted) || 0;
      ukFails = 0;
      ukLastOk = Date.now();
      devLog("[device] poll ok", "inserted=" + n, "events=" + ((r && r.events) || 0));
      if (n > 0) {
        if (!silent) toast(tr("dev.syncDone", "همگام‌سازی انجام شد: {n} رکورد جدید").replace("{n}", lnum(n)));
        loadStats(selectedCycle); loadRegistrations(selectedCycle);
      } else if (!silent) {
        toast(tr("dev.syncNone", "رکورد جدیدی نبود."));
      }
      loadUkStatus();
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
        ukSchedule(ukFails > 0 ? ukBackoff() : UK_POLL_MS);
      }
    });
  }
  function syncUktech() {
    if (!selectedCycle) { toast(tr("dev.syncNeedCycle", "اول یک دوره را انتخاب کنید.")); return; }
    var btn = $("uk-sync");
    if (btn) btn.disabled = true;
    // Chunked sync loop: each call writes one batch (server default 60) and
    // returns complete=false while rows remain — repeat until done so big
    // backlogs never hit the serverless time limit (was HTTP 504).
    var total = 0, guard = 0, insecure = false, sawReset = false, events = 0;
    ukSyncing = true;
    setUkStatus(tr("dev.syncing", "در حال دریافت..."));
    function oneChunk() {
      if (++guard > 200 || !selectedCycle) { finish(null); return; }
      api("/api/uktech/sync", { method: "POST", body: JSON.stringify({ cycle_id: selectedCycle }) }).then(function (r) {
        total += (r && r.inserted) || 0;
        events += (r && r.events) || 0;
        if (r && r.tls_insecure) insecure = true;
        if (r && r.reset) sawReset = true;
        var rem = (r && r.remaining) || 0;
        if (total > 0 || rem > 0) setUkStatus(tr("dev.syncing", "در حال دریافت...") + " (" + lnum(total) + (rem > 0 ? " · +" + lnum(rem) : "") + ")");
        if (r && r.complete === false && ((r.inserted || 0) > 0 || rem > 0)) { oneChunk(); return; }
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
      } else {
        toast(tr("dev.syncNone", "رکورد جدیدی نبود."));
      }
      loadStats(selectedCycle); loadRegistrations(selectedCycle); loadUkStatus();
      if (insecure) setUkStatus(($("uk-sync-status") ? $("uk-sync-status").textContent + " " : "") + tr("dev.syncInsecure", "⚠ اتصال بدون تأیید گواهی (self-signed)"));
      ukSyncing = false; if (btn) btn.disabled = false;
    }
    oneChunk();
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
    connectWS();
    // pause live when tab hidden, resume on visible
    document.addEventListener("visibilitychange", function () {
      if (!document.hidden && selectedCycle && !ukLiveTimer) startUkLive();
    });
    // stop live when leaving device view
    window.addEventListener("rossim:view", function (e) {
      var v = e && e.detail;
      if (v && v !== "v-dev") stopUkLive();
      else if (v === "v-dev" && selectedCycle) startUkLive();
    });
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
