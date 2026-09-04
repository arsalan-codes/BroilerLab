"""Workspace cycles manager (v1.8.37) — per-cycle reset/delete + change-pass.

Contract: the cycles stat opens a manager panel where EVERY cycle offers
full data reset (new DELETE .../data endpoint, cycle kept) and full delete
(existing DELETE cycle). Change-password lives in the workspace actions.
Sheet settings/reset rows are gone (moved here).
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


def test_sheet_settings_and_reset_rows_removed():
    js = src("auth.js")
    assert "sheet-settings-item" not in js, "settings row must leave the sheet"
    assert "sheet-reset-item" not in js, "reset row must leave the sheet"


def test_workspace_has_change_pass_and_cycles_entry():
    html = src("index.html")
    assert 'id="ws-change-pass"' in html, "workspace needs a change-password button"
    assert 'data-i18n="ws.btn.pass"' in html, "change-pass needs a locale label"
    assert 'id="ws-cycles-stat"' in html, "cycles stat must be clickable"
    assert 'id="ws-cycles-panel"' in html and 'id="ws-cy-list"' in html, \
        "cycles manager panel must exist"
    css = re.sub(r"\s+", "", html)
    assert ".ws-stat-btn{cursor:pointer" in css, "stat must look clickable"
    assert "#ws-cycles-panel[hidden]{display:none}" in css, \
        "panel must hide until opened"


def test_workspace_cycles_manager_logic():
    js = src("auth.js")
    assert "renderWsCycles" in js, "manager needs a render routine"
    assert "/api/cycles/" in js and '/data"' in js, \
        "reset must hit the per-cycle data endpoint"
    for act in ("data-cy-reset", "data-cy-del", "ws-cy-close", "ws-change-pass"):
        assert act in js, f"manager must wire #{act}"
    assert "showChangePassModal()" in js, "workspace must open change-password"
    assert "MDialog" in js, "destructive rows need the confirm dialog"


def test_workspace_cycles_i18n_keys():
    keys = ("ws.btn.pass", "ws.cy.manage", "ws.cy.empty", "ws.cy.resetData",
            "ws.cy.delete", "ws.cy.resetTitle", "ws.cy.resetMsg",
            "ws.cy.resetDone", "ws.cy.deleted", "ws.cy.visits", "ws.cy.rows")
    fa = read(DEV / "locales" / "fa.js")
    en = read(DEV / "locales" / "en.js")
    for k in keys:
        assert '"%s"' % k in fa, f"missing fa key {k}"
        assert '"%s"' % k in en, f"missing en key {k}"


def test_cycle_data_reset_endpoint_contract():
    # Fail-closed: auth required + owner-only (404 otherwise), visits AND
    # device logs cleared, cycle row kept.
    for base in (ROOT / "backend", ROOT / "api" / "backend"):
        code = read(base / "main.py")
        m = re.search(
            r"@app\.delete\(\"/api/cycles/\{cycle_id\}/data\"\)\s*\n"
            r"def reset_cycle_data\(.*?\):\s*\n(?:.*\n)*?.*?s\.commit\(\)",
            code)
        assert m, f"{base}/main.py must define reset_cycle_data"
        body = m.group(0)
        assert "Depends(authmod.get_current_user)" in body, \
            "reset endpoint must require auth"
        assert "_require_owner_cycle" in body, \
            "reset endpoint must be owner-scoped (404 across tenants)"
        assert "Visit" in body and "DeviceLog" in body, \
            "reset must clear visits AND device logs"
