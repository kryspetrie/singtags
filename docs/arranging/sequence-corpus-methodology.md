# Chord-sequence corpus methodology — detect, score, train, cluster

**Purpose:** Turn learning-track pitch extracts into timing-agnostic **highway**
gold sequences, score Basic Path Optimize against them, and decide whether to
change **product rules** vs **ranking weights** vs **song-style presets**.

**Lived example:** Polecats loop — [polecat-sequence-loop-2026-10.md](polecat-sequence-loop-2026-10.md)  
**Classic Tags run:** [classic-sequence-loop-2026-10.md](classic-sequence-loop-2026-10.md)

---

## 1. Pipeline overview

```
learning tracks (TTBB)
        │
        ▼
 pitch_stacks.json          ← sync/audio/extract_pitch_stacks.py
        │
        ▼
 sequence fixtures          ← collapse + pillar/passing/mid labels
        │
        ├─► baseline eval   ← Basic Path Optimize → highway LCS
        ├─► weight sweep    ← corpus / per-song coordinate descent
        ├─► style flags     ← chromatic, mediant, circle, I6, …
        └─► cluster decide  ← rules vs presets vs “already fits Basic”
```

| Stage | Artifact | Owner |
| --- | --- | --- |
| Detect | `pitch_stacks.json` / `pitch_studio.json` | `sync/audio/extract_pitch_stacks.py` |
| Label | `{tagId}.json` fixtures + `index.json` | `*/build_gold_sequences.py` (mirrors `labelSequence.ts`) |
| Score | highway / strict / nature micros | `polecatGold/sequenceEval.ts` |
| Gate | `baseline.json` | CI on **gold** only; holdout advisory |
| Train | weight grids, pathOptimize knobs | `*WeightSweep*` / `*PerSongTune*` (manual vitest) |
| Cluster | style flags + knob signatures | per-song report JSON + docs |

---

## 2. Detection (audio → stacks)

1. Prefer 4-part learning tracks under `library/` or `polecats/`.
2. Run YIN+align extract:

   ```bash
   sync/.venv/bin/python sync/audio/extract_pitch_stacks.py \
     --source library --workers 4 --id <tagId> …
   ```

3. Outputs per folder: `pitch_stacks.json` (timeline), `pitch_studio.json` (Tag Studio),
   `pitch_summary.txt`.
4. Trust extract **roots + natures** as corpus gold for sequence work; do **not**
   treat absolute timing as Coach ticks.

**Quality notes**

- Low-confidence / `unknown` / dim / aug natures are noisy — labeling demotes them.
- Dom9 / I6 / chromatic roots are real barbershop color; keep them when duration supports pillars.

---

## 3. Labeling (stacks → sequence fixtures)

Mirror TypeScript `collapseAndLabel` in the Python builder:

1. Collapse consecutive identical `(rootPc, natureId)`.
2. Median duration → **pillar** if long + highway-flavored (or very long chromatic hold).
3. Short non-highway → **passing**; else **mid**.
4. Store `leadMidi` when present (Coach melody contour).

**Highway function** (for pillars / eval keys) is about sequence role, not voicing shell:

| Slot | Equivalences |
| --- | --- |
| I / IV | `major` ≡ `seventh` ≡ `sixth` (I6) |
| V | `major` ≡ `seventh` (Dom9 ≡ Mm7 via ninth→seventh) |
| ii / II | `minor` / `m7` / `seventh` / `major` → supertonic |
| iii / III7 | `minor` / `m7` / `seventh` → mediant |
| Color shells | `ninth` ≡ `seventh`, `m7`/`madd6` ≡ `minor` |

Coach **input** for eval: pillars = gold pillar **roots** only; melody = full Lead contour.

---

## 4. Scoring (fixtures → metrics)

Run Basic Path Optimize (`risk: 0`, `cadenceBias: moderate`) and compare predicted
collapsed stacks to gold pillars.

| Metric | Meaning | CI role |
| --- | --- | --- |
| `pillarNorm` | LCS(highway keys) / \|gold highway\| | **Primary gate** for gold tags |
| `strictPillarNorm` | LCS(exact `natureId@rootPc`) | Honesty / secondary |
| `natureMatch` | Exact nature on LCS-aligned highway pairs | Diagnostic |
| `softFullNorm` | Pred vs all gold tokens (incl. mid/passing) | Soft |

**Regression:** gold micro / per-tag `pillarNorm` must not fall more than `REGRESSION_EPS` (~0.03) below `baseline.json`. Holdouts warn only until promoted into `index.json` `gold`.

---

## 5. Training loop (what to twist, in order)

### 5.1 Product rules first

Weight floods plateaued on Polecats (~0.69–0.73). Gains came from:

- Pillar labeling hygiene  
- Highway key slots  
- Basic candidate gates (`secDomNextOnly`, Lead-gated mediant, I6 allowlist, chromatic no-pass, cadence seeds @ phrase ends)

