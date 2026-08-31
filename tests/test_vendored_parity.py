"""Guards the Vercel deployment contract: api/backend must stay identical to backend/.

If these drift, the serverless function runs different code than local dev —
the exact class of bug that caused the original 500s.
"""
import filecmp
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]

def test_vendored_backend_parity():
    src = ROOT / "backend"
    vendored = ROOT / "api" / "backend"
    assert vendored.is_dir(), "api/backend missing — Vercel function would 500"
    py_files = sorted(p.name for p in src.glob("*.py"))
    assert py_files, "no backend sources found"
    for name in py_files:
        assert filecmp.cmp(src / name, vendored / name, shallow=False), (
            f"api/backend/{name} drifted from backend/{name} — re-sync before deploy")
