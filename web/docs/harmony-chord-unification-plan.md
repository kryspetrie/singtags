# Plan: Unify Harmony panel ↔ Detected / My Chords chord pick

Follow-up to the post-ship comparison of Harmonize, Detected, and My Chords. Goal: **one chord-pick + Hear + declare-span spine** without collapsing the three product surfaces.

Related: `harmonize-sketch-apply-plan.md`, `harmony-sketch-plan.md`, `cadence-coach-plan.md`.

## Problem

All three surfaces already write the same persisted map (`project.harmonySketch`) and mostly share `buildHarmonizeChordOptions`, but:

| Gap | Symptom |
|-----|---------|
| **Two chord pick UIs** | `TagRollHarmonizePanel` and `TagRollChordEditPopover` both render primary / more / filter / name+roman from the same catalog with forked chrome |
| **Two Hear paths** | Lanes use path-aware `onHearHarmonySketch`; panel uses a thinner local stab |
| **Ranking discarded on open** | Detected strip ranks via `impliedMelodyChord` + cadence; popover reopens flat catalog order |
| **Three write verbs** | `commitHarmonizeAtMelody` / popover Apply / Lock-all all land on locked user spans but diverge on Coach pillar sync and history |
| **Vocabulary drift** | Apply / Lock / Harmonize / Realize name two underlying ops (sketch vs notes) three different ways |

## Target mental model (keep surfaces)

| Surface | Job (unchanged) |
|---------|-----------------|
| **Harmony panel** | Step melody → pick chord (± write voicing **now**) |
| **Detected** | Ephemeral hole proposals; Lock promotes to My Chords |
| **My Chords** | Authoritative span map + geometry + Realize |

**Do not merge:** Declared geometry, Realize batch path, Harmonize voicing browser, Coach AutoHarmonize UI. Share cadence bias / catalog with Coach; do not share chrome.

Canonical ops under the hood:

1. **Declare** — upsert locked `harmonySketch` span (`rootPc` + quality).  
2. **Realize** — write TTBB from sketch (batch Realize or panel Chord+stack).  
3. **Hear** — audition a span (one-shot stab or hold).

## Phased delivery

### Phase 1 — Shared chord pick (P0)

**What:** Extract presentational chord list (filter, Contains melody / Other, name+roman chips, lead ♪ mark, hold-to-hear hooks) used by:

- `TagRollChordEditPopover.vue`
- `TagRollHarmonizePanel.vue` (chord step only; voicing step stays panel-local)

**API sketch:**

```ts
// TagRollChordPickList.vue (or composable + thin view)
props: {
  options: { primary: HarmonizeChordOption[]; more: HarmonizeChordOption[] }
  selectedKey: string | null
  mode: 'name' | 'roman' | 'both'  // panel = both; lanes = lane pref
  leadLabel?: string | null
  // rankedIds?: string[]  // Phase 3
}
emits: { pick, holdStart, holdStop }
```

**Keep different:**

- Panel: immediate commit + optional voicing step; `chordOnly` primary list  
- Popover: draft → Apply / Cancel / Delete; always lead-valid marking when Lead known  
- Popover drag / wide layout stays on the popover chrome, not the shared list

**Done when:** one list component; both surfaces pass tests; no behavior regress on hold-to-hear.

### Phase 2 — Single Hear façade (P1)

**What:** Thin API over `sketchHearVoicing` + optional path optimize:

```ts
hearSketchSpan({
  startTick, endTick, rootPc, quality,
  mode: 'oneshot' | 'hold',
  pathContext?: 'lanes' | 'local',  // lanes = optimizeSketchHearPath
})
```

- Lanes / editor: keep hold + path optimize (current `onHearHarmonySketch`).  
- Panel chord-only: call same helper for stab (drop duplicate local player wiring where possible).  
- Panel Chord+stack: keep `placeVoicing` as explicit “literal voicing” audition.

**Done when:** panel chord Hear matches lane Hear quality for the same sketch chord; one place owns release / stop.

### Phase 3 — Ranked Detected seeds in the popover (P2)

**What:** When opening Detected (and optionally Declared at a tick), seed / sort chips from strip candidates (`nameCandidatesByTick` / `inferImpliedChordsFromMelody` + cadence hint), not only catalog order.

- Top Detected pick stays first in the popover.  
- Cadence id can soft-boost matching V7/I chips.  
- Catalog “More…” remains for browse / override.

**Done when:** opening Detected on a cadence-proposed F7 shows F7 (or ranked peers) at the top of Contains melody; catalog completeness unchanged.

### Phase 4 — Declare-span use-case (P3)

**What:** One application entry for locked user sketch writes:

```ts
declareHarmonySpan({
  window: { kind: 'melodyNote' | 'detectHole' | 'freeSpan'; startTick; endTick },
  rootPc, quality,
  source: 'user',
  locked: true,
  syncCoachPillars?: boolean,  // default true for lane Apply / Lock
  alsoRealize?: 'none' | 'thisWindow',  // panel Chord+stack
})
```

Wire:

| Today | Becomes |
|-------|---------|
| `commitHarmonizeAtMelody` | `declare` + optional realize this window |
| Popover Apply / Lock | `declare` (+ pillar sync) |
| Inline commit-at | `declare` with freeSpan / typed quality |

**Done when:** Coach pillars stay in sync after Harmonize Chord-only and lane Apply alike; history labels are consistent.

### Phase 5 — Product language (P4, light)

Copy / tips only (no new modes):

| User verb | Means |
|-----------|--------|
| **Apply** / **Lock** / Harmonize **Chord** | Declare sketch |
| **Realize** / Harmonize **Chord + stack** | Write notes from sketch |
| **Hear** | Audition (same façade) |

Update Harmonize header tip + Detected Lock / My Chords Realize tooltips to the same two-op story.

### Later (optional) — Ranking façade (P5)

Only if Detected/Coach teaching should appear in Harmonize “smart” mode:

`suggestChords({ leadMidi, context, source: 'catalog' | 'implied' | 'coach' })`

Do **not** replace catalog browsing with Coach beam search in the panel.

## Keep separate (non-goals)

- Detected vs My Chords lanes (proposal vs authority)  
- Declared geometry (`useDeclaredStripGestures`)  
- Realize as My Chords batch CTA  
- Harmonize voicing browser (`VOICINGS_BY_CHORD`, ghosts)  
- Per-lane Chord / Number prefs  
- Coach AutoHarmonize chrome  
- Delayed authentic cadence look-ahead (^5 … ^1) — separate cadence plan follow-up, not this unification

## Suggested order / risk

1 → 2 are low risk, high reuse.  
3 needs careful UX so users can still override Detected.  
4 is the behavior-correctness win (Coach sync) but touches store paths — do after 1–2.  
5 is docs/copy.

## Success criteria

- One shared pick list; Harmonize and popover do not drift.  
- Hear sounds the same for the same sketch chord from panel or lane.  
- Detected open → ranked suggestion on top.  
- Declare always optional-syncs Coach pillars when coming from lane Apply / Lock / Harmonize Chord.  
- Surfaces remain distinct; no mega-panel.
