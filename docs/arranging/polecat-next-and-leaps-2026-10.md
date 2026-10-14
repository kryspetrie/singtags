# Polecat Coach — Next Path + Larger Leaps — 2026-10

**Parent:** [coach-next-steps-2026-10.md](coach-next-steps-2026-10.md)  
**Accuracy loop:** [polecat-iterative-accuracy-plan-2026-10.md](polecat-iterative-accuracy-plan-2026-10.md) (do-not-retry registry)  
**Research basis:** [polecat-alt-methods-2026-10.md](polecat-alt-methods-2026-10.md)  
**Working keep:** `c2-add-keep` — full pmn **0.515**, time **0.307**, **pmnConf 0.717** @cov **0.083** (thr 0.75) · prior `m2b-keep` 0.498 / 0.296 / conf 0.829@0.063

This doc is the executable contract for (A) shipping the product path and (B) investigating larger leaps **in parallel** — without re-entering Auto hand-rule churn.

---

## Part A — Next Path (shipping now)

### Contract

| Mode | Behavior | Metric |
| --- | --- | --- |
| **Auto** | Lead + key + Strong/Passing → homes; **auto-lock** when `confidence ≥ 0.75` | Full pmn advisory (~0.50); CI floor R4 |
| **Guided** | Amber (`needsReview`) homes: ◆ lock / change root | Listen checklist; optional oracle upper bound |
| **Not required** | Full pillar map confirm before Path Optimize | — |

### Ship checklist

1. **R4 floor** — `honestAutoFloor.json` reflects achievable full-micro (~0.48 pmn / ~0.28 time), not stretch 0.55/0.5. Stretch stays documented, not CI.
2. **Guided UX** — Coach lane amber for unconfirmed; landing copy; **Next review** jumps to next amber; progress shows `review N`.
3. **Listen checklist** (human ear):
   - 90001 My Wild Irish Rose  
   - 90006 Let Me Call You Sweetheart  
   - 90008 / Sweet Roses–class if available  
   - 90011 Down By The Old Mill Stream  
   Pass = recognizable highway (II→V→I / home cadences), not chart-identical.
4. **Oracle upper bound** (offline): `node scripts/arranging/guidedOracleUpperBound.mjs` — if every low-conf Strong were gold-locked, what pmn/time? Caps Guided ambition.
5. **M2p (follow-on)** — user phrase spans + “same family” copy; see §M2p in iterative plan. Do not block A on M2p.

### Explicit non-goals for Path A

- New Auto ^n→home rules, Co5 apply gates, minorizing segment tones, half-bar promote for pmn (see do-not-retry).

### Done when

- [x] Confidence → pillar `confirmed` / amber lane  
- [x] R4 floor checked in  
- [x] Next-review + review count in Coach dock  
- [x] Listen checklist written  
- [x] Oracle upper-bound script runnable  
- [x] Human listen signed (2026-10-09, `c2-add-keep`): **conditional pass** — “not good but maybe okay / kinda bad.” Better luck cycling **Detected chord alts** than Auto Full. **Revoice** rarely moves after Full (bad inversions stick); wants target register + spread/strategy and a real range. Not a chart-identical fail; not a proud ship either. Next product bets: Detected-alts-first Guided, revoice scope+register controls — not more Auto root hand rules.

---

## Part B — Larger Leaps (investigate in parallel)

Status: **research / prototype**. None of these are Auto CI gates until a keep beats `m2b-keep` without winner regress.

| ID | Leap | Spike / artifact | Decision gate |
| --- | --- | --- | --- |
| **C1** | Two-hypothesis Auto (top-2 homes) | `rankStrongHomeAlternatives` + unit test; UI later | Chosen@tap ≥ full pmn +0.05 on oracle sim |
| **C2** | Teacher–student distill | Classic 125 stacks + polecat; `--blend-keep` m2b | **Kept** `c2-add-keep` pmn 0.515; raw swap do-not-ship |
| **C3** | Joint segment+duration | Spec only until C2 corpus; half-bar already failed as promote | timeHit ↑ ≥0.05 on grid decode spike |
| **C4** | Audio-informed roots | Note pitch_summary / learning tracks availability | Align error &lt; 1 beat before use as teacher |
| **C5** | Ensemble-aware emission | Post-Harmonize PC vector sketch | Only after stacks exist; not Tag-first Auto |
| **C6** | Constraint solver (locks → Co5 fill) | `decodeUnderLocks` spike over Co5 digraph | With 2–3 gold locks/tag, pmn ≥ 0.70 |
| **C7** | Metric reset | This doc + R4 floor | Stakeholders accept listen+conf as ship bar |
| **B / M4b** | Corpus growth | `scripts/arranging/corpusLeapInventory.mjs` | Count honest-labeled Strongs available |

