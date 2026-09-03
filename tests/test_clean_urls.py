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


def test_mobile_avatar_opens_drawer():
    js = webapp_src("auth.js")
    assert "openMobileDrawer" in js, "topbar avatar needs the mobile drawer handler"
    assert "matchMedia" in js and "(max-width:992px)" in js
    assert 'window.openDrawer' in js, "handler must call the global drawer opener"
    app = webapp_src("app.js")
    assert re.search(r"function openDrawer\s*\(", app), "openDrawer must exist globally"
    css = webapp_src("index.html")
    assert re.search(
        r"#auth-area\s+\.auth-dropdown\s*\{\s*display\s*:\s*none",
        css,
    ), "documents WHY the drawer path is needed (topbar dd is CSS-hidden on mobile)"


def test_deploy_mirror_parity():
    for name in ("router.js", "index.html", "auth.js"):
        assert read(WEBAPP / name) == webapp_src(name), f"mirror drift: {name}"


def test_deploy_root_parity():
    # Vercel CDN serves the REPO ROOT files (index.html references
    # root-relative router.js/auth.js/version.js), NOT webapp/. A drift
    # here once shipped v1.8.23 JS under ?v=1.8.25 URLs (hash router live).
    for name in ("router.js", "auth.js", "version.js"):
        assert read(ROOT / name) == webapp_src(name), f"root drift: {name}"
