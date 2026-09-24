# Plan: Harmonize ↔ Harmony sketch (MuseScore-style apply modes)

Follow-up to `harmony-sketch-success-gaps-plan.md`. Goal: support the MuseScore loop — **declare chords**, then **realize stacks**, then **fill intermediaries** — without merging Coach and Harmonize into one UI.

## Problem

| Tool | Today | Gap |
|------|-------|-----|
| **Harmony strip** | Declared sketch map | Not tied to Harmonize commits |
| **Harmonize** | Always writes TTBB at melody note | Cannot declare chord-only; does not read/write sketch |
| **Coach** | Guided ranking / coverage | Different audience — keep separate |

User workflow to support:

1. Sketch pass (chord identity over time).  
2. First-cut stacks via Harmonize (or Coach Apply).  
3. Intermediary fills on later passes.

## Target mental model

- **Sketch** = what the harmony *is* (root + quality).  
- **Stacks** = how TTBB *realize* it.  
- **Harmonize** = hand tool at the current melody note: set sketch and/or stack.  
- **Coach** = curriculum + ranking (same sketch truth; not a second chord world).  
- **Strip** = always-visible sketch map / Hear.

**Do not merge** Coach and Harmonize chrome.

## Agreed Harmonize apply modes

Sticky toggle (session + localStorage preference):

| Mode | Effect |
|------|--------|
| **Chord only** | Upsert locked `harmonySketch` for the melody note window. No TBB notes. Hear block chord (or panel stab from placed voicing preview optional). |
| **Chord + stack** (default for power users who already use Harmonize) | Upsert sketch **and** current `upsertHarmonyNotes` stack write. |

Stretch (not Phase 1–3): **Stack only** (voicing under existing sketch without changing quality).

## Span window rule

For a melody note `N`:

- `startTick = N.startTick`  
- `endTick = N.startTick + N.durationTicks` (same window Harmonize already uses for stacks)  
- Upsert locked sketch with `rootPc` + `natureToSketchQuality(chordId)`, `source: 'user'`.

Map harmonizer natures not in the sketch closed set:

- `dim7` → `dim`  
- `add9` → `ninth` (or `major` if ninth Hear is weak — prefer `ninth`)  
- else existing `natureToSketchQuality`

## Phased delivery

### Phase 0 — Docs

- This plan file.  
- One-line tip in Harmonize header: “Chord only = sketch; Chord + stack = sketch and TTBB.”

### Phase 1 — Apply modes + sketch upsert

1. Preference `tagRollHarmonizeApplyMode`: `'chord' | 'chord+stack'` (default `'chord+stack'` to preserve current muscle memory, or `'chord'` if we prefer sketch-first — **default `chord+stack`** for least surprise to existing Harmonize users; tip makes Chord only discoverable).  
2. UI toggle on Harmonize panel.  
3. `commitHarmony`:
   - Always upsert sketch when a chord is selected (both modes).  
   - Write stacks only in `chord+stack`.  
   - Chord-only: still allow selecting a chord (auto-picks first voicing for Hear stab optional); do **not** call `upsertHarmonyNotes`. Prefer: on chord select in chord-only, commit sketch immediately without requiring voicing; voicing buttons disabled or labeled “preview only.”  
4. Pure helper `harmonizeCommitSketch({ sketch, melodyNote, rootPc, quality })` for tests.  
5. Cancel / undo: history already wraps note upserts; sketch upsert must share the same history transaction when both write (one `pushHistory` / one undo).

**Recommended commit behavior detail:**

- **Chord only:** selecting a chord (or changing root then chord) upserts sketch; optional Hear via `blockChordMidis`; voicings hidden or disabled.  
- **Chord + stack:** current behavior + sketch upsert in the same store mutation (notes + sketch together).

Store API: extend `upsertHarmonyNotes` to optionally also patch sketch, **or** add `commitHarmonizeAtMelody` that does both under one history push.

### Phase 2 — Preselect from sketch

When melody note / playhead changes:

1. Find locked sketch span covering `melodyNote.startTick`.  
2. If found: set `rootOffset` from span.rootPc vs tonality; set `chordId` from span.quality (best-effort map).  
3. Do **not** auto-commit (avoid rewriting stacks on mere navigation).  
4. Visual: “Matches sketch: G7” chip when preselected.

### Phase 3 — Polish + tests

1. Chord-only Hear uses sketch block chord (consistent with strip Hear).  
2. After chord+stack, strip declared row shows the chord; detect holes update.  
3. Unit tests: sketch-only commit; chord+stack writes notes+sketch; undo reverts both; preselect sets root/chord without mutating.  
4. God-file budget if Harmonize panel grows.

### Phase 4 (stretch — not required for exit)

- Stack-only mode.  
- Coach Apply also upserts sketch (if not already via pillars sync).  
- Harmonize “next uncovered sketch hole” shortcut.

