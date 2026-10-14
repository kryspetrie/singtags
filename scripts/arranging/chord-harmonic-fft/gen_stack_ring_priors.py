#!/usr/bin/env python3
"""Regenerate web/.../stackRingPriors.generated.ts from out/results.json (voice/just)."""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
RESULTS = ROOT / "out" / "results.json"
OUT = (
    ROOT.parents[2]
    / "web"
    / "src"
    / "domain"
    / "arranging"
    / "harmonicity"
    / "stackRingPriors.generated.ts"
)


def main() -> None:
    rows = json.loads(RESULTS.read_text(encoding="utf-8"))
    voice = [r for r in rows if r.get("source") == "voice"]
    if not voice:
        raise SystemExit("no voice rows in results.json — run analyze_chord_harmonics.py first")
    xs = [float(r["fft_score"]) for r in voice]
    lo, hi = min(xs), max(xs)
    lines = [
        "/**",
        " * Measured stack-ring priors from JI FFT analysis (voice @ E3, mid/side stacks).",
        " * Values are min–max normalized FFT lock scores in [0,1] (higher = stronger measured ring).",
        " * Source: scripts/arranging/chord-harmonic-fft/out/results.json (voice/just).",
        " * Regenerate: python3 scripts/arranging/chord-harmonic-fft/gen_stack_ring_priors.py",
        " */",
        "",
        "export const STACK_RING_PRIORS: Readonly<Record<string, number>> = {",
    ]
    for r in sorted(voice, key=lambda row: row["stack_id"]):
        t = (float(r["fft_score"]) - lo) / (hi - lo + 1e-12)
        lines.append(f"  '{r['stack_id']}': {t:.4f},")
    lines.append("}")
    lines.append("")
    OUT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({len(voice)} stacks)")


if __name__ == "__main__":
    main()
