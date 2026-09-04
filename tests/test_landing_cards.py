"""Landing cards navigation (v1.8.38) — every .lcard routes to its own view.

Contract: each landing card carries data-go to an EXISTING view section,
the delegated router covers .lcard[data-go], keyboard activates cards,
and navigable cards show a pointer + hover lift.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBAPP = ROOT / "webapp"
DEV = Path("/home/arsalan/poultry_sim/webapp")

EXPECTED = {
    "landing.card.dash": "v-dash",
    "landing.card.exp": "v-exp",
    "landing.card.farm": "v-farm",
    "landing.card.sim": "v-sim",
    "landing.card.scn": "v-scn",
    "landing.card.dev": "v-dev",
}


def read(p):
    return p.read_text(encoding="utf-8")


def src(name):
    """Prefer the dev tree (source of truth); fall back to the mirror."""
    dev = DEV / name
    return read(dev if dev.exists() else WEBAPP / name)


def test_landing_cards_route_to_own_views():
    html = src("index.html")
    for key, view in EXPECTED.items():
        i = html.find(key)
        assert i != -1, f"landing key missing: {key}"
        j = html.rfind("<div", 0, i)
        tag = html[j:html.find(">", j)]
        assert 'class="lcard"' in tag, f"card wrapper missing for {key}"
        assert f'data-go="{view}"' in tag, f"card {key} must route to {view}"
        assert f'id="{view}"' in html, f"target view missing: {view}"
        assert 'role="button"' in tag and 'tabindex="0"' in tag, \
            f"card {key} must be keyboard-focusable"


def test_card_navigation_wiring():
    js = src("auth.js")
    assert ".lcard[data-go]" in js, "delegated router must cover landing cards"
    assert '"Enter"' in js or "'Enter'" in js, "cards need keyboard activation"
    css = re.sub(r"\s+", "", html_css())
    assert ".lcard[data-go]{cursor:pointer}" in css, \
        "navigable cards must show a pointer"


def html_css():
    return src("index.html")
