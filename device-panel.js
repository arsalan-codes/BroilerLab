/*
 * BroilerLab — Device Panel (frontend)
 * Connects the "Devices & Data" view (v-dev) to the FastAPI backend:
 *   - lists / creates / deletes rearing cycles
 *   - shows per-cycle aggregate stats
 *   - live device event stream over WebSocket
 *
 * Backend base URL is overridable via window.BROILER_API (default dev port).
 */
(function () {
  "use strict";
  var API = (window.BROILER_API || "http://127.0.0.1:8755").replace(/\/+$/, "");
  var WS = API.replace(/^http/, "ws");
  var selectedCycle = null;
  var ws = null;

  function $(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
  function tr(k, fb) { return (window.tr && window.tr(k)) || fb || k; }

  // ---------- REST helpers ----------
  function api(path, opts) {
    opts = opts || {};
    var authH = (window.Auth && window.Auth.authHeaders) ? window.Auth.authHeaders() : (window.BROILER_TOKEN ? { "Authorization": "Bearer " + window.BROILER_TOKEN } : {});
    // also try localStorage directly
    if (!authH.Authorization) { try { var tk = localStorage.getItem("broiler_token"); if (tk) authH.Authorization = "Bearer " + tk; } catch(e){} }
    return fetch(API + path, Object.assign({
      headers: Object.assign({ "Content-Type": "application/json" }, authH)
    }, opts)).then(function (r) {
      if (r.status === 401) {
        var cur=document.querySelector("section.view.on"); var isPublic=cur && (cur.id==="v-landing" || cur.id==="v-about");
        if(!isPublic && window.showAuthModal) window.showAuthModal("login");
        throw new Error("401 Unauthorized - please login");
      }
      if (!r.ok) throw new Error("HTTP " + r.status);
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
        box.innerHTML = '<div class="cy-meta" style="padding:8px">دوره‌ای ثبت نشده است.</div>';
        return;
      }
      list.forEach(function (c) {
        var el = document.createElement("div");
        el.className = "cy-item" + (c.id === selectedCycle ? " active" : "");
        el.innerHTML =
          '<span class="cy-code">' + esc(c.cycle_code) + '</span>' +
          '<span class="cy-label">' + esc(c.label) + '</span>' +
          '<span class="cy-meta">' + esc(c.strain) + ' · ' + (c.bird_count || 0) + ' پرنده</span>' +
          '<button class="cy-del" title="حذف"><i class="fa-solid fa-trash" aria-hidden="true"></i></button>';
        el.addEventListener("click", function (e) {
          if (e.target.closest(".cy-del")) {
            if(window.MDialog){ MDialog.confirm({title:"حذف دوره", message:"دوره " + c.cycle_code + " و تمام داده‌های آن حذف شود؟\nاین عمل قابل بازگشت نیست.", confirmText:"حذف", cancelText:"انصراف", icon:"danger", danger:true}).then(function(ok){ if(!ok) return; api("/api/cycles/" + c.id, { method: "DELETE" }).then(function () { if (selectedCycle === c.id) { selectedCycle = null; clearStats(); clearRegs(); } loadCycles(); }); }); return; } if (!confirm("دوره " + c.cycle_code + " و تمام داده‌های آن حذف شود؟")) return;
            api("/api/cycles/" + c.id, { method: "DELETE" }).then(function () {
              if (selectedCycle === c.id) { selectedCycle = null; clearStats(); clearRegs(); }
              loadCycles();
            });
            return;
          }
          selectedCycle = c.id;
          loadCycles();
          loadStats(c.id);
          loadRegistrations(c.id);
        });
        box.appendChild(el);
      });
    }).catch(function (e) {
      var box = $("cy-list");
      if (box) box.innerHTML = '<div class="cy-meta" style="padding:8px;color:#e5484d">خطا در اتصال به بک‌اند: ' + esc(e.message) + '</div>';
    });
  }

  function createCycle() {
    var code = ($("cy-code").value || "").trim();
    var label = ($("cy-label").value || "").trim();
    var strain = getCyStrain();
    if (!code || !label) { toast("کد و نام دوره الزامی است"); return; }
    api("/api/cycles", {
      method: "POST",
      body: JSON.stringify({ cycle_code: code, label: label, strain: strain, bird_count: 0 })
    }).then(function (c) {
      $("cy-code").value = ""; $("cy-label").value = "";
      selectedCycle = c.id;
      loadCycles(); loadStats(c.id);
      clearRegs(); loadRegistrations(c.id);
      toast("دوره " + c.cycle_code + " ایجاد شد");
    }).catch(function (e) { toast("خطا: " + e.message); });
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
      $("st-intake").textContent = lnum(s.total_intake_g || 0);
      $("st-avgw").textContent = lnum(s.avg_initial_weight_g || 0);
      $("st-miss").textContent = lnum(s.missed_rfid);
    }).catch(function () {});
  }
  function clearStats() {
    ["st-visits", "st-birds", "st-rows", "st-intake", "st-avgw", "st-miss"]
      .forEach(function (id) { var e = $(id); if (e) e.textContent = "—"; });
  }
  function clearRegs() {
    var body = $("reg-body");
    if (body) body.innerHTML = '<div class="reg-empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i>هنوز ثبت لحظه‌ای دریافت نشده است.<br>پرنده‌ها هنگام ورود اینجا ظاهر می‌شوند.</div>';
  }

  // ---------- Live WebSocket ----------
  function setDot(on) {
    var d = $("ws-dot");
    if (!d) return;
    d.className = "ws-dot " + (on ? "on" : "off");
  }
  function connectWS() {
    if (!("WebSocket" in window)) return;
    try { ws = new WebSocket(WS + "/ws/device"); }
    catch (e) { setDot(false); return; }
    ws.onopen = function () { setDot(true); };
    ws.onclose = function () { setDot(false); setTimeout(connectWS, 3000); };
    ws.onerror = function () { setDot(false); };
    ws.onmessage = function (ev) {
      var d; try { d = JSON.parse(ev.data); } catch (e) { return; }
      pushLive(d);
      pushReg(d);
    };
  }
  function pushLive(d) {
    var feed = $("live-feed");
    if (!feed) return;
    var row = document.createElement("div");
    row.className = "lf-row";
    var t = (d.timestamp || "");
    var shamsi = (window.Shamsi && t) ? window.Shamsi.toShamsi(t, { withTime: true }) : t.replace("T", " ").slice(0, 19);
    row.innerHTML =
      '<span class="t">' + esc(shamsi) + '</span>  ' +
      '<span class="b">bird:' + esc(d.bird_id || "?") + '</span>  ' +
      'w=<span class="w">' + esc(d.weight_g != null ? d.weight_g : "—") + 'g</span>  ' +
      'f=<span class="f">' + esc(d.feed_delta_g != null ? (d.feed_delta_g + "g") : "—") + '</span>';
    feed.insertBefore(row, feed.firstChild);
    while (feed.childNodes.length > 60) feed.removeChild(feed.lastChild);
  }

  // ---------- Realtime registrations (bird entry log) ----------
  var regMax = 50;
  function pushReg(d) {
    var body = $("reg-body");
    if (!body) return;
    // clear empty placeholder on first entry
    var empty = body.querySelector(".reg-empty");
    if (empty) empty.remove();
    // a registration is a bird-entry event (is_visit_start) carrying a tag + weight
    var isEntry = d.is_visit_start || (d.bird_id && d.weight_g != null && d.feed_delta_g == null);
    if (!isEntry) return;

    var dt = d.timestamp || d.registered_at || "";
    var datePart = "", timePart = "";
    if (dt) {
      if (window.Shamsi) {
        datePart = window.Shamsi.toShamsi(dt);              // 1405/06/05
        timePart = window.Shamsi.toShamsi(dt, { withTime: true }).split(" ").pop(); // 15:55
      } else {
        var m = dt.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
        if (m) { datePart = m[1]; timePart = m[2]; }
        else { datePart = dt.slice(0, 10); timePart = dt.slice(11, 19); }
      }
    }
    var w = d.initial_weight_g != null ? d.initial_weight_g : d.weight_g;

    var row = document.createElement("div");
    row.className = "reg-row new";
    row.innerHTML =
      '<span class="reg-cell reg-cell--tag">' + esc(d.bird_id || "—") + '</span>' +
      '<span class="reg-cell reg-cell--w">' + (w != null ? lnum(w) : "—") + '<span class="reg-unit">g</span></span>' +
      '<span class="reg-cell reg-cell--date">' + esc(datePart || "—") + '</span>' +
      '<span class="reg-cell reg-cell--time">' + esc(timePart || "—") + '</span>' +
      '<span class="reg-cell reg-cell--sensor">' + esc(d.sensor_id || "—") + '</span>' +
      '<span class="reg-cell reg-cell--rssi">' + (d.rssi != null ? lnum(d.rssi) : "—") + '</span>';
    body.insertBefore(row, body.firstChild);
    while (body.childNodes.length > regMax) body.removeChild(body.lastChild);
    // remove flash class after animation
    setTimeout(function () { row.classList.remove("new"); }, 1700);
  }

  function loadRegistrations(id) {
    var body = $("reg-body");
    if (!body) return;
    api("/api/cycles/" + id + "/registrations?limit=50").then(function (list) {
      body.innerHTML = "";
      if (!list.length) {
        body.innerHTML = '<div class="reg-empty"><i class="fa-solid fa-inbox" aria-hidden="true"></i>هنوز ثبت لحظه‌ای دریافت نشده است.<br>پرنده‌ها هنگام ورود اینجا ظاهر می‌شوند.</div>';
        return;
      }
      list.forEach(function (r) {
        var row = document.createElement("div");
        row.className = "reg-row";
        var datePart = r.registered_at || "";
        var timePart = "";
        if (window.Shamsi && datePart) {
          datePart = window.Shamsi.toShamsi(datePart);
          timePart = window.Shamsi.toShamsi(r.registered_at, { withTime: true }).split(" ").pop();
        } else {
          datePart = datePart.slice(0, 10);
          timePart = (r.registered_at || "").slice(11, 19);
        }
        row.innerHTML =
          '<span class="reg-cell reg-cell--tag">' + esc(r.bird_id || "—") + '</span>' +
          '<span class="reg-cell reg-cell--w">' + (r.initial_weight_g != null ? lnum(r.initial_weight_g) : "—") + '<span class="reg-unit">g</span></span>' +
          '<span class="reg-cell reg-cell--date">' + esc(datePart || "—") + '</span>' +
          '<span class="reg-cell reg-cell--time">' + esc(timePart || "—") + '</span>' +
          '<span class="reg-cell reg-cell--sensor">' + esc(r.sensor_id || "—") + '</span>' +
          '<span class="reg-cell reg-cell--rssi">' + (r.rssi != null ? lnum(r.rssi) : "—") + '</span>';
        body.appendChild(row);
      });
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

  // ---------- init ----------
  function init() {
    var form = $("cy-form");
    if (form) form.addEventListener("submit", function (e) { e.preventDefault(); createCycle(); });
    initCyStrain();
    var authed2=false; try{ var tk2=localStorage.getItem("broiler_token"); authed2 = window.isTokenValid && window.isTokenValid(tk2); }catch(e){}
    var curP=document.querySelector("section.view.on"); var onPub=curP && (curP.id==="v-landing" || curP.id==="v-about");
    if(authed2 || !onPub) loadCycles();
    connectWS();
  }

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
