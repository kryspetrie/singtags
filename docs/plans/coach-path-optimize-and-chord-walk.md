# Coach Path Optimizer + Chord Walk

> **Status:** Planned  
> **Created:** 2026-10-05  
> **Updated:** 2026-10-05  
> **Related:** [arranging-coach-full-surface.md](arranging-coach-full-surface.md), [../arranging/ux-workflows.md](../arranging/ux-workflows.md), [../../web/docs/cadence-coach-plan.md](../../web/docs/cadence-coach-plan.md)

## How AI agents should use this document

1. **Execute one phase at a time.** Do not start phase *N+1* until phase *N* acceptance criteria are met (tests green + checklist below).
2. **Check off tasks** (`- [ ]` → `- [x]`) in this file as you complete them; append a short `### Gate — YYYY-MM-DD` note under the phase.
3. **Prefer reuse** of existing ranking / cadence / VL / ring / QA primitives over new scoring systems.
4. **Do not reintroduce** Coach UI for Strengthen, Polish inversions, or Try swipe seed.
5. **Export stays out of Coach** — MIDI / MusicXML remain on the Tag Studio toolbar.
6. Keep [`ArrangingCoachDock.vue`](../../web/src/components/arranging/ArrangingCoachDock.vue) as a shell; put logic in application/domain + composables.
7. Avoid growing [`TagRollEditorView.vue`](../../web/src/views/TagRollEditorView.vue) without extracting helpers (keymap, focus hygiene).
8. After each phase: run focused Vitest; fix regressions before claiming the gate.

---

## North-star

| # | Goal | Meaning |
| --- | --- | --- |
| G1 | **Retire bad Auto tools** | Strengthen / Polish inversions / Try swipe seed gone from Coach |
| G2 | **Path Optimizer** | Re-evaluate / rewrite chords for whole song, range, or one chord with tunable VL↔Ring and cadence awareness |
| G3 | **Holistic quality** | Overlapping windows + multi-pass so the middle of the form is not sacrificed |
| G4 | **Try again** | Stochastic alternates in the same scope that still score well |
| G5 | **Chord Walk** | Both-hands keyboard loop: step → cycle ranked alts → hear → apply → optional auto-advance |
| G6 | **Honesty** | Status reports what changed; reject passes that worsen VL / leaps / errors |

### Non-goals (do not fake in v1)

- Embellishment / swipe auto-insert UI
- Mandatory Approach Two I–IX wall
- Perfect real-time collaborative optimize
- Replacing Harmonize panel entirely (parity bindings only)
- Export controls inside Coach

---

## Architecture (target)

```
domain/arranging/pathOptimize/     objective, windows, stitch, revoice-only candidates
application/arranging/PathOptimize.ts
stores/arrangement.ts              pathOptimize(opts) → replaceCurrent + report
components/arranging/
  ArrangingPathOptimize.vue        replaces ArrangingChartAuto.vue
lib/arranging/chordWalkKeys.ts     shared keymap for Coach + Harmonize
lib/arranging/coachRollTransport.ts  already has Apply/Hear/Secondary — wire keys here
```

**Reuse (do not duplicate):**

| Concern | Existing home |
| --- | --- |
| Ranked chord choices | `candidatesForMelodyNote`, `candidateRanker` |
| Beam / path fill | `autoHarmonizeMelody` |
| Cadence highways | `domain/arranging/cadences/*`, `suggestCadencesForPhrase` |
| VL / common tone / parallels | `theoryScores` |
| Ring | `ringTier` / contest profile |
| Barbershopness | `assessHowBarbershop` |
| QA penalties | `lintArrangement` / Coach QA config |
| Sketch Hear mid-range path | `optimizeSketchHearPath` — **preview/Hear only**, not Coach Optimize |
| Roll merge | `mergeArrangementIntoTagRoll` / `pushToRoll` |

---

## Product model

### Optimizer modes

