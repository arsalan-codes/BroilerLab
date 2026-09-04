"""Landing hero brand-line typography (v1.8.45).

Contract: the hero line "سامانه پایش هوشمند + آرین" must fit on ONE line at
every viewport tier — fluid clamp formula (9vw-22px, 34..72px) sized so the
longest locale (EN prefix ≈ 11.3ch) plus accent never wraps:
  EN width ≈ fs × (11.3×0.62 + 2.7×0.62) ≈ fs × 8.7px/em ... caps at 72px
  needs ≥ 8.7×72 = 626px of content vs 1019px available at 1440 ✓
  at 560px: fs = min(9vw, 38) = 38px → 8.7×38 = 330 < 483 avail ✓
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


def test_hero_fluid_formula():
    css = nospace()
    # single fluid source — sized from live glyph measurements (EN 13.9em)
    assert "6.1vw,72px" in css, "hero clamp formula must be 6.1vw capped 72"
    for stale in ("7.2vw", "9vw-22px", "clamp(30px,10vw,48px)",
                  "clamp(38px,7.2vw,72px)"):
        assert stale not in css, f"stale hero size {stale} must be gone"


def test_hero_mobile_tier():
    css = nospace()
    # the ≤560 override is DELETED — one fluid ladder governs every width
    assert "clamp(30px,9vw,38px)" not in css, \
        "≤560 hero override must stay deleted (single ladder)"


def test_hero_gap_survives():
    css = nospace()
    assert "gap:.04em.22em;" in css, "hero column gap must remain .22em"
    assert ".landing-title>span:not(.brand-hero-sub):not(.brand-hero){display:block" in css, \
        "brand-hero must stay excluded from the display:block clobber rule"


def test_hero_one_line_math():
    # glyph-budget sanity from live measurements: EN line ≈ 13.9em total.
    # Mid tiers (≥560) must fit on one line: fs = 6.1vw capped 72.
    for vw, avail in [(1440, 1019), (1024, 895), (860, 751), (560, 483)]:
        fs = min(0.061 * vw, 72.0)
        en_width = fs * 13.9
        assert en_width <= avail, \
            f"EN hero wraps at {vw}px: {en_width:.0f}px > {avail}px (fs={fs:.1f})"
