# Plan: Classic cadences in Detected + Coach (core feature)

Encode barbershop cadence patterns as a **shared domain module**, then wire them into (1) Detected / My Chords suggestions and (2) Coach ranking + teaching so cadence literacy is a first-class product feature—not a one-off Detected bias.

**Follow-on:** Detected interest levels (Basic / Mild / Bold), including held-note tension→resolve — see [detected-interest-plan.md](./detected-interest-plan.md).

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

---

# Follow-on: Cadence plans + Keychange helper

Two related product surfaces that build on the shipped catalog and on existing
`suggestKeyChanges` / hybrids (domain already computes many paths; UI + measure
budget + step-apply + “post” paths are the gap).

---

## Part A — Cadence plans (multi-moment suggest)

### Goal

Detect cadence **opportunities** from Lead motion + surrounding Sketch/stacks,
then offer an applyable **plan** (1–3 moments), not only a ranking boost.

### API sketch

```ts
suggestCadencesForPhrase({
  moments, tonality, mode, stacks, sketchSpans, pillars, bias, fromIndex?, limit?
}): CadenceSuggestion[]
// steps[], teach, evidence, conflicts[], strength
```

Reuse `CADENCE_CATALOG.matchContext`; add `materializeCadenceSteps(def, ctx, …)`.
Apply one step or whole plan; never silently overwrite locked Sketch.

### UI

Coach Chords: **Cadence plans** list (hold / ✓ like chords). Optional Coach-lane
cue on plan starts. Check: extend `cadence-miss` to cite the plan.

### Slices

1. Domain materialize + suggest + tests  
2. Application apply  
3. Coach UI  
4. Check link + lane cue  

---

## Part B — Keychange helper

### Goal

Given **from key → to key** and a **measure budget** (with or without melody in
that span), propose barbershop-style chord series the user can **hear and apply
one by one**. Prefer classic lifts and circle highways; support **hybrids**
(two styles spliced) and **post** modulations (one voice holds while others move).

Melody policy: **mostly ignore** for path choice; when present, **soft-score**
paths so Lead motion stays small (common-tone / step under Lead preferred).

### What already exists (do not reinvent)

| Module | Role |
|--------|------|
| `domain/arranging/keyChange.ts` | `suggestKeyChanges` — hitch, V7→I, I7-as-V, VV–V–I, chromatic lift ±1/±2, tertian ±3/±4, pivots, circle walk |
| `keyChangeHybrids.ts` | Mid-style hybrids + `combineKeyChangePaths` |
| `keyChangeForm.ts` | `assessKeyChangeFormImpact` (measure/tick preservation) |
| `application/arranging/KeyChange.ts` | `suggestModulation` / `Grouped` / `combineModulationPaths` |
| Knowledge | [11](../../docs/arranging-knowledge/11-intros-tags-medleys.md) lifts; [21](../../docs/arranging-knowledge/21-circle-of-fifths.md) highway; [06](../../docs/arranging-knowledge/06-approach-three-rules.md) R1–R3 |

**Gap:** no Tag Studio / Coach UI; no measure-budget packing onto ticks; no
step-through Apply; no first-class **post** (held common-tone) generator;
melody soft-score not wired.

### Product UX

1. **Entry:** Coach Polish / Labs, or Mods “Key change” near playhead.  
2. **Inputs:** from/to tonality (+ mode), **measure count** (or tick span),
   optional melody-in-span, prefer-up, include hybrids / posts / color.  
3. **Results:** ranked paths grouped by type (see catalog below). Each path =
   ordered chords with Roman (from/to), teach blurb, length vs budget fit.  
4. **Preview:** hold step = hear voicing; path preview = hear series.  
5. **Apply:** insert Sketch (and/or stacks) into the span — **one chord at a
   time** or “Apply next”; write key marker at arrival; preserve measure count
   (`assessKeyChangeFormImpact`).  
6. **Combinations:** show hybrid paths (style A then style B) and allow
   “combine these two” when lengths fit the budget.

### Path-type catalog (v1 product names)

Map UI labels → existing `templateId` / character where possible; add missing
generators in investigation.

