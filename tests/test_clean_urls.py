"""Clean-URL routing (no '#') + mobile auth-menu regression tests.

Static contract tests: they pin the History-API migration so a future
edit cannot silently reintroduce hash URLs or break the mobile drawer fix.
"""
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBAPP = ROOT / "webapp"
DEPLOY_WEBAPP = Path("/home/arsalan/poultry_sim/webapp")


def read(p):
    return p.read_text(encoding="utf-8")


def webapp_src(name):
    """Prefer the dev tree (source of truth); fall back to the mirror."""
    dev = DEPLOY_WEBAPP / name
    return read(dev if dev.exists() else WEBAPP / name)


def test_router_uses_history_api_not_hash():
    js = webapp_src("router.js")
    assert "history.pushState" in js, "router must navigate with pushState"
    assert "popstate" in js, "router must handle back/forward via popstate"
    assert "parseHash" not in js, "legacy parseHash must be gone"
    # The single permitted location.hash assignment lives in the guarded
    # file:// fallback branch (pushState cannot run on file: protocol).
    assigns = [m.start() for m in re.finditer(r"location\.hash\s*=(?![=>])", js)]
    assert len(assigns) == 1, f"exactly one guarded fallback assignment allowed, got {len(assigns)}"
    assert "HASH_FALLBACK" in js[max(0, assigns[0] - 400):assigns[0]], "assignment must be guarded by HASH_FALLBACK"


def test_router_migrates_legacy_hash_and_pages_base():
    js = webapp_src("router.js")
    assert "migrateLegacyHash" in js, "old '#/feed' links must redirect to clean URLs"
    assert "/BroilerLab" in js, "router must detect the GitHub Pages subpath base"


def test_canonical_paths_absolute_and_aliased():
    js = webapp_src("router.js")
    for p in ('"/feed"', '"/dashboard"', '"/device"', '"/404"'):
        assert p in js, f"canonical absolute path {p} must exist"
    assert '"/dash": "/dashboard"' in js, "slash alias /dash must map to /dashboard"
    # Router.go accepts a view id ("v-dash"), a canonical path ("/dashboard")
    # AND a slash alias ("/dash") — the last one regressed to /404 once.
    assert "ALIASES[v]" in js, "go() must fall back to ALIASES for slash-form input"


def test_legacy_data_go_still_wired():
    html = webapp_src("index.html")
    assert 'data-go="v-dash"' in html, "legacy v-* triggers must keep working"
    js = webapp_src("router.js")
    assert 'v.charAt(0) === "v"' in js, "click wire must route v-* ids via byView"


def test_brand_link_is_clean():
    html = webapp_src("index.html")
    m = re.search(r'<a class="brand" href="([^"]*)"', html)
    assert m, "brand link missing"
    assert m.group(1) == "/", f"brand href must be clean '/', got {m.group(1)!r}"
    # The only permitted href="#" is db-glink: a placeholder always overwritten
    # with the guide URL by app.js before use (target=_blank external link).
    leftovers = [l for l in html.splitlines() if 'href="#"' in l]
    assert all("db-glink" in l for l in leftovers), f"stray href=# found: {leftovers}"


def test_vercel_spa_rewrite():
    cfg = json.loads(read(ROOT / "vercel.json"))
    rewrites = cfg.get("rewrites", [])
    dests = {r.get("source"): r.get("destination") for r in rewrites}
    # Every canonical client route must resolve to the app shell (explicit
    # sources only — Vercel's matcher is RE2-based, so no lookaheads).
    for p in ("/feed", "/dashboard", "/trial", "/farm", "/live", "/scenarios",
              "/device", "/methodology", "/science", "/workspace",
              "/about", "/products", "/404"):
        assert dests.get(p) == "/index.html", f"vercel.json must map {p} to /index.html"
    for r in rewrites:
        assert "(?!" not in r.get("source", ""), "no lookahead: RE2 does not support it"


def test_pages_spa_fallback_exists_and_matches():
    root_html = read(ROOT / "index.html")
    fallback = ROOT / "404.html"
    assert fallback.exists(), "404.html SPA fallback required for GitHub Pages deep links"
    assert read(fallback) == root_html, "404.html must mirror index.html"


def test_mobile_avatar_opens_account_sheet():
    # Avatar tap (<=992px) opens the MobileAccountSheet bottom sheet —
    # never the side drawer in user mode.
    js = webapp_src("auth.js")
    assert "openAccountSheet" in js, "avatar path needs the bottom-sheet opener"
    assert "matchMedia" in js and "(max-width:992px)" in js
    assert "openMobileDrawer" not in js, "left-sheet drawer routing must be gone"
    assert "openDrawer('user')" not in js and 'openDrawer("user")' not in js, \
        "avatar must not open any drawer user mode"


