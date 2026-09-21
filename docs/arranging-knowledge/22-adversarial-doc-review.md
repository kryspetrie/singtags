# Adversarial documentation review (2026-09-19)

**Scope:** `knowledge/` teachable corpus after multi-key charts, circle chapter, walkthrough, troubleshooting.  
**Goals:** correctness, structure, usefulness for AI + beginner / mid / advanced humans.  
**Actions:** reordered reading path (filenames stable); fixed critical/medium issues; unified Path footers; declared sources of truth.

---

## Verdict

| Dimension | Grade | Notes |
| --- | --- | --- |
| **Correctness** | A− after fixes | Critical distance-prose bug fixed; SCF G5 wording fixed; table separators fixed |
| **Structure** | B+ after reorder | Parts I–VIII + MVP; filenames ≠ chapter order (by design) |
| **Beginner** | B+ | MVP + glossary + B♭ walkthrough; still dense if they ignore MVP |
| **Mid-level** | A− | Circle + method + troubleshoot is the payoff |
| **Advanced** | B+ | R2–R5 / Prietto / 17 strong; adjudication craft thin on purpose |
| **AI / RAG** | B+ | SoT per Part; keep product docs in Part VIII |

**Bottom line:** Following **Parts I→V** (or the **MVP** line in [00-index.md](00-index.md)) is enough to jumpstart a mildly theory-literate arranger through a first chart and technical repairs. Reading by filename number is **not**.

---

## Critical / medium findings

### Fixed this pass

| Sev | Issue | Fix |
| --- | --- | --- |
| **Critical** | [21](21-circle-of-fifths.md) defined distance as “fifths counterclockwise from I” (implies F = dist 1) | Distance = **descending-fifth steps back to I** (G=1, D=2, …) |
| **Critical** | [06](06-approach-three-rules.md) “Five Foot Two” chain was `I→II7→VI7…` / `C→D7→A7…` (retro at D7→A7) | Restored **I→III7→VI7→II7→V7→I** / `C→E7→A7→D7→G7→C` |
| **Critical** | [06] dim7 dual-root labeled `C♯°7` for `F♯°7` family | Corrected to **C°7 → G via P5↓** |
| **Critical** | Minor “highways” in [13](13-szabo-theory.md)/[18](18-chord-charts-by-key.md)/[21](21-circle-of-fifths.md) treated `F7→B7` (etc.) as Co5 | Split into **pure Co5** models vs **R3-labeled** color paths |
| **Medium** | [21] BS7 3rd “into that chord’s 3rd” | Clarified: 3rd leads to **following root** |
| **Nit** | [18] `A+` = `A C♯ F` | Prefer **`A C♯ E♯ (=F)`** |
| **Medium** | [02](02-chord-vocabulary.md) SCF G5 called “counterpart of V7 family”; B♭ G5 “tritone from F” | G5 = tritone **from pillar**; B♭ → E7; clarified vs R3 |
| **Medium** | Prev/Next fought the index (`10→05`, circle after R-rules, etc.) | Unified **Path** footers along Parts I–VII |
| **Medium** | Competing SoT (12/18 construction; 13/21 circle; 06/21 R1) | SoT declared in [00-index](00-index.md); 18/13 point at 12/21 |
| **Nit** | Broken markdown `|---|` column counts in [18](18-chord-charts-by-key.md) | Aligned |
| **Structure** | No beginner onboarding / glossary | Mini glossary + MVP in 00; min-prior box on [19](19-melody-to-arrangement.md) |
| **Structure** | Approach One before Approach Two in an earlier draft path | Final path: **05 → 04 → 06** |
| **Structure** | Charts before circle in an earlier draft | Final path: **12 → 21 → 18** |

### Accepted risks / follow-ups

| Sev | Issue | Status |
| --- | --- | --- |
| Medium | Residual duplication (Dom9 omit in 12/14/18) | Acceptable; 12 owns rule, 18 owns charts |
| Low | JI cents early in 12 | **Done** — cents table moved below contest eleven |
| Low | R2–R5 depth / early wizard crosstalk in 21 | **Done** — §§8–9 marked “return after Part IV / 06” |
| Low | Eng-first openers (02 IDs, 05 product map, 01 gate wall) | **Done** — PCF/SCF first; product map end; tritonal teaser before S-gates |
| Low | Contest adjudication / lyric craft | Out of scope |
| Optional | One-page “first evening” cheat sheet | Still open |

### Correctness strengths (held under adversarial pressure)

- IV7 ≠ secondary dominant of a diatonic triad  
- Dom9 omit root (bass 5) or omit 5 (bass 1); keep 3/♭7/9  
- Springboard I/IV; IV→I cadential up-fifth ≠ random retro  
- Dual labels I7 / V7/V policy  
- Multi-key spellings sampled (B♭/F/E♭/…)  
- B♭ walkthrough: E♮ as 3 of C7 → F7 → B♭  

---

## Final reading spine

See [00-index.md](00-index.md). Core order:

`01 → 10 → 12 → 21 → 18 → 13 → 03 → 02 → 05 → 04 → 06 → 07 → 19 → 20 → 14 → 08 → 11 → (17) → (16/09/15)`

**MVP:** `01 → 10 → 12 → 21 → 03 → 05 → 07 → 19` (+ `20`)

Filenames were **not** renumbered (domain `@see` links).

---

## Audience summary

| Audience | Use the docs how? |
| --- | --- |
| Beginner | MVP → [19](19-melody-to-arrangement.md) → [20](20-troubleshooting.md); backfill 18/02/04/06 |
| Mid | III–V deeply; bookmark 20 + 18 |
| Advanced | 06, 14, 17; 18 as dictionary |
| AI | Part SoT columns; exclude 09/15/16 from craft answers unless asked |

---

**Path:** [Index](00-index.md)
