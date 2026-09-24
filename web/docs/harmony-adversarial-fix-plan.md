# Plan: Fix adversarial Harmony / Coach UX gaps

Follow-up to the post-implementation adversarial review. Exit claim in
`harmony-sketch-success-gaps-plan.md` overstated success; this plan closes the
P0/P1 (and quick P2) gaps so Declared really means owned locked sketch.

## Goals

1. **Declared = locked owned only** — Coach drafts must not look (or count as) Declared.
2. **Strip chrome vs pitch** — collapsed Harmony chip must reserve dead space or sit outside the pitch plane.
3. **Entry honesty** — Roman °7/ø/dim7 parse; unknown names must not silently become major.
4. **Consistent declare** — strip span window aligns with inspect range / melody when available; Harmonize Chord-only can declare any catalog quality (lead filter only for stacks).
5. **Preselect integrity** — Sketch chip and selected chord stay consistent.
6. **Light P2** — close quality menu after chip; stable detect ids; suggest a11y hooks.

## Non-goals

- Removing Coach Propose entirely (keep as helper; change how drafts surface).
- Full MuseScore span drag/split/merge.
- Demoting Pillars “Add at playhead” entirely (demote copy / Advanced only if cheap).

---

## Workstreams

### W1 — Declared truth (P0)

| ID | Change |
|----|--------|
| W1a | `authoritativeSketch` = **locked only** (`locked === true`). Unlock coach drafts out of Declared. |
| W1b | `pillarsFromHarmonySketch` / strip declared rows / scheduler Hear use locked-only. |
| W1c | Detect row may show unlocked coach drafts as **dashed draft** OR keep them only in Coach until Lock — prefer: drafts stay coach-only until locked (simplest). `replaceSketchFromPillars` should only write **confirmed** pillars as locked spans; unconfirmed pillars do not create sketch spans (or write unlocked and strip ignores them). |
| W1d | Strip UI: declared cells use `locked` class only when `seg.locked`; optional `draft` styling if we ever show drafts. |
| W1e | Tests: unlocked coach not in declared; Lock pillar → locked sketch → Declared. |

**Decision:** Unconfirmed pillars do **not** upsert into `harmonySketch`. Only `confirmed` pillars write locked spans via `replaceSketchFromPillars`. Propose stays coach-session-only until Lock.

### W2 — Collapsed strip layout (P1)

| ID | Change |
|----|--------|
| W2a | When collapsed, reserve `TAG_ROLL_HARMONY_STRIP_COLLAPSED_H` (~28px) in `harmonyStripH` / tote gutter / `headerExtraH`. |
| W2b | Collapsed chip sits in that reserved band (not over notes). |

### W3 — Parse & entry honesty (P1)

| ID | Change |
|----|--------|
| W3a | `parseRomanToSketch`: match `°7`/`dim7`/`ø7`/`ø` **before** bare trailing `7`. |
| W3b | `parseChordNameToSketch`: unknown rest → `null` (not silent major). |
| W3c | Strip commit: if parse null, snackbar/info and do not write. |
| W3d | Tests for `vii°7`, `viiø`, `viidim7`, `Gsus`→null. |

### W4 — Span window consistency (P1)

| ID | Change |
|----|--------|
| W4a | `defaultSketchWindow`: if `chordCursor` inspect range active, use it; else if melody note under playhead, use that note’s window; else playhead→+1 measure. |
| W4b | Shared helper in `harmonySketch.ts` so Harmonize + strip stay aligned. |

### W5 — Harmonize Chord-only vs lead filter (P1)

| ID | Change |
|----|--------|
| W5a | Chord-only mode: offer **full** `BARBERSHOP_CHORDS` list (no `chordContainsLead` filter). |
| W5b | Chord+stack: keep lead-contains filter (voicing requires it). |
| W5c | Preselect: if sketch quality not in filtered list (stack mode), keep chip + allow Chord-only apply; do not clear `chordId` when applyMode is `chord`. In stack mode, if lead ∉ chord, clear voicing but keep chordId for display / suggest switch tip. |

### W6 — P2 polish

| ID | Change |
|----|--------|
| W6a | Close segment menu after `setQuality`. |
| W6b | Stable detect hole ids: hash from `startTick|endTick|rootPc|quality` instead of `allocatePrefixedId` each rebuild. |
| W6c | Entry `aria-controls` + `aria-expanded` wired to teleported listbox id. |
| W6d | Chrome `overflow-x: auto` instead of clipping tools on narrow widths. |

### W7 — Pillars competition (light)

| ID | Change |
|----|--------|
| W7a | Rename/relabel “Add at playhead” hint: “Draft root (Lock to declare on strip)” or move under Advanced if already structured that way. |

---

## Execution order

1. W1 (truth) + tests  
2. W3 (parse) + tests  
3. W4 (windows)  
4. W5 (Harmonize)  
5. W2 (collapsed height)  
6. W6 + W7  
7. Adversarial re-scan  

## Exit evaluation (post-implementation)

| ID | Result | Evidence |
|----|--------|----------|
| W1a–e | **Pass** | Locked-only authoritative; unconfirmed skipped; migrate confirmed-only (no draft force-promote) |
| W2a–b | **Pass** | Collapsed reserve height |
| W3a–d | **Pass** | Roman dim7/ø; null unknown names |
| W4a–b | **Pass*** | Strip uses shared window helper; Harmonize intentionally melody-note window (hand tool) |
| W5a–c | **Pass** | Chord-only full catalog; preselect keeps chordId |
| W6a–d | **Pass** | Menu close; stable detect ids; a11y; chrome scroll |
| W7a | **Pass** | Draft at playhead copy |

**Exit summary:** Prior P0/P1 closed including migrate draft leak. Harmonize vs strip window difference is intentional (note tool vs phrase map).