## Non-goals

- Merging Coach UI into Harmonize.  
- Replacing the Harmony strip.  
- Auto-harmonizing the whole chart in one click (batch stays Coach Advanced / separate).

## Risks

| Risk | Mitigation |
|------|------------|
| Chord-only users expect voicing click to do something | Disable voicings in chord-only; tip explains |
| Undo only reverts notes | Single history transaction for sketch+notes |
| Quality id mismatch (dim7) | Explicit map in `natureToSketchQuality` |
| Default mode surprises sketch-first users | Tip + sticky preference; document in plan |

## Implementation order

1. Phase 0 docs  
2. Phase 1 modes + store helper + panel  
3. Phase 2 preselect  
4. Phase 3 tests + Hear polish  
5. Adversarial checklist review  

---

## Final checklist (adversarial exit gate)

Every item must be **Pass**. Reviewer should try to break each claim.

### Modes & commit

- [ ] **H1** Harmonize shows sticky **Chord only** / **Chord + stack** toggle.  
- [ ] **H2** Chord only: selecting a chord upserts locked sketch for the melody note window; **no** Tenor/Bari/Bass notes written.  
- [ ] **H3** Chord + stack: selecting chord/voicing writes TTBB **and** upserts the same sketch span.  
- [ ] **H4** Sketch span `startTick`/`endTick` match the melody note window used for stacks.  
- [ ] **H5** One Undo reverts the last Harmonize commit (notes and/or sketch as applicable).  
- [ ] **H6** Harmonizer natures map into sketch qualities without silently becoming wrong majors for dim7/add9 (explicit map).

### Preselect & navigation

- [ ] **H7** Moving to a melody note under a locked sketch preselects root + quality without auto-writing.  
- [ ] **H8** Preselect does not clear user root choice until melody note changes (or document if it resets — prefer: re-sync only on melody note id change).

### UX clarity

- [ ] **H9** Chord-only disables or clearly demotes voicing apply (no silent stack write).  
- [ ] **H10** Panel tip states Chord only = sketch; Chord + stack = sketch + TTBB.  
- [ ] **H11** Strip declared row updates after Harmonize commit without opening Coach.

### Regression

- [ ] **H12** Existing Harmonize chord+stack path still places stacks correctly (applyHarmony tests + smoke).  
- [ ] **H13** `vue-tsc` clean; targeted vitest green (harmonize + harmonySketch + related).

### Success claim

- [ ] **S1** User can sketch an entire phrase via Harmonize Chord only while walking melody notes.  
- [ ] **S2** User can then switch to Chord + stack and realize first-cut TTBB under those declarations.  
- [ ] **S3** Coach remains a separate surface; same sketch truth appears on the strip.  

---

## Baseline (pre-implementation)

| ID | Result |
|----|--------|
| H1–H11, S1–S2 | **Fail** |
| H12 | **Pass** (stack path exists) |
| H13 | **Pass** (until changes) |
| S3 | **Pass** (Coach already separate) |

---

## Exit evaluation (adversarial)

Reviewed after Phases 0–3 implementation.

| ID | Result | Evidence / attack notes |
|----|--------|-------------------------|
| H1 | **Pass** | Mode toggle + `harmonizePrefs` sticky localStorage |
| H2 | **Pass** | `commitHarmonizeAtMelody` mode `chord` skips `applyHarmony`; panel disables voicings |
| H3 | **Pass** | Same commit writes sketch + pitches in one history push |
| H4 | **Pass** | `sketchPatchFromMelodyNote` uses melody start+duration |
| H5 | **Pass** | Single `pushHistory()` in `commitHarmonizeAtMelody`; Cancel → `cancelLastEdit` |
| H6 | **Pass** | `natureToSketchQuality`: dim7→dim, add9→ninth; test coverage |
| H7 | **Pass** | `preselectFromSketch` on melody note id change / panel open; `syncingFromSketch` blocks commit |
| H8 | **Pass** | Re-sync only when `melodyNote.id` changes |
| H9 | **Pass** | Voicing section dimmed/disabled in Chord only |
| H10 | **Pass** | `mode-tip` copy on panel |
| H11 | **Pass** | Sketch upsert updates strip via project.harmonySketch |
| H12 | **Pass** | `applyHarmony.test.ts` still green; chord+stack still calls applyHarmony |
| H13 | **Pass** | `vue-tsc` + targeted vitest |
| S1 | **Pass** | Walk melody + Chord only declares sketch |
| S2 | **Pass** | Switch to Chord + stack to realize TTBB |
| S3 | **Pass** | Coach unchanged as separate surface |

**Exit summary:** All checklist items **Pass**. MuseScore-style declare-then-realize loop is supported via Harmonize without merging Coach.
