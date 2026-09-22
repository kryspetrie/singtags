# Improvement plan: Coach / home-roots after Phases 0–6

Temporary working plan derived from the post-implementation adversarial analysis.
Execute in order A → G unless blocked.

## Goal

Make the coach feel like **one destination at a time**, with **one place to navigate**, and **selection that never lies**—including dual-monitor and repair charts—without rewriting chord ranking.

Success: an arranger can answer, without opening a glossary: *“I’m locking Bb as the home for this phrase; the roll shows where I’m looking; Delete won’t wipe my notes; next propose lands on the next uncovered stretch.”*

---

## Non-goals

- Do not redesign PCF/SCF ranking or store chord quality on pillars.
- Do not merge Strong/passing into Pillars.
- Do not build CRDT sync for pop-out (last-write-wins is enough).
- Do not require perfect phrase detection before shipping nav/pop-out fixes.

---

## Priority map

| Pri | Theme | Pain if deferred |
|-----|--------|------------------|
| **P0** | Pop-out ↔ main roll transport / overlay | Dual-monitor coach is half-broken |
| **P1** | One nav model (guided step ≡ focus tab; kill legacy roll chord bar) | Triple ←/→; wrong panel |
| **P1** | Skip memory + demote “Lock remaining” | Pedagogy fights itself |
| **P2** | Shrink god files (panels out of dock) | Every change is high-risk |
| **P2** | Clarify arrangement-target vs roll selection | “Nothing selected” confusion |
| **P3** | Phrase heuristics + E2E Lilly script | Soft quality / silent regressions |

---

## Phase A — Dual-monitor integrity (P0)

### Problem
Pop-out posts `focusRange` to the main window, but **roll transport handlers live in the pop-out Pinia instance**. Main roll has no usable coach ←/→ when coach is detached.

### Plan
1. **Keep overlay channel** (`focusRange` only; no `selection`).
2. **Host transport on the main window** when detached:
   - Option (preferred): main window keeps a thin **CoachTransportHost** registered while `coachDetached`; pop-out posts **intent messages** (`prev` / `next` / `primary` / `hear` / `lock` / `skip`) over the existing BroadcastChannel.
   - Option (fallback): re-open a minimal dock stub on main that only registers roll transport (worse UX).
3. Extend `CoachPopoutMsg` with transport intents + optional status snapshot (step label, status string) so the roll mirror stays honest.
4. When detached: main roll shows transport; pop-out dock shows the same model but **actions go through the channel**.

### Exit
With coach on a second monitor: Propose / Pillar ←→ / Lock on the **main** roll strip moves L/R overlay and drafts; Delete still does not mass-select notes.

### Tests
- Unit: channel message round-trip for `focusRange` + one transport intent.
- Manual: detach → propose on dock → L/R moves on main; Lock on main strip works.

---

## Phase B — One navigation model (P1)

### Problem
Three systems: dock transport, roll transport mirror, legacy `ArrangingCoachRollNav` chord/repair bar; plus **guidedStep ≠ focusTab**.

### Plan
1. **Map guided step → focus tab** on every `selectGuidedStep` (and transport primary when it enters Chords/Check):
   - pillars → `now` (+ pillars chrome)
   - roles → `now` (+ roles panel)
   - chords → `choose`
   - check → `check`
   - polish → `polish`
2. **Retire legacy roll chord bar** when coach transport is active (always when dock/host registered). Keep only repair-specific shortcuts if needed as **secondary buttons on Check transport** (“Next empty”, “Next problem”), not a second toolbar.
3. Collapse **next-action CTA** into transport: either make next-action the primary when it matches the step, or demote session CTA to a single “Suggested: …” text link so there aren’t three “what do I do?” buttons.
4. Roles panel: remove “use transport above” dead-end; keep Strong/Passing toggles only.

### Exit
Exactly **one** ←/→ meaning per guided step, visible in dock and (when open) on the roll. Switching rail step always shows the matching panel.

### Tests
- `selectGuidedStep('chords')` sets `focusTab === 'choose'`.
- Roll nav legacy paths unused / deleted; Check still can jump next issue via transport.

---

## Phase C — Guided propose pedagogy hardening (P1)

### Problem
Skip can repropose the same span; “Lock remaining” batch-locks drafts and trains the wrong habit.

### Plan
1. **Skip registry** on the arrangement (or session): set of `{startTick,endTick}` (or pillar ids) skipped this session; `nextHomeRootProposal` ignores them until “Reset skips” or project reload.
2. **Demote Lock remaining**:
   - Move under Advanced next to “Draft all measures”, or
   - Rename to “Lock all drafts (advanced)” with a confirm.
