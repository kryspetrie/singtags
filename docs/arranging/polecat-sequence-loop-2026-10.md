# Polecat chord-sequence Coach loop — 2026-10

**Methodology:** [sequence-corpus-methodology.md](sequence-corpus-methodology.md) · Classic Tags run: [classic-sequence-loop-2026-10.md](classic-sequence-loop-2026-10.md)

**Harness:** `web/src/domain/arranging/polecatGold/polecatSequenceLoop.test.ts`  
**Gold (CI gate):** Irish Rose (90001), Sweet And Lovely (90003), Sweetheart (90006), Story of the Rose (90009)  
**Holdout (advisory):** remaining 8 polecats (90002, 90004–05, 90007–08, 90010–12) — scored every run, floors in `baseline.json` `holdout*`, not CI-failing until promoted  
**Score:** timing-agnostic pillar LCS on **highway keys** (see below)  
**Related:** [adversarial-algo-loop-2026-10.md](adversarial-algo-loop-2026-10.md) · [`defaultWeights.json`](../../web/src/domain/arranging/defaultWeights.json) · `pathOptimize/candidates.ts`

Fixtures: `web/src/domain/arranging/polecatGold/fixtures/*.json` (+ `index.json` gold/holdout roles)  
Builder: `polecats/build_gold_sequences.py` (mirrors `labelSequence.ts`; `--gold-only` to rebuild Tag Studio four)  
Corpus helper: `polecatGold/corpus.ts`

---

## Peak baseline (gold — hour loop)

| Tag | highway pillarNorm | strict nature@root | softFullNorm | Notes |
| --- | ---: | ---: | ---: | --- |
| 90001 | 1.000 | 0.808 | 0.545 | Was 0.528 |
| 90003 | 1.000 | 0.818 | 0.588 | Was 0.575 |
| 90006 | 1.000 | 0.850 | 0.735 | Was 0.900 |
| 90009 | 1.000 | 0.833 | 0.612 | Was 0.750 |
| **gold micro** | **1.000** | **0.841** | **0.625** | Was 0.688 hwy / 0.827 strict |

CI gates **highway** `pillarNorm` on **gold only**. `strictPillarNorm` is logged for honesty (exact `natureId@rootPc`).

Adversarial corpus loop: all 5 passes green after accepted product changes.

---

## Holdout expand (2026-10-08)

All 12 polecats now have fixtures. First advisory snapshot (Basic Path Optimize, same highway LCS):

| Tag | Title | highway | strict | Notes |
| --- | --- | ---: | ---: | --- |
| 90002 | Wait 'Til The Sun Shines, Nellie | 0.891 | 0.729 | Still soft; longest extract |
| 90004 | Down Our Way | **1.000** | 0.789 | Chromatic-pillar rule |
| 90005 | Honey - Little 'Lize Medley | **0.938** | 0.583 | Was 0.857 — I6 + III7 rules |
| 90007 | Sweet, Sweet Roses Of Morn | 0.897 | 0.821 | Was 0.872 |
| 90008 | Shine On Me | 1.000 | 0.650 | |
| 90010 | Sweet Adeline | 1.000 | 0.722 | |
| 90011 | Down By The Old Mill Stream | 0.923 | 0.750 | |
| 90012 | You Tell Me Your Dream | 0.944 | 0.737 | |
| **holdout micro** | | **0.949** | **0.723** | Was 0.929 / 0.717 |

Holdout stays out of Tag Studio / CI gate until a tag is promoted into `index.json` `gold`.

---

## What moved the needle (strategy shift)

Weight-only passes plateaued (~0.69–0.73). Gains came from **fixture hygiene + eval highway slots + Basic candidate gates**:

1. **Pillar labeling** — stricter duration (`≥ 1.25× median`); exclude `madd6` / `unknown` / dim / aug from highway prior; chromatic roots need very long holds; long holds still need highway flavor (kills `v7` on V).
2. **Coach input** — pillars = gold pillar roots only (not mid); melody keeps full Lead contour.
3. **Highway key LCS** — sequence function, not voicing color:
   - `ninth` ≡ `seventh`, `m7`/`madd6` ≡ `minor`
   - I / IV / II: `major` ≡ `seventh`
   - V: `major` ≡ `seventh`
   - iii: `minor` / `m7` / `seventh` same slot
   - Collapse consecutive identical keys on gold **and** pred