| Mode | Locks | Changes |
| --- | --- | --- |
| **Fill empty** | Existing stacks | Moments without known chords |
| **Revoice** | Root, nature, lead MIDI | Bass/bari/tenor + voicing string |
| **Rechord** | Lead MIDI; optional Sketch pillar roots | Nature/root within allowlist + ranker |
| **Full path** | Lead MIDI | Fill + rechord + revoice |

### Scopes

| Scope | Source |
| --- | --- |
| Whole song | All harmonic moments |
| Selection / range | Selected notes, measure range, or Sketch span |
| Current chord | Active Coach / Harmonize moment |

### Weights (prefs)

- Voice leading ↔ Ring (primary slider)
- Cadence bias (Off / Moderate / Strong — align with existing cadence bias)
- Issue (lint) penalty
- Stay-put ε (prefer existing when gain &lt; threshold)
- Max passes / window size (advanced; sane defaults)

### Holistic search (required behavior)

1. Build moment list in scope (held-post aware).
2. Per moment: top-K from ranker (or revoice catalog in Revoice mode).
3. Overlapping windows (width ~6–10, hop ~2–3): DP/beam with weighted objective + cadence seeds.
4. Stitch windows; optional full-beam refine.
5. Repeat until improvement &lt; ε or max passes.
6. **Reject** if global VL motion, max part leap, or error lint count worsens vs baseline.

### Try again

Same mode/scope/weights; sample from top-K with temperature; floor vs best score; one-click undo via existing history.

### Chord Walk keys (when Coach Chords or Harmonize active)

| Keys | Action |
| --- | --- |
| ← / → | Prev / next moment (Coach already does this) |
| ↑ / ↓ | Cycle ranked candidates + preview |
| `F` | Apply selected |
| `H` | Hear selected / stack (Coach Hear when Coach open) |
| `Q` | Next empty |
| Space / Enter | Transport unchanged |
| `,` / `.` | Playhead scrub |

Pref: `tagRollChordWalkAutoAdvance` — after Apply, step to next empty (or next moment).

---

## Phase map

| Phase | Name | Outcome |
| --- | --- | --- |
| **P0** | Retire bad Auto tools | Clean Optimize shell; no Strengthen/Polish/Swipe UI |
| **P1** | PathOptimize core (domain + app) | Fill / Revoice / Rechord on whole + selection + current; one pass; reject gate |
| **P2** | Coach Optimize UI + store | Runnable from Coach Auto step; status + undo |
| **P3** | Cadence seeds + multi-pass windows | Holistic middle-of-form quality |
| **P4** | Try again | Stochastic alternates |
| **P5** | Chord Walk keyboard | Both-hands local loop + focus hygiene |
| **P6** | Polish, prefs, docs, cleanup | Shortcuts catalog, teach copy, dead code removal |

Recommended first mergeable arc: **P0 → P1 → P2**. Then P3–P4. Chord Walk (P5) can parallelize after P2 if needed.

---

## P0 — Retire Strengthen / Polish inversions / Swipe

### Intent

Remove user-facing Coach tools that rewrite the chart poorly. Leave domain helpers only if still used by tests or non-Coach paths; do not wire them to Coach Auto.

### Tasks

- [ ] Inventory all Coach UI/copy/transport references to Strengthen, Polish inversions, Try swipe seed (`ArrangingChartAuto.vue`, `useCoachGuidedAndReview.ts`, `useCoachTransport*`, `coachIdeasHelp.ts`, `ArrangingCoachLanding.vue`, GuidedSteps Auto tip).
- [ ] Replace `ArrangingChartAuto.vue` content with a minimal **Optimize** placeholder (title + short “coming next” / disabled Run), **or** delete component and show a stub panel in the dock until P2.
- [ ] Remove `onStrengthen` / `onPolish` / `onApplySwipe` / `swipeAvailable` / strengthen-specific status from Coach guided composable **or** leave functions unexported unused — prefer delete from Coach surface.
- [ ] Remove Auto transport primary “Polish inversions” CTA; Auto/Optimize step has no misleading primary until P2 wires **Run**.
- [ ] Update GuidedSteps / landing / ideas-help copy: Auto = Path Optimizer; no swipe/strengthen promises.
- [ ] Confirm export is not present on Polish or Auto.
- [ ] Tests: GuidedSteps / transport / coach ideas still pass; no imports of removed Coach handlers.
- [ ] Manual: open Coach → Auto — no Strengthen / Polish inversions / Try swipe seed buttons.

