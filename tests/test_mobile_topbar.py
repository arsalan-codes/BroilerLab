"""Mobile topbar (v1.8.40): full-width bar, clock-only stacked date/time.

Contract: on <=992px the topbar spans 100% width, .hctl stays mounted but
shows ONLY the clock (lang/theme/help/reset/pills live in the user menu),
and the clock stacks date over time at the 10.5px readability floor.
Desktop (.hctl row with all controls) must keep working.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBAPP = ROOT / "webapp"
DEV = Path("/home/arsalan/poultry_sim/webapp")


def src(name):
    dev = DEV / name
    return (dev if dev.exists() else WEBAPP / name).read_text(encoding="utf-8")


def nospace():
    return re.sub(r"\s+", "", src("index.html"))


def test_topbar_full_width_on_mobile():
    css = nospace()
    # .topbar sits inside .wrap (14px side padding ≤860px); full-bleed via
    # negative margins + width:auto (measured L=0 R=0 live on RTL+LTR).
    assert ".topbar{width:auto;margin-left:-14px;margin-right:-14px}" in css, \
        "mobile .topbar must span full width (negative-margin breakout)"
    assert ".topbar-in{max-width:100%;width:100%;margin:0;" in css, \
        "mobile .topbar-in must take 100% width (no centered cap)"


def test_mobile_clock_only_stacked():
    css = nospace()
    # hctl mounted (clock lives inside it), non-clock controls hidden
    assert ".topbar-in>.hctl{display:flex;" in css, \
        ".hctl must stay mounted on mobile for the clock"
    for sel in [".hctl.hgroup", "#btn-help", "#btn-reset", ".hctl.hpills"]:
        assert sel in css, f"mobile must hide {sel}"
    # mobile clock is chrome-free: no live dot, no pill border/background
    assert ".topclock::before{display:none}" in css, \
        "mobile clock must hide the green pulse dot"
    assert ".topclock{background:none;border:none;box-shadow:none;" in css, \
        "mobile clock must drop the pill chrome"
    # stacked clock, separator gone, floor-respecting small type
    assert ".topbar-in>.hctl.topclock{flex-direction:column;" in css, \
        "mobile clock must stack date over time"
    assert ".topclock.tc-sep{display:none}" in css, \
        "stacked clock needs no inline separator"
    assert ".tc-date," in css and "font-size:10.5px" in css, \
        "stacked clock type must respect the 10.5px floor"


def test_desktop_topbar_intact():
    html = src("index.html")
    assert 'id="topclock"' in html, "clock mount must survive"
    assert 'id="auth-area"' in html, "auth mount must survive"
    assert 'class="hsettings"' in html, "desktop settings must survive"
    css = nospace()
    # desktop base row (outside any media block) still lays out horizontally
    head = css.split("@media")[0]
    assert ".topbar-in{" in head and "display:flex" in head, \
        "desktop .topbar-in row must survive"
    assert ".topclock{display:inline-flex;" in head, \
        "desktop clock stays an inline row"
