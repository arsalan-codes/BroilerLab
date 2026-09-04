"""Methodology tab in mainnav (v1.8.48).

The existing v-met view + /methodology route already existed; the tab was
missing from #mainnav. Contract: the tab sits between sci and products,
uses the existing nav.met i18n key (both dicts), is gated like v-sci
(needs-auth CSS + router public:false), and every other tab survives.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBAPP = ROOT / "webapp"
DEV = Path("/home/arsalan/poultry_sim/webapp")


def src(name):
    dev = DEV / name
    return (dev if dev.exists() else WEBAPP / name).read_text(encoding="utf-8")


def test_met_tab_in_nav():
    html = src("index.html")
    nav = html[html.find('<nav id="mainnav"'):html.find("</nav>")]
    tabs = re.findall(r'data-v="(v-[a-z]+)"', nav)
    assert "v-met" in tabs, "v-met tab missing from mainnav"
    assert tabs.index("v-sci") < tabs.index("v-met") < tabs.index("v-products"), \
        "v-met must sit between sci and products"
    i = nav.find('data-v="v-met"')
    tag = nav[nav.rfind("<button", 0, i):nav.find("</button>", i)]
    assert 'data-i18n="nav.met"' in tag, "v-met tab must use the nav.met key"


def test_met_i18n_keys_exist():
    fa = src("locales/fa.js")
    en = src("locales/en.js")
    assert '"nav.met"' in fa and "روش‌شناسی" in fa
    assert '"nav.met"' in en and "Methodology" in en


def test_met_gate_unchanged():
    html = src("index.html")
    assert "body.needs-auth #v-met" in html, "v-met stays auth-gated"
    router = re.sub(r"\s+", " ", src("router.js"))
    assert '{ path: "/methodology", view: "v-met", public: false' in router, \
        "route stays public:false"
    nav = html[html.find('<nav id="mainnav"'):html.find("</nav>")]
    assert len(re.findall(r'data-v="(v-[a-z]+)"', nav)) == 6, \
        "exactly six nav tabs (landing, feed, sci, met, products, about)"