### Acceptance

- Coach Auto has zero of the three retired actions.
- App boots without Vite export errors (prefer `strengthenArrangement.ts` naming; avoid `Strengthen.ts` vs domain `strengthen.ts` case clash).
- Focused Vitest green for touched Coach files.

### Gate — (append date)

<!-- AI: pass/fail + residuals -->

---

## P1 — PathOptimize core (domain + application)

### Intent

Pure, testable optimize engine with modes, scopes, weights, single-pass window or beam, and reject gate. No Vue required.

### Tasks

- [ ] Add `web/src/domain/arranging/pathOptimize/` module:
  - [ ] `types.ts` — `PathOptimizeMode`, `PathOptimizeScope`, `PathOptimizeWeights`, `PathOptimizeOpts`, `PathOptimizeReport`
  - [ ] `objective.ts` — score a path: VL links + ring + cadenceFit + lint penalty + barbershopness ± stay-put; apply weight sliders
  - [ ] `moments.ts` — resolve moment list from project + scope (whole / tick range / single tick); reuse harmonic-moment notions from Coach where possible
  - [ ] `candidates.ts` — per-moment top-K via `candidatesForMelodyNote`; Revoice mode = same root/nature, alternate placements only
  - [ ] `optimize.ts` — run Fill / Revoice / Rechord / Full for scope; reuse `autoHarmonizeMelody` ideas for Fill/Full
  - [ ] `rejectGate.ts` — compare baseline vs candidate: total harmony motion, max leap, error lint count
- [ ] Add `web/src/application/arranging/PathOptimize.ts` — `pathOptimize(project, opts) → { project, report }`
- [ ] Export from `application/arranging/index.ts`
- [ ] Unit tests:
  - [ ] Melody + pillars, empty stacks → Fill produces stacks, leads locked
  - [ ] Revoice keeps root/nature/lead; does not yank smooth bass register (seed/stay-put)
  - [ ] Rechord can change nature when a clearly better candidate exists
  - [ ] Scope = tick range only touches stacks in range
  - [ ] Reject gate returns unchanged project when motion/leaps worsen
- [ ] Defaults: sensible weights; beam/top-K capped for responsiveness on long charts

### Acceptance

- Domain/application tests green without UI.
- Report includes: mode, scope, changed stack ids, score delta fields, rejected?: boolean.

### Gate — (append date)

<!-- AI: pass/fail + residuals -->

---

## P2 — Coach Optimize UI + store wiring

### Intent

User can Run Path Optimizer from Coach with mode + scope + VL↔Ring, see status, undo via normal Tag Studio undo.

### Tasks

- [ ] `arrangement` store: `pathOptimize(opts)` calling application use-case; `replaceCurrent` when report says applied; return report for UI status.
- [ ] Implement `ArrangingPathOptimize.vue` (replace stub):
  - [ ] Mode select: Fill empty / Revoice / Rechord / Full path
  - [ ] Scope select: Whole song / Selection / Current chord
  - [ ] VL ↔ Ring slider (and optional cadence strength)
  - [ ] **Run** primary button
  - [ ] Status line from last report (changed count, rejected reason, score hints)
  - [ ] Hint: export on toolbar; audition after Run
