# Documentation ↔ implementation deviations

**Date:** 2026-10-07 (finals / doubling sync + intentional product gaps)  
**Docs:** `docs/arranging-knowledge/` (esp. 01, 02, 06, 07, 12, 13, 18, 20, 21)  
**Code:** `web/src/domain/arranging/`  
**Audit:** [theory-weight-audit-2026-10.md](theory-weight-audit-2026-10.md)

Tracks **claims vs behavior**. Soft heuristics that docs already label as coaches are noted separately.

---

## Fixed (2026-10-07 theory audit)

| Id | Issue | Fix |
| --- | --- | --- |
| **D16** | Cadence/tag / song finals preferred I7 over major | `finalComplete` + `songFinalHome` + Detected `phraseEnd*` now prefer **major/minor** home unless Lead is on ♭7 (Rylander ~99% major endings) |
| **D17** | Triad doubling preferred Lead PC | `triadDoubleKind` + `completeFourPart` / path costs prefer **root** doubles; demote doubled major 3rds (Flinn/BAM/Prietto/Rylander) |
| **D18** | Basic blocked Dom9 entirely | Basic allowlist includes `ninth`; `colorChordPenalty` still demotes unless Lead is the 9th (Flinn predominant Dom9) |

### Earlier fixed (still hold)

D1–D4, D5–D13, D15 (prevNatureId / isBs7Nature / I7 naming / raised-root gate / S13 maj7 / SCF G1 ninth / Dom9 dual omit / ring tier / …).

---

## Remaining intentional deviations

| Id | Topic | Manuals say | App does | Why |
| --- | --- | --- | --- | --- |
| **P1** | Mid-phrase I7 vs triad | Major home when Lead is 1/5; I7 when Lead is 3/7 | Lead on 1/5 → major; Lead on 3/7 → I7 (4-PC). I7/IV7 with Lead on 1/5 get **no** 4-PC reward; V7 keeps it | Matches manuals on homes; keeps BS7 color when Lead carries 3/7 or sings V’s root |
| **P6** | Basic “close” vs BAM open | BAM also uses open (10th–12th) as good default blend | Basic hard-filters outer span ≤ 21 (`TTBB_CLOSE_SPAN_MAX`) when spread off; soft `closedVoicing` still prefers ≤ octave | Product: V7 Lead-on-root with bass on 5 needs ~21; tighter caps forced high V7 / V major. Spread still waits for risk > 0.4 |
| **P7** | Bari above vs below Lead | Close SSAA often bari above Lead; TTBB medium more below | Placement prefers bari below Lead when legal; unisons forbidden | Product: men’s TTBB Basic home stack; Risky may open |
| **P2** | Basic “barbershop density” | Flinn predominant = major + BS7 + Dom9; BAM >35% BS7 | Basic leans **classical** I / V7 / IV / ii7 via `diatonicFunction`; Dom9 only when Lead is 9 | Coach Basic = readable highway; Risky unlocks color flood |
| **P3** | Approach Three legality | BAM teaches progression rules | Engine mostly **soft-ranks** (not hard-rejects) | Teaching coach; hard bans stay for profile allowlist / S13 |
| **P4** | BS7 density lint | BAM >35% *duration* | App ~30% *chord-count* coach | Soft coach, not contest statute |
| **P5** | Dom9 omit preference | Prietto omit-root “most common”; Rylander omit-5 “normally” | Voicing table: **omit-root first**, omit-5 second | Both legal; preference is editorial (documented) |
| **D7** residual | Full R4 dual-root *motion* classifier | Escape helpers in prose | Helpers + lints only | Enough for MVP |
| **D14** | Minor pure/color highways | Pedagogy in Szabo/BAM | Springboard + RN in code | Teaching depth deferred |

---

## Strong alignments

Springboard I/IV; SCF map; SAI-11/BHS; I7/II7/IV7 naming; Dom9 dual omit; dim7 escapes; JI ≈−31¢; counterpart gate; S13 maj7; R5 soft non-7th preference; Stevens distance helper; soft R1–R5 ranking; **tonic major finales**; **root-doubled triads**; bass on 1/5.

**Ades *Choral Arranging* Ch.1 (soft, TTBB-adapted):** `upperTrioClose` (bari/lead/tenor ≤ octave), `postLeapDirection` (change direction after leap > 3rd), `hazardousLeap` (↑A4 / ↓d5 in non-Lead parts). See `partWritingCosts.ts`. Parallel 5ths/8ves stay soft (`parallelPenalty`) — barbershop often wants rugged parallels.

---

**Related:** [source-verification.md](source-verification.md) · [theory-weight-audit-2026-10.md](theory-weight-audit-2026-10.md) · [adversarial-algo-loop-2026-10.md](adversarial-algo-loop-2026-10.md) · [22-adversarial-doc-review.md](../arranging-knowledge/22-adversarial-doc-review.md)