4. **Product (Basic)** — `secDomNextOnly` (no V7-of-current flood); prefer VI7/VII7 over diatonic m7 when Mm7 places; Dom9→Mm7 soft prefer; circleHwy Lead-on-1 sec-dom bump; roman `VI7`/`VII7`/`III7` labels for Mm7.

---

## Pass log (compressed)

| Pass | Change | Micro |
| --- | --- | ---: |
| 0 | Fixtures + eval + initial baseline | 0.688 |
| 1 | Raise cadenceFit / sec-dom floors | 0.678 (regress) |
| 2–3 | Recover Dom9 discipline / tonic major | 0.688 |
| 4 | `secDomNextOnly` + pillar-only roots | ~0.69 abs↑ on weak tags |
| 5–7 | II7/VI7 highway labels, collapse gold pillars, highwayKey ninth≡seventh | 0.733 |
| 8–12 | Ranker/sec-dom VI7 attempts (mostly flat) | 0.733 |
| 13–14 | 1:1 pillar melody (worse) → revert | — |
| 15–16 | I/IV/II triad≡Mm7, V≡V7 | 0.830 |
| 17 | Mediant slot + stricter pillars | 0.855 |
| 18 | Drop madd6/unknown pillars | 0.937 |
| 19 | Chromatic filter + longOk=highway\|veryLong | 0.961 |
| 20 | Supertonic slot (ii / ii7 / II7) | **1.000** |

---

## Product files touched

| File | Change |
| --- | --- |
| `defaultWeights.json` | Editable ranking + Path Optimize defaults |
| `pathOptimize/candidates.ts` | `secDomNextOnly`; Dom9→Mm7 / VI7 / VII7 / iii prefers |
| `harmonize/candidateGenerator.ts` | `secDomNextOnly` input |
| `harmonize/candidateRanker.ts` | circleHwy Lead-on-1; natureScale for weak degrees |
| `secondaryDominant.ts` | VI7 / VII7 / III7 roman for Mm7 |
| `polecatGold/*` | fixtures, label, eval, baseline |

---

## Weight sweep on expanded corpus (2026-10-08)

Harness: `polecatWeightSweep.test.ts` (manual) — coordinate grid + theory clusters; objective = maximize **holdout** highway micro with gold highway ≥ 0.97.

| Trial | Gold hwy | Holdout hwy | Verdict |
| --- | ---: | ---: | --- |
| Baseline (current Basic) | **1.000** | **0.929** | Keep |
| Wire `defaultWeights.json` ranking as Path Optimize base | 0.956 ↓ | 0.927 | **Illegal** — JSON×scale overwrites Basic multipliers |
| `cadenceBias=off` | 0.992 | 0.936 | Tiny holdout↑; nicks 90003 |
| `diatonicFunction=3` | 0.978 | 0.934 | Holdout↑ via 90002; **90001 → 0.913** |
| Best bundle: diatonic=3, seventh=3, unforcedMinor=0.25 | 0.970 | **0.941** | Holdout↑ (90002/90005); gold Tag Studio regress |
| Most other knobs / clusters | ~flat | ~flat | Same plateau as gold-only hour loop |

**Ship decision:** do **not** commit the best bundle. Holdout gains are paid with Irish Rose / Sweet And Lovely highway regress; CI gold gate should stay at 1.000 floors.

### Assertions / rules to re-evaluate (not auto-change)

1. **`unforcedMinorPenalty` at Basic** — Theory audit (BAM/Flinn) wants demotion; holdouts 90002/90005 improve when the knob is *softened*. Revisit as Lead-forced / mediant exceptions, not a global cut.
2. **`diatonicFunction` strength** — Raising the Path Optimize base helps Nellie (90002) but breaks Irish Rose (90001). Classical highway lock vs gold extract tension; prefer fixture/highway-slot work over cranking the weight.
3. **`defaultWeights.json` ↔ Path Optimize wiring** — Ranking keys that `rankerDepsForWeights` sets currently scale from **1**, not from JSON. Editing JSON alone does not tune Basic Path Optimize the way the file comment implies; wiring JSON as base **regresses** gold. Either document the split (Walk uses JSON; Path Optimize uses risk-scaled multipliers) or deliberately re-base and re-baseline.
4. **`cadenceBias: moderate`** — Still correct default; `off` is a small holdout nudge, not a product change.
5. **Product rules stay the lever** — `secDomNextOnly`, highwayKey slots, pillar labeling remain what moved gold to 1.000; weight training on 12 tags does not obsolete them.

---