**Rule:** if a song is **weight-immune** (per-song tune Δhwy ≈ 0) but baseline ≪ 1.0, look for allowlist / prefer / seed bugs — not JSON knobs.

### 5.2 Weight / taste sweeps

Trainable surfaces (Path Optimize Basic):

1. `rankerDeps.weights` **base multipliers** fed into `rankerDepsForWeights` (default scale-from-1; JSON ranking is **not** auto-wired into Path Optimize).
2. `pathWeights.cadenceBias` (`off` / `moderate` / `strong`), `issuePenalty`, `stayPutEpsilon`.

Procedure:

1. **Corpus sweep** — maximize holdout (or full-corpus) micro with gold floor (≥ 0.97 or current baseline).  
2. **Per-song tune** — coordinate descent per tag; record knob signature + Δhwy.  
3. **Cross-apply presets** — test cluster recipes on the whole corpus; reject any that break gold.

Ship weight changes only when gold floors hold and adversarial corpus stays green.

### 5.3 Style flags (for clustering)

Compute from gold pillars (not from weights):

| Flag | Signal |
| --- | --- |
| `chromatic` / `chromatic-roots` | bII / bV / bVI… romans or non-diatonic roots |
| `mediant` | iii / III7 |
| `circle` | VI7 + II7 present |
| `I7-IV` | IV7 present |
| `supertonic-minor` | ii / ii7 |
| `added6` | I6 / sixth |
| `dense-7ths` / `triad-leaning` | Mm7 density thresholds |

---

## 6. Clustering decision tree

```
per-song Δhwy ≈ 0 and baseline ≥ 0.98  →  Cluster A “fits Basic”
per-song Δhwy ≈ 0 and baseline soft      →  Cluster B/C… “needs rules”
  ├─ missing I6 / sixth                  →  allowlist / Lead-on-6 prefer
  ├─ III7 vs iii mismatch                →  Lead-gate mediant
  ├─ chromatic pillar extras             →  no-pass under chromatic pillars
  └─ mid-phrase cadence spam             →  moderate seeds @ cadence/tag only
per-song Δhwy > ε with shared knobs      →  candidate taste preset
  └─ cross-apply hurts gold?             →  reject preset; keep as diagnostic
```

**Do not** ship song-id-specific ranking presets. Prefer:

1. Shared product rules that lift a style cluster on **default Classic** taste.  
2. Optional **taste profiles** (Classic / Circle / Busy) — user-selected in Optimize UI; Classic stays the Coach default and CI gate.  
3. Promote holdout → gold in `index.json` only when default Classic taste reaches gold floors.

---

## 7. How to run (checklist)

```bash
# --- Classic Tags (catalog collection `classic`) ---
# 1) Detect
sync/.venv/bin/python sync/audio/extract_pitch_stacks.py \
  --source library --workers 4 $(jq -r '.ids[]|"--id \(.)"' work/classic_tag_ids.json)

# 2) Fixtures
python3 scripts/arranging/build_classic_sequences.py

# 3) Baseline + advisory
cd web && npx vitest run src/domain/arranging/classicGold/classicSequenceLoop.test.ts

# 4) Per-song tune + clusters (manual, long)
npx vitest run src/domain/arranging/classicGold/classicPerSongTune.test.ts

# --- Polecats ---
python3 polecats/extract_pitch_stacks.py
python3 polecats/build_gold_sequences.py
cd web && npx vitest run src/domain/arranging/polecatGold/polecatSequenceLoop.test.ts

# Keep product green
npx vitest run src/domain/arranging/pathOptimize/adversarialCorpusLoop.test.ts \
  src/domain/arranging/polecatGold/polecatSequenceLoop.test.ts
```

| Corpus | Fixtures | Docs |
| --- | --- | --- |
| Polecats | `polecatGold/` · `polecats/build_gold_sequences.py` | [polecat-sequence-loop-2026-10.md](polecat-sequence-loop-2026-10.md) |
| Classic Tags | `classicGold/` · `scripts/arranging/build_classic_sequences.py` | [classic-sequence-loop-2026-10.md](classic-sequence-loop-2026-10.md) |

---

## 8. What “done” looks like

| Goal | Evidence |
| --- | --- |
| Gold sequence fidelity | Gold micro highway = 1.000 (or agreed floor) on CI |
| Holdout readiness | Advisory micro rising **without** gold regress |
| Rules vs weights | Weight-immune soft tags have a named rule fix or accepted extract gap |
| Clusters | Style table + “ship rule / reject preset” notes in the corpus loop doc |
| Safety | Adversarial corpus loop still green |

---

## 9. Non-goals

- No ML sequence models in this loop.  
- No TTBB voicing / MIDI register match as the primary score.  
- No treating audio timing as Coach tick grid.  
- No force-pushing holdouts into Tag Studio gold without default-Basic floors.
