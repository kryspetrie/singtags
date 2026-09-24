# Plan: Classic cadences in Detected + Coach (core feature)

Encode barbershop cadence patterns as a **shared domain module**, then wire them into (1) Detected / My Chords suggestions and (2) Coach ranking + teaching so cadence literacy is a first-class product feature—not a one-off Detected bias.

## Goal

When Lead melody implies a classic move, suggestions and Coach should prefer the textbook cadence and **explain why**. Cadence training is core Coach craft, alongside pillars / roles / voicing.

**Non-goals (v1):** inventing new harmonic language; auto-rewriting locked My Chords; forcing ♭II / backdoor as defaults.

---

## Cadence catalog (shared source of truth)

New module: `web/src/domain/arranging/cadences/`

| Id | Pattern | Trigger (melody / context) | Prefer | Demote |
|----|---------|----------------------------|--------|--------|
| `auth_v7_i` | V7 → I | Lead ^5→^1, or prev V7 + next tonic pillar | V7 then I | I / I7 on the ^5 |
| `lead_tone_v7` | V7 → I | Lead ^7→^1 | V7 (dom of I) | I, IV under ^7 |
| `circle_ii_v_i` | II7 → V7 → I | Descending-fifth highway into tonic / phrase end | II7 then V7 | random SCF / ♭VII mid-highway |
| `primary_dom7` | I7 → IV | Lead on ^1 with next ^4 / IV pillar ahead | I7 | plain I when IV is the next home |
| `circle_frag` | …↓5… | Root motion down P5 toward locked pillar | circle step | retrogression unless intentional |
| `plagal_iv_i` | IV → I | Phrase end / amen feel; Lead ^1 or ^6 on IV | IV (maj) | V7 when plagal is clearer |
| `tag_penult` | (often V7 / II7) → I | Last strong beat before final tonic | V7 or II7→V7 | early tonic land |
| `half_cad` | … → V | Mid-phrase stop on dominant | V / V7 | forced I |
| `light_bII` | ♭II7 → I | Optional color; only when melody supports | low weight | never top Detected by default |
| `backdoor` | ♭VII7 → I | Same — optional | low weight | never default home |

Each entry exposes:

- `id`, `label`, `shortTeach`, `glossaryIds`, `priority` (1 = core, 2 = common, 3 = color)
- `matchContext(ctx) → { hit, strength }` — pure, testable
- `boostCandidate(cand, ctx) → number` — score delta for ranking
- `teachWhy(ctx) → string` — one sentence for Why? / Coach tip

**Context bag** (same shape for Detected + Coach):

```ts
{
  tonality, mode,
  melodyMidi, nextMelodyMidi?, prevMelodyMidi?,
  prevRootPc?, prevNatureId?,
  nextPillarRoot?, pillarRoot?,
  phraseRole?: 'open' | 'mid' | 'cadence' | 'tag',
  lockedNeighbors?: { before?, after? }, // My Chords
}
```

Reuse existing helpers where possible: `degreeOf`, `isDominantOf`, `progressionAnalyze` kinds (`authentic`, `plagal`, `circle_fifth`, …), education glossary (`circle_fifths`, `secondary_dom`, tension/release copy).

---

## Architecture

```
                    ┌─────────────────────────┐
                    │  domain/cadences/*      │
                    │  match + boost + teach  │
                    └───────────┬─────────────┘
           ┌────────────────────┼────────────────────┐
           ▼                    ▼                    ▼
   impliedMelodyChord    candidateRanker      Coach UI / tips
   (Detected top-N)      + theoryRankBonuses  + education catalog
           │                    │                    │
           └──────── My Chords path / Polish ────────┘
```

One library, three consumers. No duplicated V7→I special cases scattered in UI.

---

## Phase 0 — Extract & catalog

1. Move today’s ^5→^1 V7 bias out of ad-hoc `scoreCandidate` into `cadences/auth_v7_i`.
2. Add unit tests: one fixture melody snippet per cadence id (Bonnie-style openings, II–V–I, I7→IV, plagal close).
3. Wire education: glossary + notation examples already exist for circle / V7–I; add missing `cadence_*` lesson ids and link from `GUIDED_STEPS` Chords / Check.

**Exit:** all cadence matchers green in isolation; Detected behavior unchanged except via the extracted matcher.

---

## Phase 1 — Detected / suggested chords

**File:** `impliedMelodyChord.ts` (+ callers that pass `nextMelodyMidi`).

1. Score = home/triad bias **plus** `sum(boostCandidate)` for priority-1/2 cadences.
2. Pass richer context when available: next Lead onset, locked sketch neighbor before/after span, phrase-end heuristic (last strong span in measure / before rest).
3. Confidence / roman stay as today; optionally attach `cadenceHint?: { id, label }` on `ImpliedMelodyChord` for strip tooltips (“V7→I opening”).
4. Keep priority-3 (♭II, backdoor) **out** of Detected top pick unless score gap is huge (or user pref later).

**Exit:** Bonnie ^5→^1 still V7; ^7→^1 prefers V7; I under ^1 still triad unless I7→IV context; odd IV(add9)/♭II not top Detected.

---