### Investigation notes (living)

#### C1 — Two-hypothesis

- Emission already scores `{I,II,IV,V,vi}`; expose **top-2** with margins.
- Oracle: if user always picks the gold when it is in top-2, hit rate = “coverage of gold in top-2.”
- Spike function: `rankStrongHomeAlternatives` in `proposeStrongRoots.ts`.

#### C2 / M4b — Corpus + distill

- Classic Tags live under `library/` (125 IDs in `work/classic_tag_ids.json`); **125/125** have part-left `pitch_stacks.json` + `pitch_studio.json` (detect skip).
- Fit `--corpus both --loo`: LOO **0.573** (2292 samples / 132 tags) — clears ≥0.55 / ≥30 songs.
- **Raw table swap regresses** Auto (−0.035 pmn). **Ship form:** additive blend — m2b prior keys win on conflict; add classic-only keys; keep m2b transitions (`--blend-keep` + `--keep-transitions`).
- Keep `c2-add-keep`: pmn **0.515** (+0.017), time **0.307** (+0.011); 90011 **0.500**; no winner_reg. Conf precision down (0.829→0.717) as coverage rises.
- Reproduce: see Cycle C2 in iterative plan. Artifacts: `work/polecat-honest-loop/strongRootPriors.m2b-keep.ts`, `c2-add-keep.json`.
- **Oracle Guided bound** (`guidedOracleUpperBound.mjs` on m2b): Auto@lock **0.829**; if every amber were gold-locked → pmn ≈ **0.989** (+0.49 vs full Auto). Re-run on `c2-add-keep` if lock UX metrics matter.

#### C6 — Locks → Co5 fill

- Reuse `strongRootCo5` with **fixed degrees** on locked Strongs; beam only free slots.
- Natural fit for Guided + M2p phrase copy.

#### C3 / C4 / C5

- C3: larger rewrite; defer until corpus or C6 proves constraint decoding.
- C4: `pitch_summary.txt` exists under some `polecats/` dirs — alignment audit before teacher use.
- C5: Path Optimize already has stacks; emission from voicing is a **later** mode.

---

## Parallel workstream schedule

| Track | Owner focus | Cadence |
| --- | --- | --- |
| **A Ship** | Listen signed (conditional); polish Guided around **Detected alts** | Done enough to stop Auto churn |
| **B Leaps** | C1 top-2 ↔ Detected alts UX; **revoice register/spread + sticky inversion fix**; C6 underLocks | Next product week |
| **Merge rule** | Leap code behind exports/scripts; ship Path A without waiting for ≥0.55 Auto | — |

### Listen follow-ups (from 2026-10-09)

1. **Detected chord alts feel more useful than Auto Full** — lean Guided / C1 toward cycling ranked homes at the moment, not another root-table grind.
2. **Revoice after Full often no-ops** — seeds from Full become the only accepted close voicing (`preferClose` + span caps keep the seed). Needs: explicit **target octave / spread strategy**, and willingness to move inversions when the user asks (not only when score improves continuity).
3. **Range** — Optimize already scopes to roll selection when present; discoverability is weak, and revoice still runs one whole-scope Viterbi over moments (not a user-facing “revoice this phrase to BAM”).
4. **Pitch extract / Detect quality** — polecat part-left detection misses chords and invents intermediaries; hurts listen + Auto. Clean **MusicXML** planned later as ground truth (C4/corpus). Until then: Delete on Detected absorbs into neighbor (locked Sketch) so intermediaries do not refill.
5. **Ensemble Voicing** (shipped) — TTBB/SATB/SSAA (+ custom) part bands, pitch center, max outer span; Coach Optimize walk inversions (Hear/Apply/Shuffle) + Path Optimize Revoice/Full use the same profile; Run again explores.

---

## Links

- Do-not-retry: [polecat-iterative-accuracy-plan-2026-10.md](polecat-iterative-accuracy-plan-2026-10.md)  
- Phrase copy (M2p): same file §M2p  
- Honest harness: `node scripts/arranging/polecatHonestScore.mjs --label NAME --save`  
- Oracle bound: `node scripts/arranging/guidedOracleUpperBound.mjs`  
- Corpus inventory: `node scripts/arranging/corpusLeapInventory.mjs`  
