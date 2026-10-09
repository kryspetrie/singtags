# Adversarial algorithm loop vs corpus — 2026-10-07

**Harness:** `web/src/domain/arranging/pathOptimize/adversarialCorpusLoop.test.ts` (5 passes)  
**Corpus:** Rylander *11 Chords*, Flinn *11 BBS Chords*, BAM voicing/bass, knowledge/19–21 (Bonnie / V7→I / Five Foot Two), Prietto doubling  
**Related:** [theory-weight-audit-2026-10.md](theory-weight-audit-2026-10.md) · [doc-code-deviations.md](doc-code-deviations.md)

Five fix-and-reprobe iterations. Each pass encodes manual claims as executable checks against Path Optimize / moment ranking.

---

## Loop summary

| Pass | Attack surface | Result | Fixes landed |
| --- | --- | --- | --- |
| **1** | Rylander finals, root doubles, Bonnie V7→I, Lead ^1 → major | **PASS** | (prior session) span/ranker/final costs |
| **2** | Lead ^3 → I7; Dom9 when Lead is 9; unforced minor; ugly 3rd doubles | **FAIL → PASS** | `phraseRoleAtMelodyIndex` no longer marks early notes of short phrases as `tag` |
| **3** | No hanging V7; Lead ♭7 → I7; circle V7→I highway | **FAIL → PASS** | V major under V pillar demoted; mid-register V7 variants; `TTBB_CLOSE_SPAN_MAX=21` |
| **4** | Bass climb; IV7 available; Basic SCF flood | **PASS** | (held after pass-3 fixes) |
| **5** | Five-Foot-Two-ish Risky circle flavor; Basic tonic major close | **PASS** | (held) |

**Final suite:** 98 tests green (`harmonize` + `pathOptimize` + coach opening + placeVoicing + adversarial loop).

---

## Bugs found (vs corpus)

### 1. Short phrases treated every note as song-final `tag`
**Symptom:** Lead on ^3 in a 2-note cell ranked **major** (final home) instead of **I7** (P1 / Prietto 4-PC).  
**Cause:** `nearEnd = index >= length - 2` made both notes of a pickup “tag.”  
**Fix:** `nearEnd` only on the true last onset (or last 8% by tick).  
**Corpus:** P1 mid-phrase Lead on 3/7 → Mm7.

### 2. Path Optimize picked **V major** instead of **V7**
**Symptom:** `I → V → I` with Lead ^1–^5–^1 became `major@0 → major@7 → major@0`.  
**Causes:**
- `homeTriad` boosted any primary major under Lead on 1/5 (including V).
- `diatonicFunction` treated V major = V7.
- Close-span cap rejected mid-register V7 (D3 under G4, span 21); only high-bass V7 remained; leap filter then preferred V major.

**Fixes:**
- `homeTriad` gated to I / IV (not V).
- V prefers `seventh`/`ninth` over bare major in `diatonicFunction`.
- `TTBB_CLOSE_SPAN_MAX = 21`; generator also emits mid-register variants when close shells park bass high.
- Soft `closedVoicing` / `registerHome` still prefer octave-or-tighter when both place (Bonnie F7 5713).

**Corpus:** knowledge/21 V7→I highway; BAM open 10th–12th blend.

### 3. Clamp bass-drop destroyed close Dom7 shells
**Symptom:** Bonnie F7 5713 flattened to span 21 after raising the hard cap.  
**Cause:** Drop allowed whenever `span ≤ TTBB_CLOSE_SPAN_MAX` (21).  
**Fix:** Drop only when result stays **≤ octave (12)**.

### 4. Leap filter score wipe (prior loop, still holding)
Jump-only re-sort had been wiping song-final major; score-primary sort + descending settle remain.

### 5. Root-doubled major under Lead ^3 lost to fifth-double
**Symptom:** Only close survivor was 5135 (fifth); 1531 (root) spans ~24.  
**Fix:** Triad span cap 24; major root-double gets a small `completeFourPart` **reward** (minor root-double stays a soft cost so i7 can win).

---

## Pass checklist (corpus anchors)

| Id | Claim | Status |
| --- | --- | --- |
| `ryl-final-major` | Rylander 99% major endings | PASS |
| `ryl-final-root-double` | Flinn/BAM/Prietto double root | PASS |
| `ryl-final-bass-15` | BAM bass on 1/5 | PASS |
| `bonnie-open-F7` / `bonnie-path-V7` | Bonnie / walkthrough V7→I | PASS |
| `mid-tonic-major` | Lead ^1 → major home | PASS |
| `lead3-I7` | Lead ^3 → I7 | PASS |
| `dom9-lead9-*` | Flinn Dom9 when Lead is 9 | PASS |
| `no-unforced-minor` | BAM/Flinn minor when called for | PASS |
| `no-ugly-third-double` | Rylander ugly 3rd | PASS |
| `no-hanging-V7` / `tonic-final-root` | Cadence grammar | PASS |
| `final-b7-I7` | Lead ♭7 forces I7 | PASS |
| `circle-V7-I` | knowledge/21 highway | PASS |
| `bass-returns-home` | Resist inversion climb | PASS |
| `iv7-available` | IV7 is BS7, not fake V7/of | PASS |
| `basic-no-scf-flood` | Basic classical highway | PASS |
| `fft-basic-tonic-major` | Basic readable close | PASS |
| `fft-risky-circle-flavor` | Risky III7/VI7/II7 color | PASS (soft) |
| `fft-risky-lands-tonic` | Risky still lands tonic | PASS |

---

## Intentional remaining deviations (unchanged product stance)

See [doc-code-deviations.md](doc-code-deviations.md) **P1–P6**. Notably Basic still leans classical I/V7/IV/ii vs Flinn’s full BS7 density; Dom9 omit-root-first remains editorial vs Rylander omit-5 “normally.”

---

## How to re-run

```bash
cd web && npx vitest run src/domain/arranging/pathOptimize/adversarialCorpusLoop.test.ts
```