## Phase 2 — Coach ranking (core)

**Files:** `candidateRanker.ts`, `rankingWeights.ts`, `theoryScores.ts` / `chordAutocomplete.ts`, Why? factor list.

1. New weight: `cadenceFit` (separate from coarse `tensionRelease`) so Why? can say “Circle II7→V7→I” not just “tension.”
2. When ranking a moment, build cadence context from:
   - prev applied / locked stack
   - next pillar / next Locked My Chord
   - Lead degree now + next strong note
3. Boost candidates that complete an in-progress pattern (e.g. after II7, prefer V7; after V7 toward I pillar, prefer I triad).
4. Path-level (optional v1.1): when auto-harmonize / strengthen walks a phrase, add a small Viterbi-style cadence continuity bonus (same spirit as `optimizeSketchHearPath`) so local greedy picks do not break II–V–I.
5. Default `preferScf` stays off for homes; cadence boosts must not re-open the “everything is a seventh” failure mode—homes win unless a cadence matcher fires.

**Exit:** Coach top pick on classic moments matches catalog; `homeBiasRank` + new `cadenceRank.test.ts` cover openings, II–V–I, I7→IV; Why? shows `cadenceFit` factor.

---

## Phase 3 — Coach as teacher (product surface)

Cadence is not only a ranker knob—it is a **Coach feature**.

| Surface | Change |
|---------|--------|
| Guided **Chords** step | Tip + glossary: classic cadences; buttonTip mentions V7→I, II7→V7→I, I7→IV |
| Guided **Check** / Review | Lint-style info when a locked span *breaks* an obvious cadence (e.g. I under ^5→^1 with V available): soft warn + “Try V7” action |
| **Why?** panel | `cadenceFit` factor + short teach sentence from catalog |
| Coach dock tip | When focus moment matches a cadence, tip title/body from `teachWhy` (override generic step tip) |
| Education catalog | Lesson “Classic barbershop cadences” linking notation examples (`ex-circle-fifths`, V7–I) |
| Polish | Unchanged path search; optionally prefer inversions that support authentic resolution (already partly in `resolutionScore`) |

**Exit:** user can learn *why* Coach suggested V7 without leaving the dock; Check can nudge broken cadences without auto-forcing.

---

## Phase 4 — Path continuity & prefs (follow-on)

1. Phrase-role heuristic (`open` / `cadence` / `tag`) from rests + measure position + final tonic.
2. User pref: “Cadence bias” = Strong (default) / Moderate / Off (for experimental reharmonization).
3. Optional Detected tooltip + Coach Alternates badge: “Cadence: II7→V7→I”.
4. Align `progressionAnalyze` teaching ids with cadence catalog ids so Review narrative and Coach tips share language.

---

## Priority order for implementation

1. **P0:** Shared catalog + extract existing V7→I; add `lead_tone_v7`, `circle_ii_v_i`, `primary_dom7`.
2. **P1:** Detected scoring via catalog; attach optional `cadenceHint`.
3. **P2:** Coach `cadenceFit` weight + Why? + tests.
4. **P3:** Coach tips / Check nudge / education lesson.
5. **P4:** Phrase role, prefs, path continuity bonus.

---

## Test plan

- Unit: each cadence `matchContext` / `boostCandidate` with fixed MIDI + tonality fixtures.
- Detected: `impliedMelodyChord.test` — ^5→^1, ^7→^1, I vs I7→IV, no ♭II top.
- Coach: `cadenceRank.test.ts` — after II7 prefer V7; after V7 prefer I; home triad when no cadence.
- Regression: `homeBiasRank.test`, Bonnie-flavored snippets, `exhaustiveMisc` seventh weights.
- Manual: Tag Studio on My Bonnie — openings V7→I; mid-phrase circle; Coach Why? names the cadence; Check soft-warn if user locks I under ^5→^1.

---

## Risks & guardrails

- **Over-fitting:** too many boosts → every chord is V7. Cap: only priority-1 fires hard; priority-2 soft; priority-3 never Detected-default.
- **Locked My Chords:** cadence boosts respect locked neighbors (complete *into* / *out of* locks); never overwrite locks.
- **SCF / color:** cadenceFit must not resurrect global sevenths-first; keep home triad bias when no matcher hits.
- **Duplication:** delete one-off deltas in `impliedMelodyChord` once catalog owns them.

---

## Implementation status (2026-09-24)

Shipped P0–P4:

- `domain/arranging/cadences/` catalog + score + phraseRole + prefs
- Detected (`impliedMelodyChord`) uses catalog; optional `cadenceHint`
- Coach `cadenceFit` weight + Why? factor + `cadenceRank.test.ts`
- Guided Chords/Check copy, education lesson/glossary, `cadence-miss` lint
- Coach dock tip via `cadenceHintForCoachMoment`
- `loadCadenceBias` / `saveCadenceBias` (Strong default) + **Coach ⚙ Cadence bias UI**
- **Beam-search** `autoHarmonizeMelody` (width 3 + 1-step lookahead)
- **Detected tooltip** cadence label; **Coach best-row badge**
- **progressionAnalyze** authentic/plagal → `classic_cadences`; II7–V–I pattern kind

