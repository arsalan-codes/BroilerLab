/*
 * BroilerLab — Auth (frontend)
 * Handles JWT login/register, token storage, and topbar user panel.
 * Depends only on fetch + localStorage. No build step.
 */
(function () {
  "use strict";
  var API = (window.API && window.API.base) || (window.ARIAN_API || "http://127.0.0.1:8755").replace(/\/+$/, "");
  function apiBase(){ return ((window.ARIAN_API||"").replace(/\/+$/,"")) || API; }
  var TOKEN_KEY = "arian_token";
  /* brand migration: lift credentials saved under the old broiler_* keys */
  try {
    if (!localStorage.getItem(TOKEN_KEY) && localStorage.getItem("broiler_token")) {
      localStorage.setItem(TOKEN_KEY, localStorage.getItem("broiler_token"));
      if (localStorage.getItem("broiler_user")) localStorage.setItem("arian_user", localStorage.getItem("broiler_user"));
      localStorage.removeItem("broiler_token"); localStorage.removeItem("broiler_user");
    }
  } catch (e) {}
  var USER_KEY = "arian_user";

  function getToken() { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch(e){ return ""; } }
  function getUser() { try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); } catch(e){ return null; } }
  function setAuth(token, user) {
    try { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, JSON.stringify(user)); } catch(e){}
    window.ARIAN_TOKEN = token;
    window.ARIAN_USER = user;
  }
  function clearAuth() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } catch(e){}
    window.ARIAN_TOKEN = "";
    window.ARIAN_USER = null;
  }
  function authHeaders() {
    var t = getToken();
    return t ? { "Authorization": "Bearer " + t } : {};
  }
  window.ARIAN_TOKEN = getToken();
  window.ARIAN_USER = getUser();
  window.Auth = { getToken, getUser, setAuth, clearAuth, authHeaders, showAuthModal, hideAuthModal };
  function isTokenValid(tok){
    if(!tok) return false;
    try{
      var parts=tok.split('.');
      if(parts.length!==3) return false;
      var b64=parts[1].replace(/-/g,'+').replace(/_/g,'/');
      while(b64.length%4) b64+='=';
      var payload=JSON.parse(atob(b64));
      if(!payload.exp) return true;
      return (payload.exp*1000) > (Date.now()+5000);
    }catch(e){ return false; }
  }
  window.isTokenValid=isTokenValid;

  // ---- API helpers with auth ----
  function apiAuth(path, opts) {
    opts = opts || {};
    var headers = Object.assign({ "Content-Type": "application/json" }, authHeaders(), opts.headers || {});
    return fetch(apiBase() + path, Object.assign({}, opts, { headers: headers })).then(function (r) {
      if (r.status === 401) {
        if (getToken()) { clearAuth(); renderAuthArea(); }
        setGated(true);
        var cur2=document.querySelector("section.view.on"); var isPub2=cur2 && ((window.Router&&window.Router.isPublic(cur2.id)) || cur2.id==="v-landing" || cur2.id==="v-about");
        if(!isPub2) showAuthModal("login", {gated:true});
        var msg = "401 Unauthorized";
        return r.json().catch(function(){return {};}).then(function(j){ throw new Error(j.detail || msg); });
      }
      if (!r.ok) return r.json().catch(function(){return {};}).then(function(j){ throw new Error(j.detail || ("HTTP "+r.status)); });
      return r.status === 204 ? null : r.json();
    });
  }
  window.apiAuth = apiAuth;

  // ---- UI: topbar auth area ----
  function esc(s){ return String(s||"").replace(/[&<>"]/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c];}); }

  function renderAuthArea() {
    var area = document.getElementById("auth-area");
    if (!area) return;
    var user = getUser();
    var token = getToken();
    if (user && token) {
      var initials = (user.full_name || user.username || user.email || "U").trim().charAt(0).toUpperCase();
      var display = esc(user.full_name || user.username || user.email.split("@")[0]);
      var welcomeName = (window.tr?window.tr('auth.welcome'):'خوش آمدید ')+display;
      area.innerHTML = '<div class="auth-user" id="auth-user-btn" role="button" tabindex="0" aria-haspopup="true" title="'+esc(user.email)+'">'
        + '<span class="auth-avatar">'+esc(initials)+'</span>'
        + '<span class="auth-name">'+welcomeName+'</span>'
        + '<i class="fa-solid fa-chevron-down auth-chevron" aria-hidden="true"></i>'
        + '</div>'
        + '<div class="auth-dropdown" id="auth-dropdown" hidden role="menu">'
        + '<div class="auth-dropdown-head"><b>'+display+'</b><span>'+esc(user.email)+'</span></div>'
        + '<button class=\"auth-dropdown-item\" id=\"btn-workspace\" role=\"menuitem\"><i class=\"fa-solid fa-table-columns\"></i> '+(window.tr?window.tr("auth.workspace"):"مدیریت محیط کاربری")+'</button>'
        + '<button class=\"auth-dropdown-item\" id=\"btn-change-pass\" role=\"menuitem\"><i class=\"fa-solid fa-key\"></i> '+(window.tr?window.tr("auth.changePass"):"تغییر رمز")+'</button>'
        + '<button class=\"auth-dropdown-item danger\" id=\"btn-logout\" role=\"menuitem\"><i class=\"fa-solid fa-right-from-bracket\"></i> '+(window.tr?window.tr("auth.logout"):"خروج از حساب")+'</button>'
        + '<div class="auth-sep" aria-hidden="true"></div>'
        + '<div class="auth-seg-row"><span>'+(window.tr?window.tr("hdr.lang"):"زبان")+'</span><div class="auth-seg" role="group"><button id="dd-lang-fa" lang="fa">فا</button><button id="dd-lang-en" lang="en">EN</button></div></div>'
        + '<div class="auth-seg-row"><span>'+(window.tr?window.tr("hdr.theme"):"پوسته")+'</span><div class="auth-seg" role="group"><button id="dd-theme-dark" aria-label="dark"><i class="fa-solid fa-moon" aria-hidden="true"></i></button><button id="dd-theme-light" aria-label="light"><i class="fa-solid fa-sun" aria-hidden="true"></i></button></div></div>'
        + '<button class=\"auth-dropdown-item\" id=\"dd-help\" role=\"menuitem\"><i class=\"fa-solid fa-circle-question\"></i> '+(window.tr?window.tr("hdr.help"):"آموزش سریع")+'</button>'
        + '<button class=\"auth-dropdown-item\" id=\"dd-reset\" role=\"menuitem\"><i class=\"fa-solid fa-rotate-left\"></i> '+(window.tr?window.tr("btn.resetCycle"):"بازنشانی داده‌های دوره")+'</button>'
        + '</div>';
      var btn = document.getElementById("auth-user-btn");
      var dd = document.getElementById("auth-dropdown");
      if (btn && dd) {
        // Mobile (≤992px): avatar opens the account bottom sheet sliding
        // from the bottom; desktop toggles the same topbar dropdown card
        // (burger stays the only entry to the nav drawer).
        var openSheetMobile = function(e){
          try {
            if (window.matchMedia && window.matchMedia("(max-width:992px)").matches
                && typeof window.openAccountSheet === "function") {
              if (e && e.stopPropagation) e.stopPropagation();
              if (e && e.preventDefault) e.preventDefault();
              window.openAccountSheet();
              return true;
            }
          } catch (e2) {}
          return false;
        };
        btn.addEventListener("click", function(e){ if (openSheetMobile(e)) return; e.stopPropagation(); dd.hidden = !dd.hidden; });
        btn.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ if (openSheetMobile(e)) return; e.preventDefault(); dd.hidden=!dd.hidden; }});
      }
      updateLandingCTA();
      var lo = document.getElementById("btn-logout");
      if (lo) lo.addEventListener("click", function(){ clearAuth(); renderAuthArea(); setGated(true); if(window.Router){ window.Router.go("v-landing"); } else { var land=document.querySelector('.tab[data-v="v-landing"]'); if(land) land.click(); } if(window.toast) toast(window.tr?window.tr("auth.loggedOut"):"خارج شدید"); });
      var cp = document.getElementById("btn-change-pass");
      var wsb=document.getElementById("btn-workspace"); if(wsb) wsb.addEventListener("click", function(){ dd.hidden=true; openWorkspace(); });
      if (cp) cp.addEventListener("click", function(){ dd.hidden=true; showChangePassModal(); });
      /* hamburger contents merged here (v1.8.35): language / theme / help / reset */
      var curLang = "fa";
      try { curLang = document.documentElement.getAttribute("lang") || "fa"; } catch (e) {}
      var lf = document.getElementById("dd-lang-fa"), le = document.getElementById("dd-lang-en");
      if (lf) { lf.classList.toggle("on", curLang !== "en"); lf.setAttribute("aria-pressed", curLang !== "en" ? "true" : "false"); }
      if (le) { le.classList.toggle("on", curLang === "en"); le.setAttribute("aria-pressed", curLang === "en" ? "true" : "false"); }
      var setLangGo = function(l){ dd.hidden = true; if (typeof window.setLang === "function") window.setLang(l); renderAuthArea(); };
      if (lf) lf.addEventListener("click", function(){ setLangGo("fa"); });
      if (le) le.addEventListener("click", function(){ setLangGo("en"); });
      var darkNow = false;
      try { darkNow = document.documentElement.getAttribute("data-theme") === "dark"; } catch (e2) {}
      var td = document.getElementById("dd-theme-dark"), tl = document.getElementById("dd-theme-light");
      if (td) { td.classList.toggle("on", darkNow); td.setAttribute("aria-pressed", darkNow ? "true" : "false"); }
      if (tl) { tl.classList.toggle("on", !darkNow); tl.setAttribute("aria-pressed", !darkNow ? "true" : "false"); }
      var setThemeGo = function(t){ dd.hidden = true; if (typeof window.setTheme === "function") window.setTheme(t); renderAuthArea(); };
      if (td) td.addEventListener("click", function(){ setThemeGo("dark"); });
      if (tl) tl.addEventListener("click", function(){ setThemeGo("light"); });
      var dh = document.getElementById("dd-help");
      if (dh) dh.addEventListener("click", function(){ dd.hidden = true; if (typeof window.showHelp === "function") window.showHelp(); });
      var dr = document.getElementById("dd-reset");
      if (dr) dr.addEventListener("click", function(){ dd.hidden = true; var rb = document.getElementById("btn-reset"); if (rb) rb.click(); });
      // close on outside click
      setTimeout(function(){
        document.addEventListener("click", function closeDD(e){
          if (!area.contains(e.target)) dd.hidden = true;
        }, { once: false });
      }, 100);
    } else {
      var loginBtnHtml = '<button class="btn btn-primary auth-login-btn" id="btn-open-auth" aria-label="'+(window.tr?(window.tr("landing.login")+" / "+window.tr("auth.registerTab")):"ورود / ثبت‌نام")+'"><i class="fa-solid fa-user" aria-hidden="true"></i><span class="auth-btn-label"> '+(window.tr?(window.tr("landing.login")+" / "+window.tr("auth.registerTab")):"ورود / ثبت‌نام")+'</span></button>';
      area.innerHTML = loginBtnHtml;
      var ob = document.getElementById("btn-open-auth");
      if (ob) ob.addEventListener("click", function(){ showAuthModal("login"); });
      updateLandingCTA();
    }
    /* status ring on the mobile round trigger: green = logged in, red = logged out */
    try {
      var authArea = document.getElementById("auth-area");
      if (authArea) {
        var logged = !!(getToken() && isTokenValid(getToken()) && getUser());
        authArea.classList.toggle("is-logged-in", logged);
        authArea.classList.toggle("is-logged-out", !logged);
      }
    } catch (e) {}
  }

  /* ---------- MobileAccountSheet: bottom sheet for the user account ------
     Mobile-only (≤992px, CSS-gated). Avatar tap renders the sheet fresh from
     the current session (name/email/theme/version) and slides it up over a
     dimmed dashboard. Every row maps to an EXISTING action — no new routes,
     no new backend, desktop and burger behavior untouched. */
  function sheetT(k, fb){ return (window.tr ? window.tr(k) : fb); }
  function doLogout(){
    clearAuth(); renderAuthArea(); setGated(true);
    if (window.Router) { window.Router.go("v-landing"); }
    else { var land = document.querySelector('.tab[data-v="v-landing"]'); if (land) land.click(); }
    if (window.toast) toast(sheetT("auth.loggedOut", "خارج شدید"));
  }
  function sheetThemeIsDark(){
    try { return document.documentElement.getAttribute("data-theme") === "dark"; }
    catch (e) { return false; }
  }
  function renderAccountSheet(){
    var sheet = document.getElementById("account-sheet");
    if (!sheet) return null;
    var user = getUser();
    if (!user || !isTokenValid(getToken())) { sheet.innerHTML = ""; return null; }
    var initials = (user.full_name || user.username || user.email || "U").trim().charAt(0).toUpperCase();
    var display = esc(user.full_name || user.username || user.email.split("@")[0]);
    var ver = window.SITE_VERSION || "";
    var dark = sheetThemeIsDark();
    sheet.innerHTML =
      '<span class="sheet-handle" aria-hidden="true"></span>'
      + '<div class="sheet-profile"><span class="sheet-avatar">' + esc(initials) + '</span>'
      + '<div class="sheet-user"><b id="sheet-user-name">' + display + '</b><span>' + esc(user.email) + '</span>'
      + '<button class="sheet-profile-btn" id="sheet-view-profile"><i class="fa-solid fa-user" aria-hidden="true"></i> ' + sheetT("sheet.viewProfile", "مشاهده پروفایل") + '</button>'
      + '</div></div>'
      + '<div class="sheet-menu" role="menu" aria-label="' + sheetT("sheet.account", "حساب کاربری") + '">'
      + '<button class="sheet-item" id="sheet-profile-item" role="menuitem"><i class="fa-solid fa-user" aria-hidden="true"></i><span>' + sheetT("sheet.profile", "پروفایل کاربری") + '</span><i class="fa-solid fa-chevron-left chev" aria-hidden="true"></i></button>'
      + '<button class="sheet-item" id="sheet-help-item" role="menuitem"><i class="fa-solid fa-headset" aria-hidden="true"></i><span>' + sheetT("sheet.help", "راهنما و پشتیبانی") + '</span><i class="fa-solid fa-chevron-left chev" aria-hidden="true"></i></button>'
      + '<button class="sheet-item" id="sheet-about-item" role="menuitem"><i class="fa-solid fa-circle-info" aria-hidden="true"></i><span>' + sheetT("sheet.about", "درباره ما") + '</span><i class="fa-solid fa-chevron-left chev" aria-hidden="true"></i></button>'
      + '</div>'
      + '<div class="sheet-segcard"><span>' + sheetT("hdr.lang", "زبان") + '</span><div class="sheet-seg" role="group"><button id="sheet-lang-fa" lang="fa">فا</button><button id="sheet-lang-en" lang="en">EN</button></div></div>'
      + '<button class="sheet-logout" id="sheet-logout"><i class="fa-solid fa-right-from-bracket" aria-hidden="true"></i> ' + sheetT("sheet.logout", "خروج از حساب کاربری") + '</button>'
      + '<div class="sheet-util"><span class="sheet-ver">' + sheetT("sheet.version", "نسخه") + ' ' + esc(ver) + '</span>'
      + '<span class="sheet-theme"><span>' + sheetT("sheet.darkMode", "حالت تیره") + '</span>'
      + '<button class="sheet-switch" id="sheet-theme-switch" role="switch" aria-checked="' + (dark ? "true" : "false") + '" aria-label="' + sheetT("sheet.darkMode", "حالت تیره") + '"></button>'
      + '</span></div>';
    var closeFirst = function(fn){ return function(){ closeAccountSheet(); if (fn) fn(); }; };
    var on = function(id, fn){ var el = document.getElementById(id); if (el) el.addEventListener("click", closeFirst(fn)); };
    on("sheet-view-profile", function(){ openWorkspace(); });
    on("sheet-profile-item", function(){ openWorkspace(); });
    on("sheet-help-item", function(){ if (typeof window.showHelp === "function") window.showHelp(); });
    on("sheet-about-item", function(){ if (window.Router) window.Router.go("v-about"); });
    var curLang = "fa";
    try { curLang = document.documentElement.getAttribute("lang") || "fa"; } catch (e4) {}
    var slf = document.getElementById("sheet-lang-fa"), sle = document.getElementById("sheet-lang-en");
    var paintLang = function(){
      try { curLang = document.documentElement.getAttribute("lang") || "fa"; } catch (e5) {}
      if (slf) { slf.classList.toggle("on", curLang !== "en"); slf.setAttribute("aria-pressed", curLang !== "en" ? "true" : "false"); }
      if (sle) { sle.classList.toggle("on", curLang === "en"); sle.setAttribute("aria-pressed", curLang === "en" ? "true" : "false"); }
    };
    paintLang();
    if (slf) slf.addEventListener("click", function(){ closeAccountSheet(); if (typeof window.setLang === "function") window.setLang("fa"); renderAuthArea(); });
    if (sle) sle.addEventListener("click", function(){ closeAccountSheet(); if (typeof window.setLang === "function") window.setLang("en"); renderAuthArea(); });
    var lo = document.getElementById("sheet-logout");
    if (lo) lo.addEventListener("click", function(){ closeAccountSheet(); doLogout(); });
    var sw = document.getElementById("sheet-theme-switch");
    if (sw) sw.addEventListener("click", function(e){
      e.stopPropagation();
      var isDark = sheetThemeIsDark();
      var target = document.getElementById(isDark ? "theme-light" : "theme-dark");
      if (target) { target.click(); }
      else {
        try { localStorage.setItem("rossim_theme", isDark ? "light" : "dark"); } catch (e2) {}
        try { document.documentElement.setAttribute("data-theme", isDark ? "light" : "dark"); } catch (e3) {}
      }
      sw.setAttribute("aria-checked", sheetThemeIsDark() ? "true" : "false");
    });
    return sheet;
  }
  function wireSheetSwipe(sheet){
    if (!sheet || sheet.__swipeWired) return;
    sheet.__swipeWired = true;
    var startY = 0, dy = 0, dragging = false;
    sheet.addEventListener("touchstart", function(e){
      if (sheet.scrollTop > 0) return;
      dragging = true; startY = e.touches[0].clientY; dy = 0;
    }, { passive: true });
    sheet.addEventListener("touchmove", function(e){
      if (!dragging) return;
      dy = e.touches[0].clientY - startY;
      if (dy > 0) sheet.style.transform = "translateY(" + dy + "px)";
    }, { passive: true });
    sheet.addEventListener("touchend", function(){
      if (!dragging) return;
      dragging = false; sheet.style.transform = "";
      if (dy > 110) closeAccountSheet();
      dy = 0;
    });
  }
  function openAccountSheet(){
    var sheet = renderAccountSheet();
    if (!sheet) { showAuthModal("login"); return false; }
    var bd = document.getElementById("sheet-backdrop");
    sheet.hidden = false; sheet.classList.add("open");
    if (bd) { bd.hidden = false; bd.classList.add("open"); }
    try { document.body.style.overflow = "hidden"; } catch (e) {}
    requestAnimationFrame(function(){ requestAnimationFrame(function(){
      sheet.classList.add("show"); if (bd) bd.classList.add("show");
    }); });
    wireSheetSwipe(sheet);
    try { sheet.setAttribute("tabindex", "-1"); sheet.focus({ preventScroll: true }); } catch (e2) {}
    return true;
  }
  function closeAccountSheet(){
    var sheet = document.getElementById("account-sheet");
    if (!sheet || !sheet.classList.contains("open")) return;
    var bd = document.getElementById("sheet-backdrop");
    sheet.classList.remove("show"); if (bd) bd.classList.remove("show");
    try { document.body.style.overflow = ""; } catch (e) {}
    setTimeout(function(){
      sheet.classList.remove("open"); sheet.hidden = true;
      if (bd) { bd.classList.remove("open"); bd.hidden = true; }
    }, 300);
  }
  window.openAccountSheet = openAccountSheet;
  window.closeAccountSheet = closeAccountSheet;
  (function initSheetDismiss(){
    if (window.__sheetDismissInit) return;
    window.__sheetDismissInit = true;
    var bd = document.getElementById("sheet-backdrop");
    if (bd) bd.addEventListener("click", function(){ closeAccountSheet(); });
    document.addEventListener("keydown", function(e){
      if (e.key === "Escape") closeAccountSheet();
    });
  })();

  // ---- Modal ----
  function ensureModal() {
    if (document.getElementById("auth-modal")) return;
    var html = '<div class="auth-modal-backdrop" id="auth-modal" hidden role="dialog" aria-modal="true" aria-label="Authentication">'
      + '<div class="auth-modal">'
      + '<button class="auth-modal-close" id="auth-modal-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button>'
      + '<div class="auth-modal-head"><img src="logo_32.png" alt="" width="28" height="28"><div><b>'+(window.tr?window.tr("brand.name"):"آرین")+'</b><span>'+(window.tr?window.tr("auth.loginTitle"):"ورود به پنل کاربری")+'</span></div></div>'
      + '<div class="auth-tabs" role="tablist"><button class="auth-tab on" data-tab="login" role="tab" aria-selected="true">'+(window.tr?window.tr("auth.loginTab"):"ورود")+'</button><button class="auth-tab" data-tab="register" role="tab">'+(window.tr?window.tr("auth.registerTab"):"ثبت‌نام")+'</button></div>'
      + '<form id="auth-form-login" class="auth-form on">'
      + '<label>'+(window.tr?window.tr("auth.identLabel"):"ایمیل یا نام کاربری")+'<input id="login-ident" type="text" autocomplete="username" placeholder="you@example.com" required></label>'
      + '<label>'+(window.tr?window.tr("auth.passLabel"):"رمز عبور")+'<input id="login-pass" type="password" autocomplete="current-password" placeholder="••••••" required></label>'
      + '<div class="auth-error" id="login-error" hidden></div>'
      + '<button type="submit" class="btn btn-primary auth-submit"><i class="fa-solid fa-right-to-bracket"></i> '+(window.tr?window.tr("auth.loginBtn"):"ورود")+'</button>'
      + '<div class="auth-hint">'+(window.tr?window.tr("auth.hintNoAccount"):"حساب ندارید؟")+' <a href="#" id="hint-to-register">'+(window.tr?window.tr("auth.hintRegister"):"ثبت‌نام کنید")+'</a></div>'
      + '</form>'
      + '<form id="auth-form-register" class="auth-form">'
      + '<label>'+(window.tr?window.tr("auth.nameLabel"):"نام کامل")+'<input id="reg-name" type="text" autocomplete="name" placeholder="'+(window.tr?window.tr("auth.nameLabel"):"نام کامل")+'"></label>'
      + '<label>'+(window.tr?window.tr("auth.emailLabel"):"ایمیل *")+'<input id="reg-email" type="email" autocomplete="email" placeholder="you@example.com" required></label>'
      + '<label>'+(window.tr?window.tr("auth.usernameLabel"):"نام کاربری")+'<input id="reg-username" type="text" autocomplete="username" placeholder="'+(window.tr?window.tr("auth.usernameLabel"):"نام کاربری")+'"></label>'
      + '<label>'+(window.tr?window.tr("auth.passLabel2"):"رمز عبور *")+'<input id="reg-pass" type="password" autocomplete="new-password" placeholder="••••••" required></label>'
      + '<label>'+(window.tr?window.tr("auth.confirmPassLabel"):"تکرار رمز")+'<input id="reg-pass2" type="password" autocomplete="new-password" placeholder="••••••" required></label>'
      + '<div class="auth-error" id="reg-error" hidden></div>'
      + '<button type="submit" class="btn btn-primary auth-submit"><i class="fa-solid fa-user-plus"></i> '+(window.tr?window.tr("auth.registerBtn"):"ثبت‌نام")+'</button>'
      + '<div class="auth-hint">'+(window.tr?window.tr("auth.hintHasAccount"):"حساب دارید؟")+' <a href="#" id="hint-to-login">'+(window.tr?window.tr("auth.hintLogin"):"وارد شوید")+'</a></div>'
      + '</form>'
      + '</div></div>';
    document.body.insertAdjacentHTML("beforeend", html);
    // tabs
    var tabs = document.querySelectorAll(".auth-tab");
    tabs.forEach(function(t){
      t.addEventListener("click", function(){ switchTab(t.dataset.tab); });
    });
    document.getElementById("hint-to-register").addEventListener("click", function(e){ e.preventDefault(); switchTab("register"); });
    document.getElementById("hint-to-login").addEventListener("click", function(e){ e.preventDefault(); switchTab("login"); });
    document.getElementById("auth-modal-close").addEventListener("click", function(){ hideAuthModal(true); });
    document.getElementById("auth-modal").addEventListener("click", function(e){ if(e.target.id==="auth-modal") hideAuthModal(false); });
    // forms
    document.getElementById("auth-form-login").addEventListener("submit", onLogin);
    document.getElementById("auth-form-register").addEventListener("submit", onRegister);
  }
  function switchTab(which){
    document.querySelectorAll(".auth-tab").forEach(function(t){ t.classList.toggle("on", t.dataset.tab===which); t.setAttribute("aria-selected", t.dataset.tab===which); });
    document.getElementById("auth-form-login").classList.toggle("on", which==="login");
    document.getElementById("auth-form-register").classList.toggle("on", which==="register");
  }
  function showAuthModal(tab, opts){
    ensureModal();
    switchTab(tab||"login");
    var m=document.getElementById("auth-modal");
    m.hidden = false;
    document.body.style.overflow = "hidden";
    if(opts && opts.gated) m.dataset.gated="1"; else delete m.dataset.gated;
    var closeBtn=document.getElementById("auth-modal-close"); if(closeBtn) closeBtn.style.display = (opts && opts.gated) ? "none" : "";
  }
  function hideAuthModal(force){
    var gm=document.getElementById("auth-modal"); if(gm && gm.dataset.gated=="1" && !force) return;
    var m=document.getElementById("auth-modal");
    if(m) m.hidden=true;
    document.body.style.overflow="";
  }
  function showError(id, msg){
    var el=document.getElementById(id);
    if(!el) return;
    el.textContent=msg; el.hidden=!msg;
  }
  function onLogin(e){
    e.preventDefault();
    var ident=document.getElementById("login-ident").value.trim();
    var pass=document.getElementById("login-pass").value;
    if(!ident||!pass) return showError("login-error",window.tr?window.tr("auth.errIdentPass"):"ایمیل و رمز الزامی است");
    showError("login-error","");
    var btn=e.target.querySelector("button[type=submit]"); if(btn) btn.disabled=true;
    fetch(apiBase()+"/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email:ident,password:pass})})
      .then(function(r){ if(!r.ok) return r.json().then(function(j){throw new Error(j.detail|| (window.tr?window.tr("auth.changeFail"):"خطا"));}); return r.json(); })
      .then(function(j){ setAuth(j.access_token, j.user); renderAuthArea(); updateLandingCTA(); hideAuthModal(true); setGated(false); if(window.Router){ window.Router.redirectAfterLogin(); } else { openWorkspace(); } if(window.toast) toast((window.tr?window.tr("auth.welcome"):"خوش آمدید، ")+(j.user.full_name||j.user.email)); })
      .catch(function(err){ showError("login-error", err.message|| (window.tr?window.tr("auth.errLoginFail"):"ورود ناموفق")); })
      .finally(function(){ if(btn) btn.disabled=false; });
  }
  function onRegister(e){
    e.preventDefault();
    var name=document.getElementById("reg-name").value.trim();
    var email=document.getElementById("reg-email").value.trim();
    var username=document.getElementById("reg-username").value.trim();
    var pass=document.getElementById("reg-pass").value;
    var pass2=document.getElementById("reg-pass2").value;
    if(!email||!pass) return showError("reg-error",window.tr?window.tr("auth.errIdentPass"):"ایمیل و رمز الزامی است");
    if(pass.length<6) return showError("reg-error",window.tr?window.tr("auth.errPassShort"):"رمز حداقل ۶ کاراکتر");
    if(pass!==pass2) return showError("reg-error",window.tr?window.tr("auth.errPassMismatch"):"تکرار رمز مطابقت ندارد");
    showError("reg-error","");
    var btn=e.target.querySelector("button[type=submit]"); if(btn) btn.disabled=true;
    var payload={email:email,password:pass};
    if(name) payload.full_name=name;
    if(username) payload.username=username;
    fetch(apiBase()+"/api/auth/register",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)})
      .then(function(r){ if(!r.ok) return r.json().then(function(j){throw new Error(j.detail|| (window.tr?window.tr("auth.changeFail"):"خطا"));}); return r.json(); })
      .then(function(j){ setAuth(j.access_token, j.user); renderAuthArea(); updateLandingCTA(); hideAuthModal(true); setGated(false); if(window.Router){ window.Router.redirectAfterLogin(); } else { openWorkspace(); } if(window.toast) toast(window.tr?"Sign-up successful — "+window.tr("auth.welcome").trim(): "ثبت‌نام موفق — خوش آمدید"); })
      .catch(function(err){ showError("reg-error", err.message|| (window.tr?window.tr("auth.errRegisterFail"):"ثبت‌نام ناموفق")); })
      .finally(function(){ if(btn) btn.disabled=false; });
  }
  function showChangePassModal(){
    if(window.MDialog){
      MDialog.prompt2({title:window.tr?window.tr("auth.changeTitle"):"تغییر رمز عبور", message:window.tr?window.tr("auth.changeMsg"):"رمز فعلی و رمز جدید خود را وارد کنید.", placeholder:window.tr?window.tr("auth.changePh1"):"رمز فعلی", placeholder2:window.tr?window.tr("auth.changePh2"):"رمز جدید (حداقل ۶ کاراکتر)", confirmText:window.tr?window.tr("auth.changeBtn"):"تغییر رمز", cancelText:window.tr?window.tr("dialog.cancel"):"انصراف", icon:"info"}).then(function(vals){
        if(!vals) return;
        apiAuth("/api/auth/change-password",{method:"POST",body:JSON.stringify({old_password:vals.old,new_password:vals.nw})})
          .then(function(){ if(window.MDialog) MDialog.alert({title:window.tr?window.tr("dialog.confirm"):"موفق", message:window.tr?window.tr("auth.changeOk"):"رمز با موفقیت تغییر کرد.", icon:"success"}); else alert(window.tr?window.tr("auth.alertOk"):"رمز با موفقیت تغییر کرد"); })
          .catch(function(e){ if(window.MDialog) MDialog.alert({title:window.tr?window.tr("dialog.confirm"):"خطا", message:e.message|| (window.tr?window.tr("auth.changeFail"):"خطا در تغییر رمز"), icon:"danger"}); else alert((window.tr?window.tr("dev.backendError"):"خطا: ")+e.message); });
      });
      return;
    }
    var oldp = prompt(window.tr?window.tr("auth.promptOld"):"رمز فعلی را وارد کنید:");
    if(oldp===null) return;
    var newp = prompt(window.tr?window.tr("auth.promptNew"):"رمز جدید (حداقل ۶ کاراکتر):");
    if(newp===null||!newp) return;
    if(newp.length<6) return alert(window.tr?window.tr("auth.alertShort"):"رمز کوتاه است");
    apiAuth("/api/auth/change-password",{method:"POST",body:JSON.stringify({old_password:oldp,new_password:newp})})
      .then(function(){ alert(window.tr?window.tr("auth.alertOk"):"رمز با موفقیت تغییر کرد"); })
      .catch(function(e){ alert((window.tr?window.tr("dev.backendError"):"خطا: ")+e.message); });
  }

  // expose
  window.showAuthModal = showAuthModal;
  window.hideAuthModal = hideAuthModal;
  window.renderAuthArea = renderAuthArea;
  window.reportUnauthorized = function(){
    try{ if (getToken()) { clearAuth(); renderAuthArea(); } }catch(e){}
    setGated(true);
    var cur2=document.querySelector("section.view.on"); var isPub2=cur2 && ((window.Router&&window.Router.isPublic(cur2.id)) || cur2.id==="v-landing" || cur2.id==="v-about");
    if(!isPub2) showAuthModal("login", {gated:true});
  };

  // init on DOM ready
  function updateLandingCTA(){
    var ll=document.getElementById("landing-login");
    var le=document.getElementById("landing-enter");
    var lr=document.getElementById("landing-register");
    var authed = isTokenValid(getToken()) && !!getUser();
    if(ll){
      if(authed){
        ll.innerHTML='<i class="fa-solid fa-table-columns"></i> '+(window.tr?window.tr('auth.workspace'):'مدیریت محیط کاربری');
        ll.title=(window.tr?window.tr('ws.btn.dash'):'رفتن به محیط کاربری');
      } else {
        ll.innerHTML='<i class="fa-solid fa-right-to-bracket"></i> '+(window.tr?window.tr('landing.login'):'ورود به پنل');
        ll.title='';
      }
    }
    if(le){
      if(authed){ le.innerHTML='<i class="fa-solid fa-table-columns"></i> '+(window.tr?window.tr('auth.workspace'):'مدیریت محیط کاربری'); }
      else { le.innerHTML='<i class="fa-solid fa-arrow-left"></i> '+(window.tr?window.tr('landing.foot.btn'):'ورود و شروع'); }
    }
    if(lr){ lr.style.display = authed ? 'none' : ''; lr.setAttribute('aria-hidden', authed ? 'true' : 'false'); }
  }
  function openWorkspace(){
    setGated(false);
    if(window.Router){ window.Router.go("v-workspace"); return; }
    document.querySelectorAll("section.view").forEach(function(s){ s.classList.remove("on"); });
    var ws=document.getElementById("v-workspace"); if(ws) ws.classList.add("on");
    document.querySelectorAll(".tab").forEach(function(tb){ tb.classList.toggle("on", tb.dataset.v==="v-workspace"); });
    if(window.scrollTo) window.scrollTo({top:0,behavior:"smooth"});
    if(typeof renderWorkspace==='function') renderWorkspace();
  }
  function renderWorkspace(){
    var u=getUser(); if(!u) return;
    var av=document.getElementById("ws-avatar"); if(av) av.textContent=(u.full_name||u.username||u.email||"ق").trim().charAt(0).toUpperCase();
    var nm=document.getElementById("ws-name"); if(nm) nm.textContent=(window.tr?window.tr("ws.prefix"):"محیط کاربری — ")+(u.full_name||u.username||u.email.split("@")[0]);
    var em=document.getElementById("ws-email"); if(em) em.textContent=u.email+(window.tr?window.tr("ws.isolated"):" — داده‌های شما کاملاً اختصاصی و ایزوله است");
    var role=document.getElementById("ws-role"); if(role) role.textContent=(u.role==='admin'?(window.tr?window.tr("ws.role.admin"):"مدیر"):(window.tr?window.tr("ws.role.user"):"کاربر"))+(u.role_code?' • '+u.role_code:'');
    try{ apiAuth("/api/cycles").then(function(js){ var arr=Array.isArray(js)?js:(js.cycles||js.items||[]); var el=document.getElementById("ws-n-cycles"); if(el) el.textContent=String(arr.length); }).catch(function(){}); }catch(e){}
    try{ apiAuth("/api/scenarios").then(function(js){ var arr=Array.isArray(js)?js:(js.scenarios||js.items||[]); var el=document.getElementById("ws-n-scenarios"); if(el) el.textContent=String(arr.length); }).catch(function(){}); }catch(e){}
    try{ apiAuth("/api/device/records?limit=1").then(function(js){ var n=(js.total!=null?js.total:(Array.isArray(js)?js.length:0)); var el=document.getElementById("ws-n-device"); if(el) el.textContent=String(n); }).catch(function(){}); }catch(e){}
  }
  function wsT(k, fb){ return (window.tr ? window.tr(k) : fb); }
  function wsConfirm(o){
    if (window.MDialog) return window.MDialog.confirm(o);
    return Promise.resolve(window.confirm(o.message || o.title || ""));
  }
  function renderWsCycles(){
    var list = document.getElementById("ws-cy-list");
    if (!list) return;
    apiAuth("/api/cycles").then(function(js){
      var arr = Array.isArray(js) ? js : (js.cycles || js.items || []);
      var nEl = document.getElementById("ws-n-cycles");
      if (nEl) nEl.textContent = String(arr.length);
      if (!arr.length) {
        list.innerHTML = '<div class="ws-cy-empty">' + esc(wsT("ws.cy.empty", "هنوز دوره‌ای ثبت نشده است")) + '</div>';
        return;
      }
      list.innerHTML = arr.map(function(c){
        var code = c.cycle_code || ("#" + c.id);
        return '<div class="ws-cy-row" data-cy="' + c.id + '" data-cy-code="' + esc(code) + '">'
          + '<div class="ws-cy-info"><b>' + esc(c.label || code) + '</b><span>' + esc(code) + ' · <i data-cy-visits>…</i></span></div>'
          + '<div class="ws-cy-act"><button class="ws-cy-reset" data-cy-reset="' + c.id + '"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> ' + esc(wsT("ws.cy.resetData", "ریست داده‌ها")) + '</button>'
          + '<button class="ws-cy-del" data-cy-del="' + c.id + '"><i class="fa-solid fa-trash" aria-hidden="true"></i> ' + esc(wsT("ws.cy.delete", "حذف دوره")) + '</button></div></div>';
      }).join("");
      arr.forEach(function(c){
        apiAuth("/api/cycles/" + c.id + "/stats").then(function(s){
          var cell = list.querySelector('[data-cy="' + c.id + '"] [data-cy-visits]');
          if (cell) cell.textContent = (s.visits || 0) + " " + wsT("ws.cy.visits", "بازدید") + " · " + (s.device_rows || 0) + " " + wsT("ws.cy.rows", "رکورد");
        }).catch(function(){});
      });
    }).catch(function(){
      list.innerHTML = '<div class="ws-cy-empty">' + esc(wsT("ws.cy.empty", "هنوز دوره‌ای ثبت نشده است")) + '</div>';
    });
  }
  window.openWorkspace=openWorkspace;
  window.renderWorkspace=renderWorkspace;
  window.updateLandingCTA=updateLandingCTA;
  try{window.addEventListener("rossim:lang", function(){ try{updateLandingCTA()}catch(e){} ; try{renderAuthArea()}catch(e){} })}catch(e){}
  function setGated(on){
    document.body.classList.toggle("needs-auth", !!on);
    // X button visibility is controlled per-modal (opts.gated), not by body state - keep it visible for on-demand login
  }
  // Make body visible after decision to avoid FOUC
  function revealBody(){ document.documentElement.style.visibility=""; document.body.style.visibility=""; }
  function init(){
    renderAuthArea();
    var tok=getToken();
    var usr=getUser();
    var validLocal = isTokenValid(tok);
    if(tok && validLocal && usr){
      // Instant ungate from cache - no flash
      setGated(false);

      // validate silently in background (refresh user data, catch expiry)
      fetch(apiBase()+"/api/auth/me",{headers:{"Authorization":"Bearer "+tok}})
        .then(function(r){ if(r.status===401) throw {auth:true}; if(!r.ok) throw {soft:true}; return r.json(); })
        .then(function(u){ setAuth(tok,u); renderAuthArea(); })
        .catch(function(err){
          /* real 401 = stale token → logout; 429/network = transient → keep session */
          if(err && err.auth){ clearAuth(); renderAuthArea(); setGated(true); ensureModal(); showAuthModal("login", {gated:true}); }
        });
      revealBody();
      return;
    }
    if(tok && validLocal){
      setGated(false);
      fetch(apiBase()+"/api/auth/me",{headers:{"Authorization":"Bearer "+tok}})
        .then(function(r){ if(r.status===401) throw {auth:true}; if(!r.ok) throw {soft:true}; return r.json(); })
        .then(function(u){ setAuth(tok,u); renderAuthArea(); })
        .catch(function(err){
          if(err && err.auth){ clearAuth(); renderAuthArea(); setGated(true); ensureModal(); showAuthModal("login", {gated:true}); }
          revealBody();
        });
      revealBody();
      return;
    }
    if(tok && !validLocal){
      // expired locally
      clearAuth(); renderAuthArea();
      setGated(true); revealBody();
      return;
    }
    // no token - public landing, no forced modal (login on demand)
    setGated(true); revealBody();
  }
  function goToDashboard(){ setGated(false); if(window.Router){ window.Router.go("v-dash"); } else if(dash){ var dash=document.querySelector('.tab[data-v="v-dash"]'); if(dash) dash.click(); } if(window.toast) toast("خوش آمدید!"); }
  window.goToDashboard=goToDashboard;
  window.showAuthModal=showAuthModal;

  // Landing CTA wiring
  document.addEventListener("DOMContentLoaded", function(){
    function bindLanding(){
      var lLogin=document.getElementById("landing-login");
      var lReg=document.getElementById("landing-register");
      var lEnter=document.getElementById("landing-enter");
      var lGuest=document.getElementById("landing-guest");
      if(lLogin) lLogin.addEventListener("click", function(){ if(isTokenValid(getToken()) && getUser()){ openWorkspace(); } else { showAuthModal("login", {gated:false}); } });
      if(lReg) lReg.addEventListener("click", function(){ showAuthModal("register", {gated:false}); });
      if(lEnter) lEnter.addEventListener("click", function(){ if(isTokenValid(getToken()) && getUser()){ openWorkspace(); } else { showAuthModal("login", {gated:false}); } });
      if(lGuest) lGuest.addEventListener("click", function(){ var el=document.querySelector(".landing-grid"); if(el) el.scrollIntoView({behavior:"smooth"}); });
    }
    bindLanding();
    document.addEventListener("click", function(e){
      var card=e.target.closest(".ws-card[data-go]");
      if(card){ if(window.Router){ window.Router.go(card.getAttribute("data-go")); } return; }
      if(e.target.closest("#ws-go-dash")){ if(window.Router){ window.Router.go("v-dash"); } return; }
      if(e.target.closest("#ws-change-pass")){ showChangePassModal(); return; }
      if(e.target.closest("#ws-cycles-stat")){
        var cyp = document.getElementById("ws-cycles-panel");
        if (cyp) {
          var showIt = cyp.hidden;
          cyp.hidden = !showIt;
          if (showIt) { renderWsCycles(); try { cyp.scrollIntoView({behavior:"smooth", block:"nearest"}); } catch (e2) {} }
        }
        return;
      }
      if(e.target.closest("#ws-cy-close")){ var cyp2 = document.getElementById("ws-cycles-panel"); if (cyp2) cyp2.hidden = true; return; }
      var cyR = e.target.closest("[data-cy-reset]");
      if (cyR) {
        (function(btn){
          var id = btn.getAttribute("data-cy-reset");
          var row = btn.closest(".ws-cy-row");
          var code = row ? row.getAttribute("data-cy-code") : ("#" + id);
          wsConfirm({title: wsT("ws.cy.resetTitle", "ریست داده‌های دوره"),
            message: wsT("ws.cy.resetMsg", "داده‌های دوره {code} پاک شود؟").replace("{code}", code),
            icon: "danger", danger: true,
            confirmText: wsT("ws.cy.resetData", "ریست داده‌ها"),
            cancelText: wsT("dialog.cancel", "انصراف")}).then(function(ok){
            if (!ok) return;
            apiAuth("/api/cycles/" + id + "/data", {method: "DELETE"}).then(function(){
              if (window.toast) toast(wsT("ws.cy.resetDone", "داده‌های دوره پاک شد"));
              renderWsCycles();
            }).catch(function(err){ if (window.toast) toast(String((err && err.message) || err)); });
          });
        })(cyR);
        return;
      }
      var cyD = e.target.closest("[data-cy-del]");
      if (cyD) {
        (function(btn){
          var id = btn.getAttribute("data-cy-del");
          var row = btn.closest(".ws-cy-row");
          var code = row ? row.getAttribute("data-cy-code") : ("#" + id);
          wsConfirm({title: wsT("dev.deleteTitle", "حذف دوره"),
            message: wsT("dev.deleteMsg", "دوره {code} حذف شود؟").replace("{code}", code),
            icon: "danger", danger: true,
            confirmText: wsT("dev.deleteConfirm", "حذف"),
            cancelText: wsT("dialog.cancel", "انصراف")}).then(function(ok){
            if (!ok) return;
            apiAuth("/api/cycles/" + id, {method: "DELETE"}).then(function(){
              if (window.toast) toast(wsT("ws.cy.deleted", "دوره حذف شد"));
              renderWsCycles();
            }).catch(function(err){ if (window.toast) toast(String((err && err.message) || err)); });
          });
        })(cyD);
        return;
      }
      if(e.target.closest("#ws-logout")){ clearAuth(); renderAuthArea(); updateLandingCTA(); setGated(true); if(window.Router){ window.Router.go("v-landing"); } else { document.querySelectorAll("section.view").forEach(function(s){s.classList.remove("on")}); var l=document.getElementById("v-landing"); if(l) l.classList.add("on"); } if(window.toast) toast(window.tr?window.tr("auth.loggedOut"):"خارج شدید"); return; }
      if(e.target.closest("#ws-back-landing")){ if(window.Router){ window.Router.go("v-landing"); } return; }
    });
    updateLandingCTA();
    // Also hook successful auth to go dashboard
    var origSetAuth = window.setAuth;
    // Intercept modal success: listen for custom event or patch hide
  });

  window.setGated=setGated;
  if(document.readyState==="loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // Intercept unauthenticated API usage: if no token and user tries device actions, prompt login
  document.addEventListener("click", function(e){
    // optional: could gate specific buttons, but we keep it lazy (401 handles it)
  });
})();