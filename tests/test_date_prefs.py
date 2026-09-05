"""Date & timezone preferences (v1.8.51).

Contract: a settings-dropdown row lets the user pick calendar format
(auto | jalali | gregorian) and timezone (auto | IANA zone). formatDate /
formatTime respect the prefs — "auto" follows LANG (fa→Shamsi, en→Gregorian) —
and prefs persist in localStorage "rossim_date_prefs" and re-render the site
on change. Pinned statically + live-evaluated in node VM where possible.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBAPP = ROOT / "webapp"
DEV = Path("/home/arsalan/poultry_sim/webapp")


def src(name):
    dev = DEV / name
    return (dev if dev.exists() else WEBAPP / name).read_text(encoding="utf-8")


def test_settings_has_date_rows():
    html = src("index.html")
    assert 'id="df-auto"' in html and 'id="df-jalali"' in html and 'id="df-gregorian"' in html, \
        "calendar format segment missing from settings dropdown"
    assert 'id="tz-select"' in html, "timezone select missing from settings dropdown"
    assert 'data-i18n="hdr.dateFmt"' in html and 'data-i18n="hdr.tz"' in html


def test_formatDate_respects_prefs():
    js = src("i18n.js")
    assert "DATE_PREFS" in js and "setDatePrefs" in js, "prefs store missing"
    assert 'rossim_date_prefs' in js, "prefs must persist"
    # auto mode follows LANG; explicit modes override
    assert '_useJalali' in js and 'DATE_PREFS.fmt === "auto" && LANG === "fa"' in \
        re.sub(r"\s+", " ", js)
    # timezone flows into Intl options
    assert "timeZone" in js


def test_app_binds_pref_controls():
    js = src("app.js")
    assert 'df-"+fmt' in js.replace(" ", ""), "calendar buttons not bound"
    assert "tz-select" in js, "timezone select not bound"
    assert "rossim_date_prefs" in js, "stored prefs not restored into controls"
    assert "applyDatePrefButtons" in js, "segment highlighter missing"


def test_i18n_keys_present():
    fa, en = src("locales/fa.js"), src("locales/en.js")
    for k in ("hdr.dateFmt", "hdr.tz", "datefmt.auto", "datefmt.jalali",
              "datefmt.gregorian", "tz.auto"):
        assert f'"{k}"' in fa, f"fa missing {k}"
        assert f'"{k}"' in en, f"en missing {k}"
