"""Runs the node test-suite for services/device-utils.js (spec: failure,
duplicate, bad-data, refresh and polling helpers).

Skips cleanly when node is unavailable (e.g. minimal CI images); the same
assertions also guard the browser bundle loaded by device-panel.js.
"""
import shutil
import subprocess
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
NODE_TEST = ROOT / "tests" / "device_utils.test.js"

node = shutil.which("node")


@pytest.mark.skipif(node is None, reason="node unavailable")
def test_device_utils_node_suite():
    assert NODE_TEST.exists(), "tests/device_utils.test.js missing"
    r = subprocess.run([node, str(NODE_TEST)], capture_output=True,
                       text=True, timeout=120, cwd=str(ROOT))
    assert r.returncode == 0, f"node suite failed:\n{r.stdout}\n{r.stderr[-2000:]}"
    assert "assertions passed" in r.stdout
