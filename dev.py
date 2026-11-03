from __future__ import annotations

import os
from pathlib import Path
import subprocess
import sys
import time


ROOT = Path(__file__).resolve().parent
IGNORED_DIRS = {"__pycache__", ".git", "venv"}
POLL_INTERVAL = 0.5
SAVE_SETTLE_DELAY = 0.8


def source_snapshot() -> dict[Path, tuple[int, int]]:
    snapshot = {}
    for path in ROOT.rglob("*.py"):
        if any(part in IGNORED_DIRS for part in path.relative_to(ROOT).parts):
            continue
        try:
            stat = path.stat()
        except FileNotFoundError:
            continue
        snapshot[path] = (stat.st_mtime_ns, stat.st_size)
    return snapshot


def start_app() -> subprocess.Popen:
    env = os.environ.copy()
    env["PYTHONIOENCODING"] = "utf-8"
    print("[JARVIS dev] Starting app...", flush=True)
    return subprocess.Popen([sys.executable, "main.py"], cwd=ROOT, env=env)


def stop_app(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def main() -> None:
    snapshot = source_snapshot()
    process = start_app()
    print("[JARVIS dev] Watching Python files. Press Ctrl+C to stop.", flush=True)

    try:
        while True:
            time.sleep(POLL_INTERVAL)
            current = source_snapshot()
            if current == snapshot:
                continue

            time.sleep(SAVE_SETTLE_DELAY)
            current = source_snapshot()
            if current == snapshot:
                continue

            print("[JARVIS dev] Source changed; restarting app...", flush=True)
            stop_app(process)
            snapshot = current
            process = start_app()
    except KeyboardInterrupt:
        print("\n[JARVIS dev] Stopping...", flush=True)
    finally:
        stop_app(process)


if __name__ == "__main__":
    main()