| UI type | Theory / barbershop note | Domain today |
|---------|--------------------------|--------------|
| **New-key II–V–I** | II7→V7→I in destination | `VV-V-I` / extend with true ii7 |
| **Half-step up (chromatic lift)** | Old I7 → new V7 → new I | `lift-up` (±1) |
| **Whole-step lift** | Same family ±2 | `lift-up` |
| **I7-as-V (subdominant hitch)** | Old I becomes V7 of new (e.g. C→F) | `I7-as-V` |
| **Circle walk (all intermediaries)** | Descending-fifth BS7 chain to new I | `circle-walk` / extended |
| **Direct V7→I** | Plant new V7 then I | `V7-I` |
| **Hitch** | Slam new I (teach, don’t default) | `hitch` |
| **Tertian / m3–M3 connector** | Common-tone / third-flavored | `tertian` |
| **Tritone-sub approach** | ♭II7 → new I | `subV-I` |
| **Pivot chord** | Shared diatonic identity | pivot paths |
| **Hybrid (A⊕B)** | e.g. circle stub then chromatic lift | `combineKeyChangePaths` / hybrids |
| **Post modulation** | One PC held; other voices move to new key | **new** |

Stick to barbershop: BS7 fuel, circle preference, contest vocabulary, form
length preserved ([11] practices). Pop “truck-driver” half-step is allowed as
**chromatic lift** with preparation (old I7 → new V7), not naked hitch-as-default.

### Measure budget packing

```ts
packModulationIntoSpan(path, {
  startTick, endTick, ppq, timeSignature,
  melodyNotes?, // optional soft constraint
}): PackedModulationStep[]
// each: { startTick, endTick, rootPc, natureId, romanTo, role }
```

- Divide span into `path.length` slots (prefer downbeat alignment).  
- If budget **shorter** than path: offer trimmed variants (drop optional
  connectors) or reject with “needs N measures.”  
- If budget **longer**: hold arrival I, or pad with circle echo / swipe — never
  invent random roots.  
- Melody soft-score: for each step, prefer roots where Lead PC ∈ chord tones;
  penalize Lead leaps > M2 when re-voicing; allow Lead to **post** (same MIDI)
  across steps when building post paths.

### Post keychanges (first-class)

**Definition (product):** one part (usually Lead, sometimes a harmony common
tone) **holds a pitch** through most of the lift while TBB (or other voices)
move through BS7s until the new key locks.

Investigation sources (style):

- Corpus [11] key lifts; [21] pivot / counterpart holding; [07] common-tone VL.  
- Lewis *Breaking the Circle*: pivot notes / “post on” tritone while others
  shift; G7→E7 shared tones into secondary-dominant tonicization.  
- Tag scholarship: Lead **post** as held tone while harmony changes under it
  (already modeled as `heldLead` harmonic moments).  
- Classical common-tone modulation (exposed held tone; other voices redefine
  the chord) — adapted to BS7 vocabulary.

Generator sketch:

```ts
suggestPostKeyChanges({
  fromTonality, toTonality, holdPc?, // default: Lead PC at span start, or shared tone
  measureBudget, preferVoice: 'lead' | 'any',
}): ModulationPath[] // character: 'smooth', templateId: 'post-*'
```

1. Choose `holdPc` ∈ old chord ∩ useful in new key (or fixed Lead).  
2. Enumerate short BS7 chains to new V7→I where **every step contains holdPc**.  
3. Rank by: length fit, circle-forward motion, few non-hold voice leaps,
   arrival clarity (land on new I with hold as chord tone).  
4. UI: show held pitch + moving parts; Apply still step-by-step.

### Hybrid / combination search

Already have `combineKeyChangePaths` + built-in hybrids. Product needs:

1. Enumerate pairs of **compatible** templates whose combined length ≤ budget.  
2. Score: style contrast (smooth→abrupt OK), circle coherence, melody soft-score.  
3. Cap iterations (beam width / limit) — “lots of calculations” but bounded.  
4. UI label: e.g. “Circle stub ⊕ half-step lift (4 chords, 2 measures).”

### Architecture

```
  UI (Coach / Mods keychange panel)
           │
           ▼
  application/KeyChangeApply.ts     ← NEW: pack + apply steps + key marker
           │
           ├─ suggestKeyChanges / hybrids     (existing)
           ├─ suggestPostKeyChanges           (NEW)
           ├─ packModulationIntoSpan          (NEW)
           └─ melodySoftScore(path, notes)    (NEW)
           │
           ▼
  Tag Studio Sketch spans + keyMap marker + optional stacks
```

