"""Mobile nav-drawer (hamburger) regression tests — left dock + spread layout.

Pins the modern drawer contract: the drawer docks to the PHYSICAL left in
both RTL/LTR (never inset-inline-end), sections spread with
justify-content:space-between (footer pills pinned to the bottom, nothing
centered), and every row carries a visible localized label.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBAPP = ROOT / "webapp"
DEV = Path("/home/arsalan/poultry_sim/webapp")


def read(p):
    return p.read_text(encoding="utf-8")


def src(name):
    """Prefer the dev tree (source of truth); fall back to the mirror."""
    dev = DEV / name
    return read(dev if dev.exists() else WEBAPP / name)


MOBILE_HCTL = r"\.hctl\{([^}]*position:fixed[^}]*)\}"


def test_drawer_docks_physical_left():
    css = re.sub(r"\s+", "", src("index.html"))
    m = re.search(MOBILE_HCTL, css)
    assert m, "mobile .hctl rule missing"
    hctl = m.group(1)
    assert "left:0" in hctl and "right:auto" in hctl, \
        "drawer must dock to the physical left edge"
    assert "inset-inline-end:0" not in hctl, \
        "logical inline-end docking would drop it right in RTL"
    assert "border-radius:022px22px0" in hctl, \
        "outer (right) corners rounded for the left dock"
    assert "translateX(-112%)" in css, "hidden drawer parks off-canvas left"
    assert "translateX(112%)" not in css, \
        "no right-side parking may remain (drawer-user mode is retired)"


def test_drawer_sections_spread_not_centered():
    css = re.sub(r"\s+", "", src("index.html"))
    m = re.search(r"\.hctl\{([^}]*)\}", css)
    assert m, ".hctl rule missing"
    m = re.search(MOBILE_HCTL, css)
    assert m, "mobile .hctl rule missing"
    hctl = m.group(1)
    assert "justify-content:space-between" in hctl, \
        "drawer sections must spread across the full height"
    assert "justify-content:safespace-between" in hctl, \
        "safe keyword keeps short screens from clipping the top section"
    assert ".hctl>*{flex-shrink:0}" in css, \
        "sections must not be squeezed when the drawer scrolls"
    # Cascade regression: the GLOBAL `.topbar-in .hctl{...justify-content:
    # center}` (0,2,0) beats a lone mobile `.hctl` rule (0,1,0) and silently
    # re-centers the drawer. The spread must be re-pinned with equal
    # specificity later in source.
    assert ".topbar-in>.hctl{align-items:stretch;justify-content:space-between" in css, \
        "mobile spread must beat the global topbar centering"


def test_drawer_rows_have_visible_labels():
    html = src("index.html")
    m = re.search(r'<button id="btn-help"[^>]*>(.*?)</button>', html, re.S)
    assert m, "#btn-help markup missing"
    assert 'data-i18n="hdr.help"' in m.group(1), \
        "help row needs a localized text label (was icon-only)"
    for key, fa, en in (("hdr.help", "آموزش سریع", "Quick tour"),
                        ("hdr.lang", "زبان", "Language"),
                        ("hdr.theme", "پوسته", "Theme")):
        assert '"%s": "%s"' % (key, fa) in read(DEV / "locales" / "fa.js"), \
            f"missing fa label {key}"
        assert '"%s": "%s"' % (key, en) in read(DEV / "locales" / "en.js"), \
            f"missing en label {key}"
    assert 'data-i18n="hdr.lang"' in html and 'data-i18n="hdr.theme"' in html, \
        "lang/theme section titles must stay wired"


def test_burger_still_opens_nav_drawer():
    js = src("app.js")
    assert re.search(r"""openDrawer\(\s*['"]nav['"]\s*\)""", js), \
        "burger must open the nav drawer"
    assert 'id="nav-burger"' in src("index.html"), "burger button missing"
    assert 'id="drawer-close"' in src("index.html"), "drawer close button missing"
    assert 'id="backdrop"' in src("index.html"), "drawer backdrop missing"
