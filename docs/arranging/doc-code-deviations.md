# Documentation ↔ implementation deviations

**Date:** 2026-09-19 (remaining mismatches addressed)  
**Docs:** `knowledge/` (esp. 01, 02, 06, 07, 12, 13, 18, 20, 21)  
**Code:** `web/src/domain/arranging/`  

Tracks **claims vs behavior**. Soft heuristics that docs already label as coaches are noted separately.

---

## Fixed (doc hygiene + remaining sync)

| Id | Issue | Fix |
| --- | --- | --- |
| **D10** | Dom9 omit preference / Prietto attribution | Omit-root first; glossary + lessons cite Prietto/BAM vs Rylander |
| **D12** | `few-sevenths` ignored Dom9 | Count `seventh \|\| ninth` |
| **D9** | Counterpart `scfGroup: 5` | `scfGroup: null` + `R3_tritone` |
| — | Raised-root counterpart reason | Branch 3/7 / ♯1 / ♭5 |
| **D7** | Dim7 up→m6; dual-root engine story | `m6RootsFromDim7`; docs note escape helpers + coaching |
| **D5** | “Filter” vs soft rank | Docs + comments: rank/coach; soft emit without tags |
| **D6** | R5 into seventh target | `scoreRootMotion(..., { targetIsSeventh })` −3 soft penalty |
| **D11** | Ring tier vs LCD prose | [12](../knowledge/12-eleven-chords-ji.md) matches `RING_TIER` |
| **D13** | Distance-from-home | `distanceFromHome()` + note in [21](../knowledge/21-circle-of-fifths.md) |
| — | Outer parallel 5ths | Heavier message/weight for tenor–bass |
| — | Bare `degN` Romans | Chromatic maps for major/minor leftovers |

### Earlier critical sync (still hold)

D1–D4, D8, D15 (prevNatureId / isBs7Nature / I7 / raised-root gate / S13 maj7 / SCF G1 ninth).

---

## Remaining (intentionally soft / teaching-only)

| Id | Topic | Notes |
| --- | --- | --- |
| **D7** residual | Full R4 dual-root *motion* classifier | Escape helpers + lints only — enough for MVP |
| **D14** | Minor pure/color highways | Doc pedagogy; springboard + RN in code |
| Density thresholds | App ~30% chord-count vs BAM >35% duration | Docs already distinguish coach vs statute |

---

## Strong alignments

Springboard I/IV; SCF map; SAI-11/BHS; I7/II7/IV7; Dom9 dual omit; dim7 escapes; JI ≈−31¢; counterpart gate; S13 maj7; R5 soft non-7th preference; Stevens distance helper; soft R1–R5 ranking.

---

**Related:** [source-claim-audit.md](source-claim-audit.md) · [22-adversarial-doc-review.md](../knowledge/22-adversarial-doc-review.md)
