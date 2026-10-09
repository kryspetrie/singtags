# Polecat Coach — Next Path + Larger Leaps — 2026-10

**Parent:** [coach-next-steps-2026-10.md](coach-next-steps-2026-10.md)  
**Accuracy loop:** [polecat-iterative-accuracy-plan-2026-10.md](polecat-iterative-accuracy-plan-2026-10.md) (do-not-retry registry)  
**Research basis:** [polecat-alt-methods-2026-10.md](polecat-alt-methods-2026-10.md)  
**Working keep:** `m2b-keep` — full pmn **0.498**, time **0.296**, **pmnConf 0.829** @cov **0.063** (thr 0.75)

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
- [ ] Human listen pass signed on four tags (manual)

---

## Part B — Larger Leaps (investigate in parallel)

Status: **research / prototype**. None of these are Auto CI gates until a keep beats `m2b-keep` without winner regress.

| ID | Leap | Spike / artifact | Decision gate |
| --- | --- | --- | --- |
| **C1** | Two-hypothesis Auto (top-2 homes) | `rankStrongHomeAlternatives` + unit test; UI later | Chosen@tap ≥ full pmn +0.05 on oracle sim |
| **C2** | Teacher–student distill | Inventory Classic Tags / polecat labels; no runtime gold | Train LOO ≥ 0.55 on ≥30 songs before wire |
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

- 12 polecats: gold-neighbor LOO ≤ ~0.47 (alt-methods) — **not** enough for nets.
- Inventory (`corpusLeapInventory.mjs`, 2026-10-09): **12** songs, ~849 Lead notes (studio often all-pmn), **793** sketch spans, **12/12** `pitch_summary.txt` (C4 candidate), **no** Classic Tags tree on disk. Honest Strong ticks ≈ **554**.
- Distill only offline features (sd, prev home, segFit, phraseEdge) → frozen table; runtime never reads chart.
- **Oracle Guided bound** (`guidedOracleUpperBound.mjs` on m2b): Auto@lock **0.829**; if every amber were gold-locked → pmn ≈ **0.989** (+0.49 vs full Auto). Product path can nearly clear stretch **if** users lock; Auto alone cannot.

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
| **A Ship** | Guided UX, R4, listen, oracle bound | Daily until checklist green |
| **B Leaps** | C1 spike, C6 decodeUnderLocks, corpus inventory | Same week, no Auto rule churn |
| **Merge rule** | Leap code behind exports/scripts; ship Path A without waiting for ≥0.55 Auto | — |

---

## Links

- Do-not-retry: [polecat-iterative-accuracy-plan-2026-10.md](polecat-iterative-accuracy-plan-2026-10.md)  
- Phrase copy (M2p): same file §M2p  
- Honest harness: `node scripts/arranging/polecatHonestScore.mjs --label NAME --save`  
- Oracle bound: `node scripts/arranging/guidedOracleUpperBound.mjs`  
- Corpus inventory: `node scripts/arranging/corpusLeapInventory.mjs`  