- [ ] Wire dock Auto/Optimize step to new component; `pushToRoll` after successful apply.
- [ ] Scope resolution from Tag Studio: selection → tick min/max; current → selected moment tick; whole → full project.
- [ ] Transport: primary label **Run optimize** (or **Run**) calling the same Run handler when on Optimize step.
- [ ] Prefs stub (optional in P2): persist last mode + VL↔Ring in `preferences` / tag-roll prefs.
- [ ] Tests: store method with fixture project; component smoke if pattern exists.
- [ ] Manual checklist:
  - [ ] Melody-only + Sketch pillars → Fill/Full writes TTBB
  - [ ] Existing smooth chart → Revoice does not octave-yank
  - [ ] Undo restores prior stacks
  - [ ] Selection scope only changes notes in range

### Acceptance

- Coach Optimize is usable end-to-end for whole / selection / current.
- Status never silent (always explains applied or rejected/no-op).

### Gate — (append date)

<!-- AI: pass/fail + residuals -->

---

## P3 — Cadence seeds + multi-pass overlapping windows

### Intent

Holistic quality: classic highways + middle-of-form not sacrificed to L→R greed.

### Tasks

- [ ] Seed window search with `suggestCadencesForPhrase` / cadence catalog boosts when Lead supports patterns.
- [ ] Implement overlapping windows (configurable width/hop) + stitch with boundary re-score.
- [ ] Multi-pass loop until ε or maxPasses; include pass count in report.
- [ ] Tests:
  - [ ] Fixture with clear V7→I / II–V–I opportunity prefers highway vs random SCF
  - [ ] Long phrase: middle window score not collapsed vs ends (assert motion/leaps bounded)
  - [ ] Multi-pass does not worsen reject-gate metrics vs single pass baseline when already good
- [ ] UI: expose **Passes** (or Advanced disclosure) + cadence strength control if not in P2.
- [ ] Update ideas/help copy for Optimize step (highways, windows, audition).

### Acceptance

- Cadence-aware fixtures green.
- Manual long tag: middle does not become the jumpy section after Optimize.

### Gate — (append date)

<!-- AI: pass/fail + residuals -->

---

## P4 — Try again (alternates)

### Intent

Hear other legal high-scoring paths without resetting weights/mode/scope.

### Tasks

- [ ] `pathOptimize(..., { explore: true, temperature?, seed? })` or `pathOptimizeTryAgain(project, lastOpts)`.
- [ ] Sample among top-K with floor relative to best; never pick garbage below floor.
- [ ] UI button **Try again** (enabled after a successful Run or when scope has stacks); status distinguishes explore vs optimize.
- [ ] Ensure undo still restores previous apply.
- [ ] Tests: two try-again calls with different seeds can differ; both pass reject floor; leads stay locked.

### Acceptance

- Manual: Run → audition → Try again → audibly different but still musical option → Undo works.

### Gate — (append date)

<!-- AI: pass/fail + residuals -->

---

## P5 — Chord Walk keyboard

### Intent

Both-hands local craft without leaving the keyboard; mouse clicks in the drawer must not break arrow/transport focus.

### Tasks

- [ ] Add `web/src/lib/arranging/chordWalkKeys.ts` (or `lib/tagRoll/chordWalkKeys.ts`) — pure matchers: given keydown + context → action enum.
- [ ] Context: Coach Chords active **or** Harmonize open; not typing target; not Roles-assign conflicts where keys collide (document precedence).
- [ ] Wire `TagRollEditorView` keydown:
  - [ ] ↑/↓ → step suggest index + preview (Coach dock + Harmonize)
  - [ ] `F` → `coachRollTransportPrimary` / Harmonize apply selected
  - [ ] `H` → Coach Hear when Coach open; else existing hear-stack behavior
  - [ ] `Q` → `coachRollTransportSecondary` (Next empty) when available
  - [ ] Keep ←/→ moment step via existing `tryCoachArrowStepMoment` / Harmonize `step`
