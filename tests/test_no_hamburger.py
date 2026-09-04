"""No-hamburger contract (v1.8.35) — burger/drawer fully removed.

The hamburger menu is gone everywhere: no burger button, no slide-in
panel, no backdrop, no drawer JS. Its entries (language/theme/help/reset)
live in the user menu (topbar dropdown + bottom sheet). Touch scrolling
is tuned for coarse pointers.
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


def test_no_burger_no_drawer_markup():
    html = src("index.html")
    for gone in ("nav-burger", "drawer-close", "dhead-brand", "dhead-clock",
                 "auth-area-drawer", 'id="backdrop"', ".dhead{"):
        assert gone not in html, f"hamburger leftover in markup: {gone}"


def test_no_drawer_js():
    for name in ("app.js", "auth.js", "router.js"):
        js = src(name)
        for gone in ("openDrawer", "closeDrawer", "drawerOpen",
                     "bindDrawer", "nav-burger", "drawer-close",
                     "drawer-user", "drawer-nav", "drawer-open"):
            assert gone not in js, f"drawer leftover in {name}: {gone}"


def test_no_drawer_css():
    css = re.sub(r"\s+", "", src("index.html"))
    for gone in (".hctl{position:fixed", "#backdrop", ".auth-area-drawer",
                 "drawer-user", "drawer-nav", "drawer-open",
                 "translateX(-112%)", "translateX(112%)", ".dhead"):
        assert gone not in css, f"drawer leftover in CSS: {gone}"
    assert ".topbar-in>.hctl{display:none}" in css, \
        "desktop inline controls must hide on mobile (no drawer anymore)"


def test_user_dropdown_owns_hamburger_entries():
    js = src("auth.js")
    for sid in ("dd-lang-fa", "dd-lang-en", "dd-theme-dark", "dd-theme-light",
                "dd-help", "dd-reset", "auth-sep"):
        assert sid in js, f"dropdown must render #{sid}"
    assert "window.setLang" in js, "dropdown language must call setLang"
    assert "window.setTheme" in js, "dropdown theme must call setTheme"
    css = re.sub(r"\s+", "", src("index.html"))
    assert ".auth-sep{" in css and ".auth-seg-row{" in css, \
        "dropdown needs divider + segment styles"


def test_reset_keeps_children_no_emoji():
    # Bugfix: bindReset overwrote textContent with emoji, destroying the
    # icon+label children. The .armed class is the only visual state now.
    js = src("app.js")
    i = js.find("function bindReset")
    assert i != -1, "bindReset missing"
    branch = js[i:i + 2200]
    assert "btn.textContent" not in branch, \
        "reset must not rewrite children (label loss + emoji)"
    assert '"armed"' in branch or "'armed'" in branch, \
        "armed class must remain the confirm state"


def test_touch_scrolling_tuned_for_mobile():
    css = re.sub(r"\s+", "", src("index.html"))
    assert "-webkit-overflow-scrolling:touch" in css, \
        "iOS momentum scrolling required"
    assert "overscroll-behavior-y:contain" in css, \
        "scroll chaining must not escape to the body"
    assert "touch-action:manipulation" in css, \
        "tap delay / double-tap zoom must go on controls"
    assert "touch-action:pan-y" in css, \
        "scroll containers must declare vertical panning"