Share teach patterns with Cadence plans (hold / ✓ / Why?). Cadence bias Off
does **not** disable keychange helper (different feature); optional “strict
circle” filter.

---

## Investigatory steps (do before / during build)

Track findings in this doc or a short `keychange-investigation.md` appendix.

### I1 — Corpus pass (OCR / knowledge)

- [ ] Re-read [11] key lifts table; extract every pedagogical plant (C→D♭, D, F, E).  
- [ ] [21] distance / springboard / counterpart-hold — list legal “held PC” pairs.  
- [ ] [06] R1–R3 — what root motions are illegal mid-lift.  
- [ ] [14] Prietto / BAM excerpts on key lifts & medleys (if not fully in 11).  
- [ ] Szabo [13] secondary-dominant labeling for Romans in UI.  
- [ ] Confirm OCR PDFs in repo root (`Intro to Arranging…`, `acappella.pdf`, etc.)
      for any modulation examples not already distilled into knowledge/.

### I2 — Web / external style (barbershop-weighted)

- [x] Lewis *Breaking the Circle* — tritone sub, pivot/post-on tones, tonicization vs modulation.  
- [x] Pop truck-driver / pump-up — note as **non-default**; map to prepared chromatic lift.  
- [x] Common-tone modulation (classical) — adapt hold-tone definition for posts.  
- [ ] Tag schema literature — Lead post under changing harmony (cadential tags).  
- [ ] Sweet Adelines / BHS arranging notes on key lifts (contest vs show).  
- [ ] Catalog 8–12 real chart examples (title + bars): half-step lift, I7-as-V,
      full circle walk, post-under-Lead — golden fixtures for tests.

### I3 — Domain inventory vs desired types

- [ ] Matrix: UI type × `templateId` × covered? (fill gaps: true **ii7–V7–I**,
      full intermediary circle for arbitrary interval, post-*).  
- [ ] Measure how `maxLength` / `minLength` interact with measure budget.  
- [ ] Hybrid explosion: measure path counts for C→D♭, C→E, C→F♯; set beam caps.  
- [ ] Decide Romans: show arrival-key Romans for apply list (arranger mental model).

### I4 — Melody & post experiments

- [ ] Fixture: empty span, N measures — packing only.  
- [ ] Fixture: static Lead pitch through span — post generator must win.  
- [ ] Fixture: stepwise Lead — soft-score prefers paths containing Lead PCs.  
- [ ] Fixture: Leap-heavy Lead — still offer paths; warn “melody ignored for fit.”  
- [ ] Voice-lead cost: after packing, run existing VL / common-tone scores on
      realized TTBB (optional v1.1).

### I5 — Form & product rules

- [ ] Enforce `assessKeyChangeFormImpact` before Apply.  
- [ ] Section-boundary heuristic: prefer span starting on measure barline.  
- [ ] Hitch default rank stays worse than prepared lifts.  
- [ ] Contest profile: filter natures outside SAI-11 / BHS-extended.  
- [ ] Undo: single Apply step = one undo unit.

### I6 — UX investigation

- [ ] Wireframe: path list + step chips + Apply next + Hear path.  
- [ ] Where does it live? (Coach Polish vs Mods vs both.)  
- [ ] How key marker + Sketch preview interact with Coach soft preview.  
- [ ] Teach strip per template (glossary: circle_fifths, secondary_dom, counterpart).

---

## Priority order (follow-on)

1. **K0:** Investigation I1–I3 write-up + gap matrix (no UI yet).  
2. **K1:** `packModulationIntoSpan` + Apply-one-step into Sketch/key marker.  
3. **K2:** Coach/Mods Keychange panel — list existing `suggestKeyChanges` paths.  
4. **K3:** Melody soft-score + budget trim/pad.  
5. **K4:** `suggestPostKeyChanges` + UI “Post (held …)”.  
6. **K5:** Hybrid picker (combine two types) with beam caps.  
7. **C1–C3:** Cadence plans (Part A) can ship in parallel after K0.

---

## Risks & guardrails (keychange)

