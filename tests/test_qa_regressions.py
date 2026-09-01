"""Regression tests for issues found during the 2026-09-01 full-project QA.

BUG#3  app.js theme shortcut crashed on `e.key.toLowerCase()` when e.key is
       undefined (synthetic/IME events) — TypeError twice on every login.
BUG#4  auth.js created `window.Auth` without showAuthModal/hideAuthModal, so
       router.js:118's guard modal call was a silent no-op: visiting a
       protected route while logged out bounced home WITHOUT opening the
       login modal (toast only).

These tests parse the shipped JS instead of running a browser — they pin the
exact code shapes that broke, keeping the loop fast and deterministic.
"""
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
WEBAPP = ROOT / "webapp"


def test_theme_shortcut_guards_ekey():
    """BUG#3: e.key must be guarded before toLowerCase()."""
    src = (WEBAPP / "app.js").read_text(encoding="utf-8")
    # find the "t" theme-shortcut handler and require a falsy guard on e.key
    # the theme handler is the one testing .key.toLowerCase() against "t"
    m = re.search(r'if\(([^)]*e\.key\.toLowerCase\(\)[^)]*)\)', src)
    assert m, "theme keydown handler (e.key.toLowerCase) not found in app.js"
    assert "!e.key" in m.group(1), (
        "theme shortcut calls e.key.toLowerCase() without `!e.key` guard — "
        "reintroduces TypeError on synthetic/IME keydown events")


def test_window_auth_exposes_modal_fns():
    """BUG#4: window.Auth must include showAuthModal/hideAuthModal."""
    src = (WEBAPP / "auth.js").read_text(encoding="utf-8")
    m = re.search(r"window\.Auth\s*=\s*\{([^}]*)\}", src)
    assert m, "window.Auth assignment not found in auth.js"
    members = {x.strip() for x in m.group(1).split(",")}
    assert "showAuthModal" in members, (
        "window.Auth missing showAuthModal — router guard modal silently no-ops")
    assert "hideAuthModal" in members, "window.Auth missing hideAuthModal"


def test_router_guard_uses_auth_modal():
    """Guard must still call the modal (guards the guard)."""
    src = (WEBAPP / "router.js").read_text(encoding="utf-8")
    assert "window.Auth.showAuthModal" in src, (
        "router guard no longer opens the login modal on protected routes")


def test_webapp_parity_with_deploy_copy():
    """Shipped webapp must match the deployed copy for the files fixed here."""
    import filecmp
    deploy = ROOT / "webapp"  # tests run from repo root; dev tree == repo tree
    for name in ("app.js", "auth.js"):
        f = WEBAPP / name
        assert f.is_file(), f"missing {name}"
        assert f.stat().st_size > 1000, f"{name} looks truncated"
