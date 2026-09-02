/* =====================================================================
   Arian Router — centralized hash-based SPA routing
   Owns: route table, guards (public/protected), redirects, 404,
         history (back/forward), deep links, active-nav sync,
         per-route document title. Locale stays OUT of the URL
         (localStorage rossim_lang) — language switch never breaks route.
   ===================================================================== */
"use strict";
(function () {
  /* ---- Central route table (single source of truth) ----
     v: section id | public: no login needed | i18n: nav key for title
     group: nav group for active-state | alias: legacy paths */
  var ROUTES = [
    { path: "/",             view: "v-landing",   public: true,  i18n: "nav.landing" },
    { path: "/about",        view: "v-about",     public: true,  i18n: "nav.about" },
    { path: "/products",     view: "v-products",  public: true,  i18n: "nav.products" },
    { path: "/feed",         view: "v-feed",      public: false, i18n: "nav.feedGroup", group: "feed" },
    { path: "/dashboard",    view: "v-dash",      public: false, i18n: "nav.dash",      group: "feed" },
    { path: "/trial",        view: "v-exp",       public: false, i18n: "nav.exp",       group: "feed" },
    { path: "/farm",         view: "v-farm",      public: false, i18n: "nav.farm",      group: "feed" },
    { path: "/live",         view: "v-sim",       public: false, i18n: "nav.sim",       group: "feed" },
    { path: "/scenarios",    view: "v-scn",       public: false, i18n: "nav.scn",       group: "feed" },
    { path: "/device",       view: "v-dev",       public: false, i18n: "nav.dev",       group: "feed" },
    { path: "/methodology",  view: "v-met",       public: false, i18n: "nav.met",       group: "feed" },
    { path: "/science",      view: "v-sci",       public: false, i18n: "nav.sci" },
    { path: "/workspace",    view: "v-workspace", public: false, i18n: "ws.title" },
    { path: "/404",          view: "v-404",       public: true,  i18n: "nf.title" }
  ];
  /* Legacy / short aliases -> canonical path (no loops: targets are canonical) */
  var ALIASES = {
    "/home": "/", "/index": "/", "/landing": "/",
    "/dash": "/dashboard", "/validation": "/dashboard",
    "/exp": "/trial", "/experiment": "/trial", "/design": "/trial",
    "/sim": "/live", "/stream": "/live",
    "/scn": "/scenarios",
    "/dev": "/device", "/hardware": "/device",
    "/met": "/methodology", "/methods": "/methodology",
    "/sci": "/science",
    "/login": "/", "/register": "/"   // auth is a modal, not a page: land home & open modal
  };
  var FEED_GROUP = ["v-feed", "v-dash", "v-exp", "v-farm", "v-sim", "v-scn", "v-dev", "v-met"];
  var current = null;         // active route object
  var pending = null;         // intended destination while unauthenticated

  /* ---- helpers ---- */
  function byPath(p) { return ROUTES.filter(function (r) { return r.path === p; })[0] || null; }
  function byView(v) { return ROUTES.filter(function (r) { return r.view === v; })[0] || null; }
  function tr(k, fb) { return (window.tr && window.tr(k)) || fb || k; }
  function isAuthed() {
    return !!(window.isTokenValid && window.isTokenValid(localStorage.getItem("arian_token")));
  }
  function isHome() { var h = location.hash; return !h || h === "#" || h === "#/"; }
  function parseHash() {
    var h = location.hash.replace(/^#/, "") || "/";
    if (h.charAt(0) !== "/") h = "/" + h;          // tolerate "#dashboard"
    var qi = h.indexOf("?");
    var query = {};
    if (qi > -1) {
      h.slice(qi + 1).split("&").forEach(function (kv) {
        if (!kv) return;
        var eq = kv.indexOf("="), k = decodeURIComponent(eq < 0 ? kv : kv.slice(0, eq)),
            v = eq < 0 ? "" : decodeURIComponent(kv.slice(eq + 1));
        query[k] = v;
      });
      h = h.slice(0, qi);
    }
    if (h.length > 1 && h.charAt(h.length - 1) === "/") h = h.slice(0, -1);
    return { path: h, query: query };
  }

  /* ---- query params API (e.g. #/dashboard?tab=x) ---- */
  function setQuery(path, params) {
    var qs = Object.keys(params || {}).map(function (k) {
      return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
    }).join("&");
    go(qs ? path + "?" + qs : path, true);
  }

  /* ---- view activation (single switcher — old duplicated logic removed) ---- */
  function activate(route) {
    document.querySelectorAll(".tab").forEach(function (b) { b.classList.remove("on"); b.setAttribute("aria-selected", "false"); });
    document.querySelectorAll("section.view").forEach(function (s) { s.classList.remove("on"); });
    var sec = document.getElementById(route.view);
    if (sec) sec.classList.add("on");
    // active nav: direct tab + feed-group parent + dropdown items (route-aware, not exact-string)
    var tab = document.querySelector('.tab[data-v="' + route.view + '"]');
    if (tab) { tab.classList.add("on"); tab.setAttribute("aria-selected", "true"); }
    // feed group is a plain tab now (v-feed); child views keep the group highlighted
    var feedBtn = document.getElementById("nav-feed-btn");
    if (feedBtn && route.view !== "v-feed") {
      feedBtn.classList.toggle("on", FEED_GROUP.indexOf(route.view) > -1);
    }
    // per-route document title (bilingual via tr)
    var brand = tr("brand.name", "Arian");
    document.title = route.i18n ? tr(route.i18n) + " — " + brand : tr("app.title");
    // workspace renders user data
    if (route.view === "v-workspace" && typeof window.renderWorkspace === "function") window.renderWorkspace();
    // repaint canvases (existing INP-optimized path)
    var paint = function () { if (typeof window.repaintView === "function") window.repaintView(route.view); };
    if (window.requestIdleCallback) requestIdleCallback(paint, { timeout: 120 }); else requestAnimationFrame(paint);
    if (window.scrollTo) window.scrollTo({ top: 0, behavior: "auto" });
    // close mobile drawer + feed dropdown after navigation
    var hc = document.querySelector(".hctl"), bd = document.getElementById("backdrop");
    if (hc && hc.classList.contains("open") && typeof window.closeDrawer === "function") window.closeDrawer();
    if (bd) bd.classList.remove("on");
    current = route;
    document.dispatchEvent(new CustomEvent("arian:route", { detail: { path: route.path, view: route.view } }));
  }

  /* ---- guard + resolve ---- */
  function resolve(push) {
    var parsed = parseHash(), path = parsed.path;
    if (ALIASES[path] != null) { replace(ALIASES[path]); return; }        // legacy redirect (replace, no loop)
    var route = byPath(path);
    if (!route) { replace("/404"); return; }                              // unknown -> 404
    if (!route.public && !isAuthed()) {                                   // guard: remember intent, prompt login
      pending = path;
      if (window.Auth && window.Auth.showAuthModal) window.Auth.showAuthModal("login", { gated: false });
      if (window.toast) window.toast(tr("toast.needLogin", "برای دسترسی به این بخش وارد شوید"));
      /* Stay on the current view only if it is public; otherwise land home.
         Both non-recursively: target is always public, so the follow-up
         resolve() passes the guard (no replace(current) loop when the
         current view itself is protected, e.g. after token expiry). */
      var cur = current ? byPath(current.path) : null;
      var target = (cur && cur.public) ? cur : byPath("/");
      current = null;
      go(target.path, true);
      return;
    }
    if (push !== false && current && current.path === path) { activate(route); return; }
    activate(route);
  }
  function go(path, replaceFlag) {
    /* Home uses the clean root URL "/" (no hash). All other routes live on #/... */
    if (path === "/") {
      var alreadyHome = isHome() && (location.hash === "" ? true : false);
      if (replaceFlag) {
        if (location.hash) history.replaceState(null, "", "/");           // strip "#/" -> clean "/"
        resolve(false); return;
      }
      if (location.hash === "") { resolve(false); return; }               // already on clean home
      if (window.history.pushState) { history.pushState(null, "", "/"); resolve(false); }
      else { location.hash = "/"; }
      return;
    }
    var target = "#" + path;
    if (replaceFlag || location.hash === target) {
      if (location.hash === target) { resolve(false); return; }
      history.replaceState(null, "", target); resolve(false);
    } else { location.hash = target; }                                    // hashchange -> resolve
  }
  function replace(path) {
    if (path === "/") { history.replaceState(null, "", "/"); resolve(false); return; }  // keep home clean
    history.replaceState(null, "", "#" + path); resolve(false);
  }

  /* ---- public API (central helpers: no raw hashes elsewhere) ---- */
  window.Router = {
    go: function (v) {                       // accepts view id OR path
      var r = v && v.charAt(0) === "/" ? byPath(v) : byView(v);
      go(r ? r.path : "/404");
    },
    goPath: go,
    setQuery: setQuery,
    query: function () { return parseHash().query; },
    current: function () { return current ? current.path : "/"; },
    isPublic: function (view) { var r = byView(view); return !!(r && r.public); },
    syncTitle: function () {
      if (!current) { document.title = tr("app.title"); return; }
      var brand = tr("brand.name", "Arian");
      document.title = current.i18n ? tr(current.i18n) + " — " + brand : tr("app.title");
    },
    redirectAfterLogin: function () {        // consumes intended destination
      var p = pending; pending = null;
      var r = p ? byPath(p) : byView("v-workspace");
      go(r ? r.path : "/workspace");
    },
    resolve: resolve
  };

  /* ---- browser history: back/forward + manual hash edit ---- */
  window.addEventListener("hashchange", function () { resolve(false); });
  window.addEventListener("popstate", function () { resolve(false); });   // back/forward over pushed home URL
  window.addEventListener("rossim:lang", function () { setTimeout(function () { if (window.Router && window.Router.syncTitle) window.Router.syncTitle(); }, 0); });

  /* ---- wire ALL navigation elements through the router ---- */
  document.addEventListener("click", function (e) {
    // tabs (incl. dropdown children) and any [data-goto]/[data-go]
    var t = e.target.closest("[data-v], [data-goto], [data-go]");
    if (t) {
      var v = t.dataset.v || t.dataset.goto || t.dataset.go;
      if (v && v.charAt(0) === "v") { e.preventDefault(); window.Router.go(v); }
      return;
    }
    // landing guest -> scroll (not navigation)
  }, false);

  /* ---- boot: deep link / refresh / direct URL ---- */
  function boot() {
    if (location.hash === "#" || location.hash === "#/") history.replaceState(null, "", "/");  // clean canonical home
    resolve(false);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