- **Combinatorial blow-up:** hard `limit`, beam width, max hybrid pairings.  
- **Form damage:** never Apply if measure/tick impact fails.  
- **Style drift:** circle + BS7 first; hitch/truck-driver never silent default.  
- **Melody fights path:** soft-score only; user can still Apply; show warning.  
- **Post without ring:** held tone must be chord tone every step or path is invalid.  
- **Duplicate systems:** UI must call `suggestKeyChanges` / posts — no third catalog.

---

## Success criteria

- User sets C→D♭, 2 measures, no melody → sees chromatic lift + alternatives;
  can Apply chord-by-chord; key marker lands on arrival.  
- User sets C→F, 1–2 measures → I7-as-V offered near top.  
- User sets long budget → full circle walk available; short budget → trimmed or
  “needs N measures.”  
- Hybrid: e.g. short circle ⊕ lift, labeled and applyable.  
- Post: held Lead PC through steps; TBB moves; lands in new key.  
- Cadence plans (Part A): ^5→^1 empty moment → V7→I plan with teach + Apply.

---

# Phased implementation plan (execute in order)

Shared rules for every phase:
- Domain stays pure (no Vue, no stores). Application owns Apply / Sketch patches.
- Reuse `CADENCE_CATALOG` and `suggestKeyChanges` — no parallel catalogs.
- Tests ship with each phase (Vitest); UI phases add component smoke where cheap.
- Never overwrite **locked** Sketch without an explicit user confirm path (later UI).

Legend: **C** = cadence plans · **K** = keychange helper.

---

## Phase 0 — Plan freeze + fixtures (docs only)

**Deliverable:** this section; golden fixture table below.

| Fixture id | Input | Expect |
|------------|-------|--------|
| `cad-auth-open` | C major, Lead G→C (^5→^1), empty Sketch | Plan `auth_v7_i`: V7 then I |
| `cad-circle-start` | Lead D→G (^2→^5) | Plan `circle_ii_v_i`: II7→V7→I |
| `cad-i7-iv` | Lead C→F (^1→^4) | Plan `primary_dom7`: I7→IV |
| `kc-lift-db` | C→D♭, 2 measures @480ppq 4/4 | Pack chromatic lift into span; form OK |
| `kc-i7-f` | C→F, 1–2 measures | I7-as-V near top of suggest |
| `kc-short-budget` | Long circle path into 1 measure | Fail or trim with `neededMeasures` |

**Exit:** fixtures named in tests as they land.

---

## Phase C1 — Domain: materialize + suggest cadence plans

**Files**
- `domain/arranging/cadences/planTypes.ts` — DTOs
- `domain/arranging/cadences/materialize.ts` — `materializeCadenceSteps(def, ctx)`
- `domain/arranging/cadences/suggestPlans.ts` — `suggestCadencesForPhrase(…)`
- `domain/arranging/cadences/suggestPlans.test.ts`
- Export via `cadences/index.ts`

**API**
```ts
suggestCadencesForPhrase({
  moments, // { startTick, endTick, melodyMidi }[]
  tonality, mode,
  sketchSpans?, // { startTick, endTick, rootPc, natureId|quality, locked? }[]
  pillars?, bias?, fromIndex?, limit?
}): CadenceSuggestion[]
```

**Behavior**
1. For each moment (optionally from `fromIndex`), build `CadenceContext` (neighbors from melody + locked Sketch).
2. Run `matchContext` on catalog (bias=`off` → empty; `moderate` skip priority 3; `strong` all).
3. Materialize 1–3 steps (rootPc + natureId + roman label + momentOffset).
4. Record `conflicts[]` when a locked Sketch root disagrees with a step.
5. Sort by priority then strength; apply `limit`.

**Tests**
- `cad-auth-open`, `cad-circle-start`, `cad-i7-iv` goldens.
- Bias off → [].
- Locked conflicting Sketch → suggestion still returned with conflict string.
- Dedup: same cadenceId+startIndex once.
- Limit respected.

**Exit:** pure domain green; no UI yet.

---

## Phase C2 — Application: apply cadence plan steps

**Files**
- `application/arranging/CadencePlans.ts` — suggest façade + `applyCadencePlanStep` / `planToSketchPatches`
- `application/arranging/CadencePlans.test.ts`

**Behavior**
- Map plan steps → Sketch span patches (`natureToSketchQuality`, ticks from moment windows).
- Skip / flag locked spans; never mutate project here — return patches for the store.