## Per-song tune + clusters (2026-10-08)

Harness: `polecatPerSongTune.test.ts` → `perSongTune.json`.

### Do presets make sense?

**Mostly no for weight presets.** Per-song coordinate descent:

| Tag | Baseline → best | Knobs that helped | Notes |
| --- | --- | --- | --- |
| Gold four | 1.000 → 1.000 | none meaningful | Already saturated |
| 90008, 90010, 90012, 90004 | already high / flat | cadence-off noise only | Weights don't move highway |
| **90005 Honey** | **0.857 → 0.857** | **none** | Weight-immune |
| 90002 Nellie | 0.891 → 0.945 | cadence=off, diatonic↑, passingSoft↑ | |
| 90007 Roses of Morn | 0.872 → 0.949 | colorPen↑, passingSoft↑ | |
| 90011 Mill Stream | 0.923 → 1.000 | cadence=off, diatonic↑, seventh↑, passingSoft↑ | |

Cross-applying those “winner” knobs as global presets (`minor-soft`, `highway-dense`, `cadence-off`, …) still **nicks gold** and only lifts holdout micro by ~0.005–0.012. Songs do **not** fall into 2–3 stable weight clusters that share one vector.

Style flags *do* group, and those groups point at **rules**, not knobs:

| Style cluster | Members | Weight help? | Better lever |
| --- | --- | --- | --- |
| **A. Classic circle** | 90001, 90003, 90006, 90009, 90010 | n/a (done) | Keep Basic |
| **B. I6 / mediant-III7 color** | **90005** (also 90012 I6) | **No** | Allowlist + mediant prefer |
| **C. Chromatic approaches** | 90002 bV7, 90004 bVI7/bII7, 90007 bII7, 90008 bVI7 | Partial (90002) | Chromatic approach / keep gold pillar root |
| **D. Dense IV7 + passing noise** | 90007, 90011 (, 90002) | Yes (passingSoft↑) | Passing / cadenceBias discipline |

**Recommendation:** do **not** ship song-specific ranking presets. Treat A as the default Basic profile; fix B/C/D with targeted product rules; only then re-score holdouts for promotion.

### Rules updated (2026-10-08 evening)

| # | Change | File(s) | Effect |
| --- | --- | --- | --- |
| 1 | Basic allowlist + prefer `sixth` when Lead is 6 on I/IV; highwayKey `sixth≡triad7` on I/IV | `candidates.ts`, `candidateRanker.ts`, `sequenceEval.ts` | Honey **0.857→0.938** |
| 2 | Mediant Lead-gated: Lead-on-7 → III7; else iii | `candidates.ts`, `candidateRanker.ts` | Honey III7; Irish Rose iii kept |
| 3 | No sec-dom/passing under chromatic pillars at Basic | `candidates.ts` | Down Our Way **0.944→1.000** |
| 4 | Moderate cadence seeds only at phrase cadence/tag | `cadenceSeeds.ts` | Mid-phrase seed spam reduced |

**After rules (default Basic, no weight presets):**

| | Gold hwy | Gold strict | Holdout hwy |
| --- | ---: | ---: | ---: |
| Before | 1.000 | 0.827 | 0.929 |
| After | **1.000** | **0.841** | **0.949** |

Still soft: Nellie 0.891, Mill Stream 0.923, Roses of Morn 0.897, Dream 0.944 — cluster D / remaining chromatic density, not weight presets.

### Taste presets (Optimize UI)

| Taste | Intent |
| --- | --- |
| **Classic** (default) | Pillar-first mid-phrase; I6 / chromatic Mm7 prefers; CI gate |
| **Circle** | Mid-phrase sec-dom + strong cadence seeds |
| **Busy** | Freer passing (incl. V7-of-current); softer passing demotion |

Polecat eval / gold gate always uses Classic (`risk: 0`).

---

## Remaining gaps

- Gold highway still **1.000**; strict micro **0.841** (was 0.827).
- Holdout highway micro **0.949** (was 0.929). Promote candidates approaching gold: **90004**, **90008**, **90010** already at 1.000 hwy.
- Soft holdouts: 90002 / 90005 / 90007 / 90011 — next levers are denser IV7 / circle discipline and remaining chromatic approaches, not ranking JSON.
- Stop rule for gold highway: done.

---

## Non-goals (held)

No ML; no audio timing as Coach ticks; no TTBB voicing match; holdout polecats stay advisory (not Tag Studio gold) until explicitly promoted.
