# Arranging Labs dock (Tag Studio companion)

> **Status:** Guided coach v2 — timeline pillars + Arrange/Review  
> **Created:** 2026-09-20  
> **Source prompt:** [`../arranging/docs/prompts/arranging-labs-dock-integration.md`](../arranging/docs/prompts/arranging-labs-dock-integration.md)

## Goal

Guided Harmonize companion in Tag Studio. **Pillars are assigned on the Coach lane** (labeled spans), not a raw tick list. Schemas stay separate via `tagRollBridge`.

## How it works

1. Labs → **Arranging** → Tag Studio → **Coach**
2. **Arrange / Review** modes — Review walks stacks/issues without pillars; Arrange needs pillars for ranked candidates
3. **Pillars** — Suggest → labeled bands on the Coach lane → select band → set root → Hear → Lock (Lock remaining only after one lock)
4. Gaps: uncovered melody lists Add pillar; Walk shows Add/Extend when a note has no coverage
5. **Walk** — Prev/Next, Next gap, Next issue; candidates preview on click, Apply/Replace; Hear/Why?
6. Lane: pillar bands + ring bars + VL line + issue dots (hover plain-language labels)

## Acceptance (usability pass)

- Lead-only: Suggest shows labeled spans; Lock → Walk has candidates under the span
- Full TTBB, no pillars: opens Review; can step issues without Suggest
- Uncovered note: Add pillar here / Extend previous — not a dead end
- No primary Auto-harmonize copy; Confirm-all is not the only lock path

## Out of scope (still)

- Pillar overlays inside TagRollViewport
- Full skill matrix beyond Arrange/Review

**Next:** [arranging-coach-full-surface.md](arranging-coach-full-surface.md) — P0–P7 plus **P0a** (wide mode-adaptive dock, pop-out, taller collapsible lane) and **P0b** (harmonic moments for held lead posts); adversarial gates per phase.