3. After Lock: auto-advance to next propose **only if** user preference or a soft “Propose next?” isn’t needed—default: **auto-propose next** to keep the loop flowing (match Approach Two “confirm destination → next”).
4. Status line: `skipped N · locked M/K` so skips aren’t invisible.

### Exit
Skip once → next propose is a different window; Lock remaining is not the default teaching path; Lock then next destination is one click or automatic.

### Tests
- Domain: skip then next ≠ same span; reset clears skips.
- Store: lock then propose advances cursor.

---

## Phase D — Selection honesty & target clarity (P2)

### Problem
Roll selection clears, but `selectedMelodyId` still drives candidates—feels deselected while dock is busy.

### Plan
1. Document in UI one line: “Looking at measure X (inspect) — notes not selected for edit.”
2. Optional: show a **ghost/playhead-only** candidate target badge in dock (“Target: C4 @ 3:1”) without selecting roll notes.
3. Ensure all coach-nav paths call `selectNotes([])` **and** never call `onCoachFocusPart` unless learning a part-specific lint with explicit “Select part notes” CTA.
4. Pop-out never posts selection arrays (already removed)—keep that invariant in tests.

### Exit
Lilly: after Pillar ←→, `selectedNoteIds` empty; Delete does nothing dangerous; inspect L/R still moves.

### Tests
- Overlay-only tests already exist—extend to Uncovered jump + Propose next + pop-out focusRange.

---

## Phase E — God-file extraction (P2)

### Problem
Dock / dock logic / editor / arrangement store still grow under grandfather budgets.

### Plan (extract in dependency order; each PR must **lower** budgets)
1. `ArrangingCoachPillarsPanel.vue` (list, root picker, uncovered list, advanced).
2. Wire Choose / Check panels as thin wrappers if not already.
3. Move pop-out + relay helpers out of `TagRollEditorView` into `useTagRollCoachShell` / `useTagRollCoachFocus` only.
4. Keep `proposePillarAt.ts` as the domain home; avoid new logic in the store façade beyond thin wrappers.

### Exit
`ArrangingCoachDock.vue` and `useArrangingCoachDock.ts` line counts strictly below current budgets; no new ratchet-ups without extraction.

---

## Phase F — Phrase quality (P3, after A–C)

### Problem
Propose windows are measure / onset based—can feel “software-y.”

### Plan (v1.5 heuristics only)
1. Prefer span: **Strong onset → next Strong onset** when roles labeled; else measure.
2. Prefer playhead measure if uncovered/unconfirmed; else next uncovered Strong; else next measure with melody.
3. Never propose empty pickup-only silence as first-class home.
4. Keep batch “Draft all measures” advanced-only.

### Exit
On Lilly held Lead: propose lands under the held phrase, not whole chart; next propose moves forward in time.

### Tests
- Fixture-based tests with synthetic Strong/Passing labels; optional Lilly JSON golden for span starts (not roots).

---

## Phase G — Hardening & acceptance (P3, continuous)

### Automated
1. E2E (or heavy component) **Lilly script**: open coach → Propose → assert no mass select → Lock → Propose next different span → Uncovered Jump clears selection → Add creates one draft.
2. Pop-out channel unit tests (jsdom BroadcastChannel polyfill or mock).
3. `coachRollTransport` + guidedStep/focusTab sync tests.

### Manual acceptance matrix

| Chart | Must pass |
|-------|-----------|
| Lilly Marlene | No mass select; propose one root under held Lead; L/R = pillar window |
| Empty melody | Coach asks for Lead; no crash |
| Repair chart (stacks exist) | Review home roots; stacks stay put; Lock remaining not primary |

---

## Suggested order

| Order | Phase | Why |
|------|-------|-----|
| 1 | **A** Pop-out transport | Fixes the only P0 dual-monitor hole |
| 2 | **B** One nav + step↔tab | Removes mental load immediately in single-window use |
| 3 | **C** Skip + Lock remaining | Makes guided propose trustworthy |
| 4 | **D** Selection honesty copy/target | Cheap trust |
| 5 | **E** Extract panels | Unblocks safe iteration |
| 6 | **F** Phrase heuristics | Quality once loop is trusted |
| 7 | **G** E2E / acceptance | Lock the wins |

Doing F before B risks teaching better proposals with confusing chrome. Doing E before A/B grows more surface area while UX is still split.

---

## Status

- [x] Phase A — Dual-monitor integrity
- [x] Phase B — One navigation model
- [x] Phase C — Guided propose pedagogy
- [x] Phase D — Selection honesty
- [x] Phase E — God-file extraction (Pillars panel; dock ↓ 1301→1172)
- [x] Phase F — Phrase quality (Strong→Strong when labeled)
- [x] Phase G — Hardening & acceptance (unit coverage; E2E Lilly still manual)
