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
    var areaD = document.getElementById("auth-area-drawer");
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
        + '</div>';
      var btn = document.getElementById("auth-user-btn");
      var dd = document.getElementById("auth-dropdown");
      if (btn && dd) {
        btn.addEventListener("click", function(e){ e.stopPropagation(); dd.hidden = !dd.hidden; });
        btn.addEventListener("keydown", function(e){ if(e.key==="Enter"||e.key===" "){ e.preventDefault(); dd.hidden=!dd.hidden; }});
      }
      updateLandingCTA();
      var lo = document.getElementById("btn-logout");
      if (lo) lo.addEventListener("click", function(){ clearAuth(); renderAuthArea(); setGated(true); if(window.Router){ window.Router.go("v-landing"); } else { var land=document.querySelector('.tab[data-v="v-landing"]'); if(land) land.click(); } if(window.toast) toast(window.tr?window.tr("auth.loggedOut"):"خارج شدید"); });
      var cp = document.getElementById("btn-change-pass");
      var wsb=document.getElementById("btn-workspace"); if(wsb) wsb.addEventListener("click", function(){ dd.hidden=true; openWorkspace(); });
      if (cp) cp.addEventListener("click", function(){ dd.hidden=true; showChangePassModal(); });
      // close on outside click
      setTimeout(function(){
        document.addEventListener("click", function closeDD(e){
          if (!area.contains(e.target)) dd.hidden = true;
          if (areaD && !areaD.contains(e.target)) { var dd2=document.getElementById("auth-dropdown-drawer"); if (dd2) dd2.hidden = true; }
        }, { once: false });
      }, 100);
      /* mirror into the mobile drawer (only exists ≤992px, but render regardless) */
      if (areaD) {
        areaD.innerHTML = area.innerHTML
          .replace('id="auth-user-btn"', 'id="auth-user-btn-drawer"')
          .replace('id="auth-dropdown"', 'id="auth-dropdown-drawer"')
          .replace('id="btn-workspace"', 'id="btn-workspace-drawer"')
          .replace('id="btn-change-pass"', 'id="btn-change-pass-drawer"')
          .replace('id="btn-logout"', 'id="btn-logout-drawer"')
          .replace('class="auth-user"', 'class="auth-user auth-user--drawer"');
        var chipD = document.getElementById("auth-user-btn-drawer");
        var ddD = document.getElementById("auth-dropdown-drawer");
        if (chipD && ddD) {
          chipD.addEventListener("click", function(e){ e.stopPropagation(); ddD.hidden = !ddD.hidden; });
          var wD = document.getElementById("btn-workspace-drawer");
          var cD = document.getElementById("btn-change-pass-drawer");
          var lD = document.getElementById("btn-logout-drawer");
          if (wD) wD.addEventListener("click", function(){ ddD.hidden=true; openWorkspace(); });
          if (cD) cD.addEventListener("click", function(){ ddD.hidden=true; showChangePassModal(); });
          if (lD) lD.addEventListener("click", function(){
            ddD.hidden=true; clearAuth(); renderAuthArea(); setGated(true);
            if(window.Router){ window.Router.go("v-landing"); }
            if(window.toast) toast(window.tr?window.tr("auth.loggedOut"):"خارج شدید");
          });
        }
      }
    } else {
      var loginBtnHtml = '<button class="btn btn-primary auth-login-btn" id="btn-open-auth" aria-label="'+(window.tr?(window.tr("landing.login")+" / "+window.tr("auth.registerTab")):"ورود / ثبت‌نام")+'"><i class="fa-solid fa-user" aria-hidden="true"></i><span class="auth-btn-label"> '+(window.tr?(window.tr("landing.login")+" / "+window.tr("auth.registerTab")):"ورود / ثبت‌نام")+'</span></button>';
      area.innerHTML = loginBtnHtml;
      if (areaD) {
        areaD.innerHTML = loginBtnHtml.replace('id="btn-open-auth"', 'id="btn-open-auth-drawer"');
        var obd = document.getElementById("btn-open-auth-drawer");
        if (obd) obd.addEventListener("click", function(){ closeDrawer(); showAuthModal("login"); });
      }
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