def test_account_sheet_content_and_actions():
    # The sheet renders identity + menu + logout + utility, every row wired
    # to an EXISTING action (no new routes/backend).
    js = webapp_src("auth.js")
    for sid in ("account-sheet", "sheet-backdrop", "sheet-user-name",
                "sheet-view-profile", "sheet-profile-item", "sheet-settings-item",
                "sheet-help-item", "sheet-about-item", "sheet-reset-item",
                "sheet-segcard", "sheet-lang-fa", "sheet-lang-en",
                "sheet-logout", "sheet-theme-switch"):
        assert sid in js, f"sheet must render #{sid}"
    assert "sheet-handle" in js, "sheet needs the drag handle"
    assert "openWorkspace()" in js, "profile rows must open the workspace"
    assert "showChangePassModal()" in js, "settings row must open change-password"
    assert "window.setLang" in js, \
        "sheet language card must call the existing setLang (no drawer)"
    assert '"btn-reset"' in js and "rb.click()" in js, \
        "reset rows must reuse the existing armed reset flow"
    assert "showHelp()" in js, "help row must start the existing tour"
    assert 'go("v-about")' in js or "go('v-about')" in js, \
        "about row must route to the existing about view"
    assert "touchstart" in js and "touchend" in js, "sheet needs swipe-to-dismiss"
    assert "translateY(" in js, "swipe must drag the sheet vertically"
    html = webapp_src("index.html")
    assert 'id="account-sheet"' in html and 'id="sheet-backdrop"' in html, \
        "sheet containers must exist in static markup"
    assert 'role="dialog"' in html, "sheet must expose dialog semantics"


def test_mobile_avatar_click_does_not_rebubble():
    # The document-level outside-click closer re-hides the desktop dropdown;
    # the avatar handler must stopPropagation or the panel closes instantly.
    js = webapp_src("auth.js")
    i = js.find('getElementById("auth-user-btn")')
    assert i != -1, "topbar user button wiring missing"
    branch = js[i:i + 1400]
    assert "stopPropagation" in branch, "must stop bubbling or closer re-hides the panel"
    assert "openAccountSheet" in branch, "mobile path must open the bottom sheet"
    assert re.search(r"dd\.hidden\s*=\s*!dd\.hidden", branch), \
        "desktop path must still toggle the dropdown"


def test_drawer_mount_removed_with_hamburger():
    # The drawer + its auth mirror are gone (v1.8.35): no mount markup,
    # no mount CSS, no mirror rendering — the user menu owns everything.
    html = webapp_src("index.html")
    assert "auth-area-drawer" not in html, "drawer auth mount must be gone"
    assert "auth-dropdown-drawer" not in webapp_src("auth.js"), \
        "mirror rendering must be gone"


def test_drawer_is_nav_only__sheet_is_bottom():
    # No burger, no drawer modes — avatar → bottom sheet only.
    for name in ("app.js", "auth.js", "router.js"):
        js = webapp_src(name)
        assert "openDrawer" not in js and "closeDrawer" not in js, \
            f"drawer system must be gone from {name}"
    css = webapp_src("index.html")
    nospace = re.sub(r"\s+", "", css)
    assert "body.drawer-user.hctl" not in nospace, \
        "left side-sheet mode must stay gone"
    m = re.search(r"#account-sheet\.open\{([^}]*)\}", nospace)
    assert m, "bottom-sheet rule missing"
    sheet = m.group(1)
    assert "position:fixed" in sheet and "bottom:0" in sheet, \
        "sheet must dock to the viewport bottom"
    assert "border-radius:30px30px00" in sheet, \
        "sheet needs the 30px top rounding"
    assert "translateY(105%)" in sheet, \
        "sheet must hide below the viewport (slides up on open)"
    assert "max-height:78" in sheet, "sheet must cap at ~78% viewport height"
    assert "#sheet-backdrop.open" in nospace, "sheet needs its dimming overlay"
    assert "rgba(0,0,0,.45)" in nospace, "overlay must dim the dashboard"


def test_account_sheet_i18n_keys():
    # Every sheet label must exist in BOTH locales (bilingual, no fallback gaps).
    keys = ("sheet.profile", "sheet.accountSettings", "sheet.langTheme",
            "sheet.help", "sheet.about", "sheet.viewProfile", "sheet.logout",
            "sheet.darkMode", "sheet.version", "sheet.account", "sheet.close")
    fa = read(DEPLOY_WEBAPP / "locales" / "fa.js")
    en = read(DEPLOY_WEBAPP / "locales" / "en.js")
    for k in keys:
        assert '"%s"' % k in fa, f"missing fa key {k}"
        assert '"%s"' % k in en, f"missing en key {k}"


def test_deploy_mirror_parity():
    for name in ("router.js", "index.html", "auth.js"):
        assert read(WEBAPP / name) == webapp_src(name), f"mirror drift: {name}"


def test_deploy_root_parity():
    # Vercel CDN serves the REPO ROOT files (index.html references
    # root-relative router.js/auth.js/version.js), NOT webapp/. A drift
    # here once shipped v1.8.23 JS under ?v=1.8.25 URLs (hash router live).
    for name in ("router.js", "auth.js", "version.js"):
        assert read(ROOT / name) == webapp_src(name), f"root drift: {name}"
