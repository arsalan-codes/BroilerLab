"""Guided-tour (help) regression tests — interactive animations + responsive.

Pins the tour bugfixes: shade blocks the background (tap-outside dismiss
actually works), no stale-step race on rapid navigation, tip stays glued
to its target across scroll/resize, direction-aware enter animation,
small-screen bottom dock, reduced-motion fallback, keyboard nav.
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


def test_tour_shade_blocks_background_and_dismisses():
    # Bug: #tour-shade had pointer-events:none, so the "tap outside to
    # dismiss" handler was dead AND the page stayed interactive mid-tour.
    css = re.sub(r"\s+", "", src("index.html"))
    assert "#tour-shade.on{display:block;pointer-events:auto}" in css, \
        "active shade must intercept pointer events"
    js = src("app.js")
    assert 'shade.addEventListener("click"' in js or \
        "shade.addEventListener('click'" in js, \
        "shade tap must be wired to end the tour"


def test_tour_step_changes_have_no_race():
    # Bug: rapid next/prev during the 420ms scroll window let a stale
    # setTimeout paint the old step's highlight/tip afterwards.
    js = src("app.js")
    assert "TOUR.seq" in js, "tour needs a step sequence token"
    assert "seq!==TOUR.seq" in js, "stale step timeouts must bail out"


def test_tour_tip_repositions_on_scroll_and_resize():
    # Bug: the tip was only placed inside the post-click window; scrolling
    # afterwards left it floating away from its highlight.
    js = src("app.js")
    assert "tourReposition" in js, "tour needs a reposition routine"
    assert "TOUR.el" in js, "tour must track its anchor element"
    assert re.search(r'addEventListener\("scroll".*tourScheduleReposition',
                     js, re.S), "scroll must re-glue the tip (rAF-throttled)"
    assert re.search(r'addEventListener\("resize".*tourScheduleReposition',
                     js, re.S), "resize must re-glue the tip"


def test_tour_tip_enter_animation_is_directional():
    js = src("app.js")
    assert "tt-above" in js and "tt-below" in js, \
        "tip must know whether it sits above or below its target"
    css = re.sub(r"\s+", "", src("index.html"))
    assert "@keyframesttInBelow" in css and "@keyframesttInAbove" in css, \
        "tip needs direction-aware enter keyframes"
    assert "#tour-tip.show{animation:ttInBelow" in css, \
        "tip must animate on every step"


def test_tour_tip_docks_bottom_on_small_screens():
    # On phones the floating card could cover its target — dock it.
    css = src("index.html")
    nospace = re.sub(r"\s+", "", css)
    assert "#tour-tip{left:3vw!important" in nospace, \
        "docked tip must span the small-screen width"
    assert "top:auto!important" in nospace, \
        "dock must override the JS-placed top coordinate"
    assert "bottom:calc(12px+env(safe-area-inset-bottom,0px))" in nospace, \
        "docked tip must respect the mobile safe area"
    assert "@keyframesttUp" in re.sub(r"\s+", "", css), \
        "docked tip needs its slide-up keyframes"


def test_tour_spotlight_hole_replaces_zindex_trick():
    # Bug: the z-index-boosted target got trapped inside ancestor stacking
    # contexts (sticky topbar) and stayed UNDER the blurred shade — the tip
    # described an invisible element. The shade now carries a real hole.
    css = re.sub(r"\s+", "", src("index.html"))
    assert "polygon(evenodd" in css and "--thx" in css, \
        "shade needs a punched spotlight hole driven by CSS vars"
    assert "9999px" not in css, \
        "giant-shadow dimming must be gone (it blurred nothing away)"
    assert "z-index:301" not in css, \
        "target must paint in place — no stacking-context escape hatch"
    js = src("app.js")
    assert '"holed"' in js or "'holed'" in js, "tip placement must punch the hole"
    assert "setProperty(\"--thx\"" in js or "setProperty('--thx'" in js, \
        "hole geometry must follow the live target rect"


def test_tour_respects_reduced_motion():
    css = re.sub(r"\s+", "", src("index.html"))
    assert "prefers-reduced-motion" in css, "tour needs a reduced-motion guard"
    assert ".tour-spot{animation:none" in css or \
        ".tour-spot{animation:none" in css.replace("!important", ""), \
        "spot pulse must switch off for reduced motion"


def test_tour_keyboard_nav():
    js = src("app.js")
    assert '"Escape"' in js or "'Escape'" in js, "Escape must end the tour"
    assert "ArrowRight" in js and "ArrowLeft" in js, \
        "arrow keys must step through the tour"
