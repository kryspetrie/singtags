# Tag Studio — UX polish & thin patterns

> **Status:** In progress — Phases A–F implemented on `piano-roll`  
> **Created:** 2026-09-19  
> **Source:** Market piano-roll comparison + editor usability review (chrome density, discoverability, ghost notes, scale highlight, HUD).  
> **Related:** [tag-roll.md](tag-roll.md), [tag-studio-hardening.md](tag-studio-hardening.md)

**North star:** The roll dominates the viewport. Secondary tools live in overflow / rails. Status always answers “where am I / what is selected.” Snap stays continuous — no separate Quantize.

## Snap (confirmed)

Place, move, resize, playhead nudge, and expression placement use `snapTick(..., project.snapTicks)`. Grid selector is the only snap control.

## Out of scope (locked)

- Quantize / humanize
- Velocity / dynamics lane
- Collapse empty pitches
- Loop region (A/B)
- Pencil-vs-select tool modes (Compose implies paint; marquee covers select)

## Phases

| Phase | Goal | Status |
| --- | --- | --- |
| A | Fill-height stage, docked transport + status, toolbar overflow, mode segment, expression lane labels | Done |
| B | Marquee cursor/hint, kbd-in-tooltip policy, shortcuts Space/Enter lead, mute/solo on part chips | Done |
| C | Dashed ghost notes for non-active parts when Current only | Done |
| D | Tonality major-scale row highlight + More… toggle (`view.scaleHighlight`) | Done |
| E | Parts / Mixer as right rail drawers (one at a time) | Done |
| F | Pointer HUD + thin selection inspector (pitch/start/length/lyric) | Done |

## Key files

- [`web/src/views/TagRollEditorView.vue`](../../web/src/views/TagRollEditorView.vue) — layout, status bar, Esc→Compose from Lyrics
- [`web/src/components/tagRoll/TagRollToolbar.vue`](../../web/src/components/tagRoll/TagRollToolbar.vue) — edit strip + More…
- [`web/src/components/tagRoll/TagRollViewport.vue`](../../web/src/components/tagRoll/TagRollViewport.vue) — ghosts, scale shade, HUD events, marquee cursor
- [`web/src/lib/tagRoll/measureBeat.ts`](../../web/src/lib/tagRoll/measureBeat.ts), [`scaleHighlight.ts`](../../web/src/lib/tagRoll/scaleHighlight.ts), [`partGhosts.ts`](../../web/src/lib/tagRoll/partGhosts.ts)

## Adversarial checklist (post-ship)

1. Opening a project shows a dominant roll without Expand.
2. Current only: other parts dashed ghosts; hits only active part; harmonize ghosts still distinct.
3. Scale highlight off via More…; entry still allowed on out-of-key pitches.
4. Parts and Mixer never both open; Esc closes rail.
5. Status playhead / HUD / selection lyric stay honest with snap grid.
