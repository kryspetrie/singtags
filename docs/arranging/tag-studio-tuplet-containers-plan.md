# Tag Studio: Tuplet containers on the piano roll

**Status:** Phases 0–4 done; Phase 5 partially done (toolbar/shortcut + dim preview)  
**Goal:** Author triplets, sextuplets, and other non-grid subdivisions without changing the binary piano-roll snap grid. Sheet engraving and MusicXML consume explicit tuplet membership.

## Design summary

- **Roll stays binary.** Snap, quantize, and empty-click compose are unchanged.
- **Tuplet = span container** on one part: `startTick` + `spanTicks` = written time occupied (e.g. one quarter for three eighth-triplets).
- **Distinct chrome** (dashed band, `3`/`6` badge) — not a pitched note.
- **Click opens a modal editor** with an irregular local grid for member pitches/durations.
- **Members** are normal `TagRollNote`s with `tuplet: { groupId, actualNotes, normalNotes }`.
- **Sheet** prefers explicit groups; tick inference remains a fallback for legacy/imported data.

```text
Piano roll (binary)          Modal (tuplet grid)         Sheet / MusicXML
┌────────────────────┐       ┌──────────────────┐       ┌─────────────────┐
│ [=== 3 ===] band   │ click │ • • • equal slots│  →    │ tuplet bracket  │
│  (span = 1 beat)   │ ───►  │ pitches + lyrics │       │ type + ties     │
└────────────────────┘       └──────────────────┘       └─────────────────┘
```

---

## Phase 0 — Prerequisites (done)

Sheet path already supports:

- [x] `TagRollNote.tuplet` optional field + normalize
- [x] Infer 3:2 from equal atoms (`sheetTuplets.ts`)
- [x] VexFlow brackets + MusicXML `time-modification`

---

## Phase 1 — Data model + normalize + pure helpers

**Outcome:** Project can load/save tuplet containers; members stay in sync with `groupId`; no UI yet.

### Deliverables

- [x] `TagRollTuplet` type on `TagRollProject` (`tuplets: TagRollTuplet[]`)
- [x] Normalize / empty project defaults
- [x] Helpers: create container, slice member ticks, sync member `tuplet` tags, delete container (+ members), overlap checks
- [x] Migration: notes that already share `tuplet.groupId` → synthesize containers when missing

### Checklist

- [x] Types exported from `types.ts`
- [x] `normalizeTagRollProject` round-trips tuplets
- [x] Invalid / overlapping containers rejected or repaired with tests
- [x] Member notes outside span are clamped or flagged in tests
- [x] Unit tests: `tupletContainers.test.ts` (≥ create, delete, slice 3:2 and 6:4, overlap)

### Tests required

| Test | Asserts |
|------|---------|
| normalize empty | `tuplets: []` ✅ |
| normalize with tuplet | fields preserved ✅ |
| `memberTicksForTuplet` | 3 equal slices sum to `spanTicks` ✅ |
| `assertNoTupletOverlap` | same-part overlap fails ✅ |
| migrate from note.tuplet only | container synthesized ✅ |

---

## Phase 2 — Piano roll chrome (empty containers)

**Outcome:** Visible/selectable/resizable tuplet bands on the roll; no modal; sheet shows rests or silence in span until members exist.

### Deliverables

- [x] Draw dashed band + badge (`3`, `6`, or `a:n`) in `TagRollViewport` / lane painter
- [x] Hit-test distinct from notes
- [x] Compose tool or shortcut to drag a new span (default 3:2)
- [x] Move / resize with binary snap; part-isolated
- [x] Delete key removes container (+ optional orphan members policy)
- [x] Store actions: `addTuplet`, `patchTuplet`, `removeTuplet`

### Checklist

- [x] Does not change global snap grid
- [x] Cannot overlap another tuplet on the same part
- [x] Badge updates when `actualNotes` changes (`tupletBadgeLabel`)
- [x] Selection ring distinct from note selection
- [x] Undo/redo via document snapshot `tuplets`