- [ ] Implement `stepSuggest(±1)` on coach dock API / Harmonize `defineExpose`.
- [ ] Pref `tagRollChordWalkAutoAdvance` + toggle in Optimize or Chords chrome (small); after Apply, next empty (fallback next moment).
- [ ] Focus hygiene: Suggest rows + transport buttons `mousedown.preventDefault` (keep window key routing).
- [ ] Shortcuts catalog (`shortcuts.ts`) new group or entries for chord-walk; `?` overlay lists them.
- [ ] Tests for keymap matcher; transport action tests for new keys.
- [ ] Manual: Coach Chords — step, cycle, hear, apply, auto-advance — without touching mouse after open.

### Acceptance

- Full walk possible keyboard-only.
- Clicking a Suggest row then pressing ← still steps moments (focus not trapped).

### Gate — (append date)

<!-- AI: pass/fail + residuals -->

---

## P6 — Polish, prefs, docs, cleanup

### Intent

Ship-quality copy, persistence, and dead-code hygiene.

### Tasks

- [ ] Persist Path Optimize prefs (mode, weights, passes, auto-advance) in preferences store with normalize defaults.
- [ ] Coach landing + GuidedSteps tips + ideas/help fully aligned with Optimize + Chord Walk (no leftover Strengthen/swipe).
- [ ] Remove dead Coach-only code paths for strengthen/swipe apply if unused; keep domain `strengthenStacks` only if tests/other features need it — document decision in gate note.
- [ ] Rename Coach rail label **Auto** → **Optimize** if product copy agrees (update `GuidedStepId` carefully with `normalizeGuidedStepId` legacy map `auto` → `optimize` **or** keep id `auto` and only change label — prefer label-only to reduce churn).
- [ ] Update [arranging-coach-full-surface.md](arranging-coach-full-surface.md) / status cross-links if needed.
- [ ] Adversarial manual pass: beginner melody-only; repair chart with stacks; selection Try again; Chord Walk.
- [ ] Mark this plan status **Implemented** (or **In progress** with residuals) in [README.md](README.md).

### Acceptance

- No user-facing mention of retired tools.
- Prefs survive reload.
- Plan README status updated.

### Gate — (append date)

<!-- AI: pass/fail + residuals -->

---

## Testing matrix (cross-phase)

| Scenario | Expect |
| --- | --- |
| Melody + locked Sketch, no stacks, Full/Fill | TTBB stacks; lead = melody |
| Smooth existing stacks, Revoice | Motion ≤ baseline; no bass octave yank |
| Broken leaps, Revoice/Full | Motion improves or reject no-op |
| Selection bars 2–3 only | Outside unchanged |
| Current chord only | One stack region changes |
| Classic ^5→^1 | Prefers V7→I when cadence on |
| Try again ×3 | Diversity without crashing score floor |
| Chord Walk | ←→ ↑↓ F H Q Space all behave |
| Undo after Run/Try again | Prior project restored |

---

## File touch map (expected)

| Area | Files (indicative) |
| --- | --- |
| Retire UI | `ArrangingChartAuto.vue` → `ArrangingPathOptimize.vue`, `useCoachGuidedAndReview.ts`, `GuidedSteps.ts`, `coachIdeasHelp.ts`, `ArrangingCoachLanding.vue`, `useCoachTransport.ts` |
| Engine | `domain/arranging/pathOptimize/*`, `application/arranging/PathOptimize.ts`, `stores/arrangement.ts` |
| Chord Walk | `TagRollEditorView.vue`, `chordWalkKeys.ts`, `shortcuts.ts`, coach suggest panel, Harmonize panel |
| Prefs | `stores/preferences.ts` |

---

## Out of order / do not do

- Do not “fix” Optimize by calling old `strengthenArrangement` / `polishInversionPath` from Coach.
- Do not put Export on Optimize or Polish.
- Do not block on swipe embellishment for any phase.
- Do not mark P3 done with only L→R greedy beam and no window stitch.

---

## Progress log

| Date | Phase | Note |
| --- | --- | --- |
| 2026-10-05 | — | Plan written from Coach Auto failure + Chord Walk investigation |