**Tests**
- V7→I patches two spans covering moment ticks.
- Locked conflict → patch omitted + reason.
- Idempotent nature/root mapping.

**Exit:** store-agnostic Apply DTO ready for Coach.

---

## Phase C3 — Coach UI: Cadence plans list

**Files**
- `ArrangingCoachCadencePlans.vue` (or section in SuggestPanel)
- Wire in `useArrangingCoachDock` / Dock Choose tab
- Hold-to-hear step; ✓ Apply step / Apply plan

**Tests**
- Dock/composable unit: given moments → suggestions non-empty for auth fixture.
- Optional Playwright later.

**Exit:** user can see alternate plans and apply without leaving Chords.

---

## Phase C4 — Check + lane cue

- Extend `cadence-miss` message to cite top plan label when present.
- Optional Coach-lane marker at plan start tick.
- Tests: lint message includes plan id/label.

---

## Phase K1 — Domain: pack modulation into tick span

**Files**
- `domain/arranging/keyChangePack.ts` — `packModulationIntoSpan`
- `domain/arranging/keyChangePack.test.ts`

**API**
```ts
packModulationIntoSpan(path, {
  startTick, endTick, ppq,
  numerator?, denominator?, // default 4/4
}): PackResult
// ok → PackedModulationStep[]; fail → reason + neededMeasures?
```

**Behavior**
- Require `endTick > startTick`; n = path.steps.length ≥ 1.
- Split span into n contiguous slots (prefer equal beat-aligned widths).
- If span shorter than n beats (1 beat per chord minimum): `ok:false` + `neededMeasures`.
- Pad: if span much longer than n measures, extend **final** arrival chord only (hold I).

**Tests**
- `kc-lift-db` packing: 2 chords → two half-span slots; contiguous; cover full span.
- Short budget fail for long circle.
- Same-key single step fills whole span.
- Form: packed tick length equals input span (`assessKeyChangeFormImpact` before/after equal).

**Exit:** packing green.

---

## Phase K2 — Application: KeyChangeApply façade

**Files**
- `application/arranging/KeyChangeApply.ts` — suggest + pack + `modulationToSketchPatches` + form gate
- `KeyChangeApply.test.ts`
- Re-export from `application/arranging/index.ts`

**Tests**
- C→F includes I7-as-V; pack into 2 measures → patches.
- Form impact fail blocks Apply DTO (`ok:false`).

**Exit:** ready for UI without Vue.

---

## Phase K3 — Melody soft-score + trim/pad variants

- `melodySoftScore(path, notes)` — Lead PC ∈ chord tones preferred.
- Suggest trimmed path variants when budget short (drop optional connectors).
- Tests: static Lead PC boosts post-capable / common-tone paths.

---

## Phase K4 — Post keychanges

- `suggestPostKeyChanges` — every step contains `holdPc`.
- Tests: static Lead through C→D♭ prefers post path; invalid if hold missing mid-chain.

---

## Phase K5 — Hybrid picker UI + beam caps

- Enumerate compatible template pairs ≤ budget; cap pairings.
- UI: combine two selected types.
- Tests: beam cap; C→D♭ hybrid count bounded.

---

## Phase K6 — Coach / Mods Keychange panel

- Entry: Coach Polish or Mods near playhead.
- Inputs: from/to, measure budget, hybrids/posts toggles.
- Results list + Hear path + Apply next.
- Teach strip per `teachingId`.
- Component tests / manual checklist from Success criteria.

---

## Execution order (this push)

| Order | Phase | Status |
|-------|-------|--------|
| 1 | Phase 0 doc | **done** |
| 2 | **C1** domain suggest/materialize | **done** |
| 3 | **K1** packModulationIntoSpan | **done** |
| 4 | **C2** Apply patches | **done** |
| 5 | **K2** KeyChangeApply | **done** |
| 6 | C3 / K6 UI | **C3 done**; **K6 done** (Polish → Key change panel) |
| 7 | C4, K3–K5 | **C4 done**; **K3+K3b done** (soft-score + trim); **K4 done** (posts); **K5 done** (beam hybrids) |

Shipped through K6 UI + K3–K5 domain. Optional polish: Mods toolbar entry, post hold auto-pick from Lead MIDI.