### Tests required

| Test | Asserts |
|------|---------|
| hit-test | point in band → tuplet id; outside → null ✅ |
| resize snap | end tick on grid ✅ |
| overlap guard | second add rejected ✅ |
| render smoke | band present in canvas draw path (unit of draw helpers) ✅ |

---

## Phase 3 — Modal tuplet editor

**Outcome:** Click container → editor; enter/edit member pitches; write notes tagged with `groupId`.

### Deliverables

- [x] `TagRollTupletEditor` dialog (Vue)
- [x] Local equal-slot grid (`actualNotes` columns over `spanTicks`)
- [x] Presets: 3:2 (triplet), 6:4 (sextuplet), 5:4, custom
- [x] Add/remove/edit pitches per slot; optional lyrics
- [x] Apply writes/replaces member notes; Cancel discards
- [x] Optional: Hear plays members once

### Checklist

- [x] Opening editor does not mutate project until Apply
- [x] Apply replaces only notes with this `groupId` (plus new ones)
- [x] Empty slots → no note (or rest policy documented)
- [x] Changing preset re-slices ticks; ask before destroying pitches
- [x] Keyboard: Esc cancel, Ctrl/Cmd+Enter apply
- [x] Accessible: labelled controls + dialog role

### Tests required

| Test | Asserts |
|------|---------|
| apply 3:2 C-E-G | 3 notes, equal durs, same groupId ✅ |
| apply clears prior members | old groupId notes gone ✅ |
| cancel | project unchanged (draft-only until Apply) ✅ |
| preset 6:4 | 6 slots, span unchanged ✅ |

---

## Phase 4 — Sheet + MusicXML lock-in

**Outcome:** Authored containers always engrave as tuplets; inference only for untagged runs.

### Deliverables

- [x] `buildSheetRhythm` / resolve: prefer `project.tuplets` + member tags
- [x] Skip inference for notes with matching `groupId`
- [x] Empty container → full-span rest (or nothing) in that voice
- [x] MusicXML `time-modification` + tuplet start/stop from explicit groups
- [x] Playback scheduler uses member absolute ticks (already)

### Checklist

- [x] Triplet of eighths in one quarter → bracket + correct glyphs
- [x] Sextuplet → 6:4 written glyph (`tupletMemberDuration` / normalNotes)
- [x] Cross-barline container rejected or split (document choice: **reject** at create)
- [x] Lyric syllabics on members still work (prior MusicXML test)
- [x] Detect-only / inferred path still works without containers

### Tests required

| Test | Asserts |
|------|---------|
| explicit group engraving | `SheetRhythmEvent.tuplet` set, no spurious binary split ✅ |
| MusicXML | `actual-notes` / `normal-notes` / tuplet notations ✅ |
| empty container | measure still fills (rest) ✅ |
| inference skipped | tagged notes not re-inferred as different ratio ✅ |

---

## Phase 5 — Polish

- [ ] Copy/paste container + members as a unit
- [x] Dim member heads inside band on main roll (read-only preview)
- [x] Toolbar tool + shortcut (`T` drag)
- [ ] Seed / docs example with a tagged triplet
- [ ] Performance: many tuplets on long charts

### Tests required

| Test | Asserts |
|------|---------|
| copy/paste | new groupId, same relative pitches (deferred) |
| dim preview helper | member notes associated to container by groupId ✅ |

---

## Non-goals (this project)

- Changing the global roll snap to triplet mode
- Nested tuplets / tuplets inside tuplets
- Cross-part synced tuplets (each part owns its containers)
- GUI for arbitrary nested ratios beyond simple `actual:normal`

---

## Implementation order (executing now)

1. Phase 1 model + tests  
2. Phase 2 roll chrome + store  
3. Phase 3 modal  
4. Phase 4 sheet lock-in  
5. Phase 5 polish  

Every phase must leave tests green before the next starts.
