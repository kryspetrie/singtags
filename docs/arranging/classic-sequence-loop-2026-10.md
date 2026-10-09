# Classic Tags chord-sequence loop — 2026-10

**Methodology:** [sequence-corpus-methodology.md](sequence-corpus-methodology.md)  
**Corpus:** catalog collection `classic` (125 booklet tags; 120 fixtures after extract/label)  
**Harness:** `web/src/domain/arranging/classicGold/`  
**Builder:** `scripts/arranging/build_classic_sequences.py`  
**IDs list:** `work/classic_tag_ids.json`

All Classic tags are **advisory** (no Tag Studio / CI gold gate yet). Score = Basic Path Optimize highway pillar LCS (same as Polecats).

---

## Detect

```bash
sync/.venv/bin/python sync/audio/extract_pitch_stacks.py \
  --source library --workers 4 \
  $(jq -r '.ids[]|"--id \(.)"' work/classic_tag_ids.json)
# → 123 ok, 2 skipped (extract)
python3 scripts/arranging/build_classic_sequences.py
# → 120 fixtures (5 skipped: extract miss or pillars < 4)
```

---

## Baseline (default Basic)

| Metric | Value |
| --- | ---: |
| n | 120 |
| **micro highway** | **0.928** |
| micro strict | 0.602 |
| saturated (≥0.99) | **69** (57%) |
| soft (<0.90) | **42** (35%) |

Snapshot: `classicGold/baseline.json`. Soft examples: *To My Beautiful Lifelong Friends* (0.50), *Friendship and Love* (0.60), *Midnight Rose* (0.67), *Autumn Leaves* / *Sonny Boy* / *When I Leave the World Behind* (0.71).

---

## Per-song weight tune

Harness: `classicPerSongTune.test.ts` → `perSongTune.json`.

- Tune only tags with hwy < 0.97; coarse grid `{0.5, 2}` on 8 knobs + cadenceBias.
- **Weight helped:** 15 / 120  
- **Weight-immune soft:** 31 / 42 soft tags (rules/extract, not knobs)

Most common helpful knobs (per-song, **not** globally safe):

| Knob / bias | Songs helped (examples) |
| --- | --- |
| `cadenceBias=off` | 6 (incl. several circle/chromatic) |
| `diatonicFunction↑` | 5 |
| `cadenceBias=strong` | 3 (chromatic oddballs) |
| `unforcedMinorPenalty↑` | 2 |

### Cross-apply presets (reject for shipping)

| Preset | All micro | Soft micro |
| --- | ---: | ---: |
| Basic (current) | **0.928** | 0.815 |
| passingSoft↑ | 0.930 | 0.817 |
| circle-up | 0.918 | 0.827 |
| diatonic↑ | 0.917 | 0.824 |
| cadence-off | 0.926 | 0.807 |
| minor-soft | 0.894 ↓ | 0.796 |

No global preset beats Basic on the full Classic corpus without regressing the saturated majority. Same conclusion as Polecats: **do not ship song-weight presets**.

---

## Clusters

| Cluster | n | Meaning | Next lever |
| --- | ---: | --- | --- |
| **A — fits Basic** | 69 | hwy ≈ 1.000 on default | Keep; promotion candidates |
| **B — rule / extract gap** | ~36 | Soft + weight-immune | Product rules / fixture hygiene |
| **C — weight-sensitive** | 15 | Per-song knobs help | Diagnostic only until gold-safe |

### Style signals inside soft / immune tags

Dominant flags among weight-immune soft (counts):

| Style | Count | Interpretation |
| --- | ---: | --- |
| `triad-leaning` | 22 | Extract/gold sparse Mm7; Coach fills sevenths / extras |
| `supertonic-minor` | 17 | ii / ii7 density vs II7 highway |
| `chromatic` / `chromatic-roots` | 11 | Beyond current chromatic-pillar no-pass |
| `added6` | 9 | I6 still under-fired or Lead not on 6 in extract |

### Rules + taste shipped (2026-10-08 night)

| Change | Where |
| --- | --- |
| Classic taste: suppress mid-phrase sec-dom except near next pillar | `candidates.ts` |
| Chromatic pillars: prefer Mm7 (bII7/bV7/bVI7 chains) | `candidates.ts` |
| I6 prefer also from Lead MIDI (not only voicing digit) | `leadRoleFromMidi` |
| Taste presets: **Classic** / **Circle** / **Busy** in Optimize UI | `taste.ts`, `ArrangingPathOptimize.vue` |

Re-score after ship: Classic micro hwy **0.927** (was 0.928) — flat; Polecat gold still **1.000**, holdout **0.949**. Soft triad/chromatic tags remain extract-hard; Circle/Busy are user-selectable, not auto-global.

---

## How this relates to Polecats

| | Polecats | Classic |
| --- | --- | --- |
| n | 12 | 120 |
| Gold CI | 4 Tag Studio | none yet |
| Holdout / advisory micro | 0.949 | 0.928 |
| Fits Basic | most gold + several holdouts | 69 / 120 |
| Weight presets | rejected | rejected |
| Best next work | remaining busy IV7 / Nellie | triad-leaning + deep chromatic rules |

Promote Classic tags into a future gold gate only when default Basic hwy ≥ agreed floor (suggest 0.98) **and** adversarial stays green.

---

## Commands

```bash
# Detect + fixtures
sync/.venv/bin/python sync/audio/extract_pitch_stacks.py --source library --workers 4 \
  $(jq -r '.ids[]|"--id \(.)"' work/classic_tag_ids.json)
python3 scripts/arranging/build_classic_sequences.py

# Baseline + clusters
cd web
npx vitest run src/domain/arranging/classicGold/classicSequenceLoop.test.ts
npx vitest run src/domain/arranging/classicGold/classicPerSongTune.test.ts
```
