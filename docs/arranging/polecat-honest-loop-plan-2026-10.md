# Polecat honest Coach improvement loop — 2026-10

**Next steps (strong/passing pivot + plan 1–5):** [coach-next-steps-2026-10.md](coach-next-steps-2026-10.md)

**Harness:** `scripts/arranging/polecatHonestScore.mjs`  
**Artifacts:** `work/polecat-honest-loop/` (`PASSLOG.md`, `*.json`)  
**Primary metric:** **timeHit** — Coach roman at each chart-stack midpoint (blown_pc key, Lead melody only, inferred pillars).  
Secondary: timeStrict, romanLcs.

## Scoreboard (micro over 12 polecats)

| Pass | timeHit | timeStrict | romanLcs | Keep? |
| --- | ---: | ---: | ---: | --- |
| baseline (pre-loop) | 0.154 | 0.142 | 0.230 | — |
| A Dom9 ban + VI7 Lead-gate | 0.169 | 0.154 | 0.233 | evolved |
| B triad + wide V-approach | 0.171 | 0.155 | 0.238 | **revert approach** (broke Classic mid-phrase) |
| B3 triad only | 0.169 | 0.154 | 0.233 | keep triad prefer |
| C pillar LT/V cues | 0.184 | 0.168 | 0.235 | **keep** |
| D half-measure pillars | 0.194 | 0.184 | 0.284 | superseded by J |
| E III7 demote sort | 0.191 | 0.178 | 0.285 | **revert** (broke tests) |
| F Dom9 only if Lead=9 | 0.191 | 0.181 | 0.283 | **keep** (Flinn-correct) |
| G IV pillar cues | 0.190 | 0.181 | 0.285 | **keep** |
| H adaptive span | 0.187 | 0.173 | 0.269 | **revert** |
| I II7→V force | 0.190 | 0.181 | 0.285 | **revert** (stole I) |
| J beat-level pillars | 0.213 | **0.202** | **0.316** | kept |
| K V function fw boost | 0.214 | 0.203 | 0.317 | **revert** (+0.001, gold CI break) |
| L arrival-tone weight | 0.200 | 0.189 | 0.304 | **revert** |
| M II boost + iii demote | 0.207 | 0.192 | 0.313 | **revert** (hurt Nellie) |
| N cadenceBias=strong (score-only) | 0.215 | 0.205 | 0.326 | skip (Sweetheart −0.02; leave Classic moderate) |
| **O merge same-root beat pillars** | **0.218** | **0.207** | **0.318** | **KEEP (new best)** |
| P merge + strong cadence | 0.218 | 0.208 | 0.322 | no gain over O |
| Q eighth-note pillars + merge | 0.245 | 0.240 | 0.347 | kept |
| R IV7 Lead 3/7 prefer | 0.245 | 0.240 | 0.347 | keep (neutral; theory) |
| S VI7 only Lead 3/7 | 0.245 | 0.240 | 0.347 | keep (neutral; less VI7 invent) |
| T maxPasses 14 | 0.245 | 0.240 | 0.347 | skip |
| U 16th pillars | 0.245 | 0.240 | 0.347 | skip (merge≡eighth) |
| V nearNextPillar≤3 | 0.245 | 0.240 | 0.347 | skip |
| W protect I from V (soft) | 0.245 | 0.240 | 0.347 | subsumed by X |
| X single-tone scale-degree home | 0.272 | 0.266 | 0.333 | kept |
| **Y 1–2 note arrival → I/IV/V** | **0.284** | **0.277** | **0.339** | **KEEP (final best)** |


**Net:** timeHit **0.154 → 0.284** (~+84% rel over ~2h) (+38% rel). Still far from “sounds like the chart,” but moving on an honest metric.

## Kept product changes

1. **Classic Dom9** only when Lead is the 9th (`candidates.ts`); adversarial test fixed (A under G, not D).
2. **V7 prefer** when top is bare V major; **I/IV triad** when Lead is 1 or 5.
3. **Pillar root cues** for V / I / II / IV / vi (`proposePillarAt.ts` `scoreRootsForNotes`).
4. **Eighth-note pillar inference** (`InferPillars.ts` `measureTicks: 240 (eighth + merge)`).
5. **Merge consecutive same-root beat pillars**
6. **1–2 note spans → I/IV/V home from (arrival) scale degree** (`proposeRootForSpan`). after infer (stable homes, keep change points).
7. Gold `baseline.json` refreshed (honest-primary; 90006 hwy 0.947).

## Rejected / learned

- Highway LCS + gold pillar roots = scoreboard gaming (honest was ~0.15 while hwy ~0.97).
- Wide “allow passing into V” broke Classic mid-phrase discipline for +0.002.
- Forcing II7 before V stole tonic homes.
- Adaptive half/whole span from density regressed micro.
- Ranker V fw bump broke gold 90003 for negligible honest gain.

## Remaining failure modes (best pass J)

- Pillar root hit only ~**0.34** (was 0.27) — wrong homes still dominate.
- 90007 Sweet Roses timeHit **0.14**; 90003 Sweet And Lovely **0.14**.
- Coach still invents VI7 / III7 / ii where charts want V7 / I.
- Next levers: better root propose (contour / cadence), optional user pillars, Mm7 vocabulary discipline — **not** more highway tuning.

## How to re-score

```bash
node scripts/arranging/polecatHonestScore.mjs --label <name> --save
```

## Loop closed

Stopped after ~2h (2026-10-09 ~01:55 EDT). Background 20m ticker killed.

**Final best:** timeHit **0.284** / timeStrict **0.277** / romanLcs **0.339**  
(from honest baseline 0.154 / 0.142 / 0.230)

Still not “sounds like the chart,” but the scoreboard is honest and the kept changes are product-real (inference density + melody→home priors + Dom9/IV7/VI7 Lead gates).
