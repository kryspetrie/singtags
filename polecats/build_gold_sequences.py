#!/usr/bin/env python3
"""Build Coach gold chord-sequence fixtures from polecat pitch_stacks.json.

Collapses consecutive identical (rootPc, natureId), labels pillar/passing/mid
from duration + highway function. Timing is kept only as relative dur for
synthetic pillar spans — Coach eval ignores absolute clock time.
"""

from __future__ import annotations

import argparse
import json
import statistics
from pathlib import Path

POLECATS = Path(__file__).resolve().parent
OUT_DIR = POLECATS.parent / "web" / "src" / "domain" / "arranging" / "polecatGold" / "fixtures"

# Tag Studio gold seeds — CI regression gate for Coach sequence fidelity.
GOLD_TAG_IDS = (90001, 90003, 90006, 90009)

# Full polecat catalog (holdout = everything with stacks not in GOLD).
ALL_TAG_IDS = (
    90001,
    90002,
    90003,
    90004,
    90005,
    90006,
    90007,
    90008,
    90009,
    90010,
    90011,
    90012,
)


def _degree(root_pc: int, tonality: int) -> int:
    return (int(root_pc) - int(tonality)) % 12


def _is_highway(root_pc: int, nature: str, tonality: int, *, long: bool) -> bool:
    deg = _degree(root_pc, tonality)
    n = (nature or "").lower()
    if deg == 0 and n in ("major", "seventh", "ninth", "sixth"):
        return True
    if deg == 5 and n in ("major", "seventh", "ninth", "sixth"):
        return True
    if deg == 7 and n in ("seventh", "ninth", "major"):
        return True
    # ii / ii7 and II7 (= V7/V) — not madd6 (YIN color noise on long holds).
    if deg == 2 and n in ("minor", "m7", "seventh", "ninth", "major"):
        return True
    # vi / vi7 when long; VI7 (= V7/ii) is a highway approach even when short-ish.
    if deg == 9:
        if n in ("seventh", "ninth"):
            return True
        if n in ("minor", "m7") and long:
            return True
    return False


def collapse_and_label(stacks: list[dict], tonality: int) -> list[dict]:
    collapsed: list[dict] = []
    for st in stacks:
        root = int(st["rootPc"])
        nature = str(st.get("natureId") or "unknown")
        dur = float(st.get("dur") or (float(st["t1"]) - float(st["t0"])))
        lead = (st.get("midi") or {}).get("lead")
        roman = str(st.get("roman") or "")
        if (
            collapsed
            and collapsed[-1]["rootPc"] == root
            and collapsed[-1]["natureId"] == nature
        ):
            collapsed[-1]["dur"] = round(collapsed[-1]["dur"] + dur, 4)
            if lead is not None:
                collapsed[-1]["leadMidi"] = int(lead)
            continue
        collapsed.append(
            {
                "roman": roman,
                "rootPc": root,
                "natureId": nature,
                "dur": round(dur, 4),
                "leadMidi": int(lead) if lead is not None else None,
                "confidence": float(st.get("confidence") or 0),
            }
        )

    durs = [t["dur"] for t in collapsed if t["dur"] > 0]
    med = float(statistics.median(durs)) if durs else 0.5
    for t in collapsed:
        long = t["dur"] >= med * 1.25
        short = t["dur"] <= med * 0.8
        noisy = (t["natureId"] or "").lower() in (
            "unknown",
            "madd6",
            "dim7",
            "dim",
            "aug",
        )
        deg = _degree(t["rootPc"], tonality)
        diatonic_deg = deg in (0, 2, 4, 5, 7, 9, 11)
        very_long = t["dur"] >= med * 1.6
        highway = (not noisy) and _is_highway(
            t["rootPc"], t["natureId"], tonality, long=long
        )
        long_ok = (
            long
            and not noisy
            and (diatonic_deg or very_long)
            and (highway or very_long)
        )
        if long_ok:
            role = "pillar"
        elif highway and not short and diatonic_deg:
            role = "pillar"
        elif short and not highway:
            role = "passing"
        else:
            role = "mid"
        t["role"] = role
        t["medianDur"] = round(med, 4)
    return collapsed


def build_one(stacks_path: Path) -> dict:
    doc = json.loads(stacks_path.read_text())
    tonality = int(doc.get("tonality") or 0)
    mode = str(doc.get("mode") or "major")
    tokens = collapse_and_label(list(doc.get("stacks") or []), tonality)
    pillars = [t for t in tokens if t["role"] == "pillar"]
    return {
        "tagId": int(doc["id"]),
        "title": doc.get("title"),
        "tonality": tonality,
        "mode": mode,
        "bpm": doc.get("bpm"),
        "sourceMethod": doc.get("method"),
        "stackCountRaw": int(doc.get("stack_count") or len(doc.get("stacks") or [])),
        "tokenCount": len(tokens),
        "pillarCount": len(pillars),
        "pillarRomans": [t["roman"] for t in pillars],
        "tokens": tokens,
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--out", type=Path, default=OUT_DIR)
    ap.add_argument(
        "--id",
        type=int,
        action="append",
        default=[],
        help="Tag id(s) to build (default: all polecats with pitch_stacks.json)",
    )
    ap.add_argument(
        "--gold-only",
        action="store_true",
        help="Build only Tag Studio gold ids",
    )
    args = ap.parse_args()
    if args.id:
        ids = args.id
    elif args.gold_only:
        ids = list(GOLD_TAG_IDS)
    else:
        ids = list(ALL_TAG_IDS)
    args.out.mkdir(parents=True, exist_ok=True)

    index = []
    for tid in ids:
        folder = next(POLECATS.glob(f"*{tid}*"), None)
        if folder is None or not (folder / "pitch_stacks.json").is_file():
            print(f"skip {tid}: no pitch_stacks.json")
            continue
        fix = build_one(folder / "pitch_stacks.json")
        out = args.out / f"{tid}.json"
        out.write_text(json.dumps(fix, indent=2) + "\n")
        role = "gold" if tid in GOLD_TAG_IDS else "holdout"
        index.append(
            {
                "tagId": tid,
                "role": role,
                "file": out.name,
                "title": fix["title"],
                "pillars": fix["pillarCount"],
                "tokens": fix["tokenCount"],
                "pillarRomans": fix["pillarRomans"],
            }
        )
        print(
            f"→ {out.name} [{role}] tokens={fix['tokenCount']} "
            f"pillars={fix['pillarCount']} "
            f"highway={' '.join(fix['pillarRomans'][:16])}"
        )

    built_ids = [e["tagId"] for e in index]
    gold = [t for t in GOLD_TAG_IDS if t in built_ids]
    holdout = [t for t in built_ids if t not in GOLD_TAG_IDS]
    (args.out / "index.json").write_text(
        json.dumps(
            {"gold": gold, "holdout": holdout, "fixtures": index},
            indent=2,
        )
        + "\n"
    )
    print(f"Wrote {len(index)} fixtures → {args.out} (gold={gold} holdout={holdout})")
    return 0 if index else 1


if __name__ == "__main__":
    raise SystemExit(main())
