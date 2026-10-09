#!/usr/bin/env python3
"""Polecats wrapper → ``sync/audio/extract_pitch_stacks.py``.

Prefers writing ``pitch_stacks.json`` / ``pitch_studio.json`` into each polecat
folder (same as the library pipeline). Optional ``--work-copy`` also mirrors
timelines under ``work/polecat-pitch-stacks/``.
"""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
from pathlib import Path

POLECATS = Path(__file__).resolve().parent
SITE = POLECATS.parent
SYNC_AUDIO = SITE / "sync" / "audio" / "extract_pitch_stacks.py"
WORK = SITE / "work" / "polecat-pitch-stacks"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--frames", action="store_true")
    ap.add_argument("--workers", type=int, default=2)
    ap.add_argument("--id", type=int, action="append", default=[])
    ap.add_argument(
        "--work-copy",
        action="store_true",
        help="Also copy pitch_stacks.json into work/polecat-pitch-stacks/{id}/",
    )
    args = ap.parse_args()

    cmd = [
        sys.executable,
        str(SYNC_AUDIO),
        "--source",
        str(POLECATS),
        "--workers",
        str(args.workers),
    ]
    if args.force:
        cmd.append("--force")
    if args.frames:
        cmd.append("--frames")
    for i in args.id:
        cmd += ["--id", str(i)]
    rc = subprocess.call(cmd)
    if rc != 0:
        return rc

    if args.work_copy:
        WORK.mkdir(parents=True, exist_ok=True)
        for folder in sorted(POLECATS.iterdir()):
            stacks = folder / "pitch_stacks.json"
            if not stacks.is_file():
                continue
            doc = json.loads(stacks.read_text())
            tid = doc.get("id")
            if tid is None:
                continue
            dest = WORK / str(tid)
            dest.mkdir(parents=True, exist_ok=True)
            shutil.copy2(stacks, dest / "stacks.json")
            summary = folder / "pitch_summary.txt"
            if summary.is_file():
                shutil.copy2(summary, dest / "summary.txt")
        print(f"Work copy → {WORK}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
