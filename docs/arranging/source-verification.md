# Source verification — knowledge/code vs BAM / Szabo / Rylander / Prietto

**Date:** 2026-09-19  
**Sources:** `work/ocr/` (BAM 1980), `work/ocr_extra/szabo*`, `rylander_11_chords.txt`, `prietto_arranging.txt`  
**Focus:** Recent theory fixes + core highway claims.

**Full claim-by-claim audit:** [source-claim-audit.md](source-claim-audit.md) (all teachable chapters; **0 FAIL**).

OCR quotes are abbreviated; page paths are the evidence anchors.

---

## Scorecard

| Claim (our docs/code) | Source | Verdict |
| --- | --- | --- |
| Five Foot Two = **I→III7→VI7→II7→V7→I** (C→E→A→D→G→C) | BAM `work/ocr/p220.md` roots; Prietto distance E7 = 4 away | **PASS** |
| Old doc/code bug `I→II7→VI7…` / C→D7→A7 | Same OCR Romans garbled (`TI?`/`U7`); roots still show **E then A** | Bug was OCR/transcription; **fix matches source** |
| Springboard I & IV free leaps | BAM `p219.md` | **PASS** |
| R2 usually BS7, occasionally 9th (not m7) | BAM `p222.md` | **PASS** (`isBs7Nature`) |
| R3 gate: 3rd, 7th, **raised root**, lowered 5th | BAM `p226.md`, `p256.md` | **PASS** (raised-root fix) |
| R5 = BS7 → root M3 up; classic ♭VI7→I | BAM `p234.md` | **PASS** |
| R5 “target has no 7th” | BAM `p235`: Ex. 26–27 target “has no seventh”; Ex. 28 ≠ R5 when target is a 7th holding move | **PASS** as classic rule; soft engine gate still fine |
| SCF G5 = tritone from pillar root | BAM `p174.md` (“three whole steps”) | **PASS** |
| IV7 commonly → I; not “V7 of a diatonic triad” | Szabo `p017.md` / theory.txt | **PASS** |
| Secondary dominants = Mm7 on non-V; resolve P5↓ | Szabo `p015–016` | **PASS** |
| Prefer label **I7** (alt V7/IV) for tonic Mm7 | Szabo writes **I7**-class symbols for Mm7 on I; classical V7/IV is teaching alt | **PASS** (policy matches Szabo naming) |
| Dom9: omit one tone; keep 3/♭7/9 | Prietto ~L896–900 | **PASS** |
| Dom9: which omit is “most common”? | **Prietto:** omit **root** most common; **Rylander:** normally omit **5th** | **SOURCE SPLIT** — both legal; preference order is editorial |
| Maj7 allowed m2 (S13 exception) | Rylander: maj7 *only* allowed chord with m2; BAM style def bans m2 chords without naming maj7 carve-out | **PASS vs Rylander**; BAM official def is stricter/absolute |
| Dim7: drop a tone → BS7 on that pitch | Rylander ~L228–229 | **PASS** |
| Harmonic ♭7 = 7/4 (≈ −31¢ vs ET) | Rylander f.not 7/4 | **PASS** (cents are derived) |
| Stevens distance: G7=1 … E7=4 | Prietto Circle / Stevens list | **PASS** |
| m7 ≠ V7 / secondary-dominant label | Szabo separates m7 from Mm7 secondary dominants | **PASS** |

---

## Evidence highlights

### BAM — Five Foot Two (`p220.md`)

OCR Romans are mangled (`I . TI? VI7 U7 . V7 I`), but **roots** read:

> `C` … `E` … `A` … `D` … `G` … `C` (with P5 markers)

That is **I → III7 → VI7 → II7 → V7 → I**, not I→II7→VI7. Prietto independently: *Five Foot Two* chord is **E7** (“4 chords away”).

### BAM — Counterpart gate (`p226.md`)

> “melody note is on the third, seventh, raised root, or lowered fifth of the chord.”

Matches `leadAllowsCounterpartSwap` after the raised-root fix.

### BAM — R2 unlock (`p222.md`)

> “usually limited to the barbershop seventh and occasionally the ninth chord.”

Excluding `m7` from motion unlock matches source.

### Rylander vs Prietto — Dom9 omit preference

| Source | Preference |
| --- | --- |
| Rylander §2.6 | “Normally … leave out the **fifth**” |
| Prietto | “most common tone to omit is the **root**” |

Both require 3, ♭7, 9 present. Our engine supports both strategies; “which is commoner” should not be asserted as a single absolute without citing which org text.

### BAM style definition (`p016.md`) vs Rylander maj7

Official BAM definition: chords with minor seconds “are not used,” while sixth/ninth/maj7 are “avoided except where demanded by the melody.” Rylander explicitly allows maj7’s chord-tone m2. Contest practice follows the Rylander carve-out; our VL exemption matches that.

---

## Residual gaps vs source (not regressions)

1. **Dom9 omit preference** — cite Prietto *and* Rylander; don’t claim one “most common” without attribution ([12](../knowledge/12-eleven-chords-ji.md)).  
2. **Approach Three as hard reject** — BAM teaches rules for progression; our engine mostly **ranks**. Soft vs “illegal” language remains a product choice.  
3. **OCR quality** — engraved examples (e.g. Ex. 1 Romans) are unreliable; prefer root lists and Prietto/Stevens prose when OCR conflicts.  
4. **Density** — BAM states **>35%** BS7s (`p025`); app `~30%` lint is product coach.

---

## Verdict

Recent code/doc sync (**III7 chain, raised-root R3, I7 primary, BS7/9-only R2 unlock, maj7 m2, SCF G1 7/9**) is **supported by the source OCR**, not only by our knowledge paraphrase.

Largest source-internal tension to remember: **Dom9 omit-root (Prietto) vs omit-5 (Rylander “normally”)**.

**Related:** [doc-code-deviations.md](doc-code-deviations.md) · [knowledge/22-adversarial-doc-review.md](../knowledge/22-adversarial-doc-review.md)
