# Source-claim audit — knowledge ↔ BAM / Szabo / Rylander / Prietto

**Date:** 2026-09-19  
**Corpus:** `knowledge/01`–`14`, `18`–`21` (teachable theory). Meta/product files `00`, `09`, `15`–`17`, `22` scored only where they restate theory.  
**Sources:** `work/ocr/` (BAM 1980), `work/ocr_extra/szabo*`, `rylander_11_chords.txt`, `prietto_arranging.txt`  
**Method:** ~520 claimish lines inventoried; chapter agents + local OCR spot-checks; chord-chart spellings validated programmatically (0 interval errors).

**Verdict key:** PASS · FAIL · PARTIAL · NOT_FOUND · PRODUCT · SOURCE SPLIT

---

## Executive scorecard

| Bucket | Approx. count | Meaning |
| --- | --- | --- |
| **PASS** | ~190+ | Supported by OCR |
| **PARTIAL** | ~35 | Soft/interpretive/synthesized vs absolute wording |
| **NOT_FOUND** | ~10 | Teaching gloss without OCR sentence |
| **SOURCE SPLIT** | 1 major | Dom9 omit preference |
| **FAIL** | **0** | No sourced contradiction that requires a doc rewrite |
| **PRODUCT** | many | App lints, ranking, profiles |

**Bottom line:** Documentation claims track the source PDFs. No FAIL-class factual errors found. Remaining work is attribution hygiene (Dom9), a few PARTIAL wordings, and product vs statute clarity.

Related: [source-verification.md](source-verification.md) (earlier fix-focused scorecard) · [doc-code-deviations.md](doc-code-deviations.md)

---

## Corrections to prior verification notes

| Earlier note | Update |
| --- | --- |
| Density ~35% / ~⅓ “unsourced” | **PASS** — BAM `work/ocr/p025.md`: “more than **35 percent** barbershop sevenths… some… **60 percent**.” `~⅓` is paraphrase; app `~30%` lint is **PRODUCT**. |
| R5 “no seventh target” soft-only | **PASS** as classic rule — BAM `p235`: “the chord being progressed to **has no seventh** in it” (Ex. 26–27). Ex. 28 clarifies M3-into-7th can be holding, not R5. |

---

## By chapter

### 01 — Style definition

| Claim | Verdict | Evidence |
| --- | --- | --- |
| S1–S3 four parts, unaccompanied, melody in lead | **PASS** | BAM `p016` official definition |
| S6–S8 tenor above; bass lowest; bari either side | **PASS** | `p016`, `p019`–`p020` |
| S9 major/minor/BS7 featured | **PASS** | `p016` |
| S11 resolve primarily on Circle of Fifths | **PASS** | `p016`, `p025` |
| S12 sixth/maj7/ninth when melody demands | **PASS** | `p016` |
| S13 no m2 **except maj7 chord tones** | **PARTIAL** | BAM: m2 “are not used” (`p016`); maj7 allowed fleetingly (`p032`) and *contains* m2; carve-out is interpretive / matches Rylander §2.3 |
| S16 JI / expanded sound | **PASS** | `p016` enharmonic pitch adjustment |
| S4 “homophonic” | **PARTIAL** | Same idea via four-part-for-every-melody-note; word not in OCR |
| S10 SAI “primary colors” | **PARTIAL** | SAI naming in Prietto, not BAM |
| ~35%+ BS7 density | **PASS** | `p025` |
| App ~30% soft lint | **PRODUCT** | — |
| Explicit B→C / F→E resolve gesture | **NOT_FOUND** | CoF/BS7 resolution present (`p025`–`p026`); gesture is standard Mm7 teaching |
| Lead often 3rd/root; tenor often 5th/3rd at cadences | **NOT_FOUND** | Role definitions only |

### 02 — Chord vocabulary / SCF

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Melody roles 1/3/5/6/7/9 | **PASS** | BAM Approach Three `p219` |
| PCF = chords on X (dim7 → SCF G2) | **PASS** | Approach Two SCF chapter |
| G1 = P5 above X (V of X); natures ≈ PCF minus maj7/add9/madd6/add6 | **PASS** | `p168`–`p169` |
| G2 = dim7 on X | **PASS** | `p170` |
| G3/G4 = BS7 ½ below / above X (occ. 9) | **PASS** | `p171`, `p173` |
| G5 = BS7 tritone (“three whole steps”) from X | **PASS** | `p174` |
| G6 = subdominant function; IV + ♭VI | **PASS** | `p175` |
| G5 ≠ “the V7 counterpart” (R3 separate) | **PASS** | Teaching clarification; R3 in `p223`+ |
| Prefer BS7/maj/min; defer 6/9/maj7 | **PASS** | `p016` + Approach Two prefer language |
| Double root on plain triads | **PASS** | BAM voicing + Prietto |

### 03 — Harmonic rhythm

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Pillars vs embellishing chords; don’t shove pillars off clock | **PASS** | BAM HR `p080`–`p085` |
| Strong-beat preference; recover if weak | **PASS** | Same chapter |
| Uptempo slower HR / ballad faster | **PASS** / **PARTIAL** | Pattern matches teaching; exact tempo table is distillate |
| Worked 8-bar C sketch | **PARTIAL** | Family matches Ex. patterns; exact grid is pedagogical |
| Am sketch | **NOT_FOUND** in HR pages | V7→minor appears later (`p231`) |

### 04 — Approach One

| Claim | Verdict | Evidence |
| --- | --- | --- |
| NCD / chord-tone membership framing | **PASS** | BAM Approach One tables |
| Decision sketch bridging into PCF/SCF | **PARTIAL** | Synthesizes Approach Two into A1 pedagogy |

### 05 — Approach Two (9 steps)

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Steps I–IX content (pillars → PMN/PCF → SMN → SCF → alts → variety → voicing → climax) | **PASS** | `p182`–`p215` |
| Model song *The Pal That I Loved…*; Bb pillars | **PASS** | `p182`, `p188` |
| Common pitfalls (wrong-key symbols, no return on strong beat, Step VIII stuffing) | **PASS** | Across Approach Two OCR |
| Knowledge Step II/III vs BAM OCR “STEP II” for PMN | **PARTIAL** | Content OK; Roman labels disagree (OCR/knowledge renumber) |

### 06 — Approach Three (R1–R5)

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Springboard I & IV | **PASS** | `p219`, `p256` |
| R1 P5 above/below; descending fifths highway | **PASS** | `p220`–`p221` |
| Five Foot Two **I→III7→VI7→II7→V7→I** | **PASS** | `p220` roots C–E–A–D–G–C (OCR Romans garbled) |
| R2 chromatic ½; usually BS7/occ. 9 | **PASS** | `p222` |
| R3 counterparts; swap ≠ progression; gate 3/7/raised root/♭5 | **PASS** | `p223`–`p226`, `p256` |
| R4 dim7 progress / anticipate / hold; 3 PC-sets; dual-root | **PASS** | `p229`–`p234` |
| Raise BS7 root → dim7; lower dim7 tone → BS7 | **PASS** | `p232` |
| R5 M3 up from BS7; classic ♭VI7→I; target no 7th | **PASS** | `p234`–`p235`; summary `p256` (“target containing no seventh”); `p247` |
| Bb7→D7 toward Eb = holding, not R5 | **PASS** | `p235` Ex.28 |
| Retrogression usually one family group | **PASS** | `p228` |
| Mistake list (over-engineering, tempo, static pillars, 7th too soon, …) | **PASS** | `p224`, `p240`, `p245`–`p249`, … |
| Engine ranking weights | **PRODUCT** | — |

### 07 — Voicing / voice leading

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Close ≤ octave; open 10th–12th; spread; homogeneous; divorced | **PASS** | `p260`–`p264` |
| Preference homogeneous → divorced bass → spread/divorced tenor | **PASS** | `p264` |
| “Chinese seventh” as open / near divorced-bass | **PASS** | `p260` footnote |
| Double root; avoid doubled major 3rd | **PASS** | BAM + Prietto |
| Parallel P5 soft (esp. outer voices caution; not hard ban) | **PASS** | `p284`–`p288` |
| Dom9 omit root or 5th; keep 3/♭7/9 | **PASS** | Prietto ~L896–900; BAM Dom9 pages |
| App lint severities | **PRODUCT** | — |

### 08 / 10 / 11 — Embellishments, song form, intros/tags

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Swipes after block chart; fit meter | **PASS** | BAM swipe chapter `p343`+ |
| Melody gates (range, conjunct, Sol→Sol, …) | **PASS** | BAM `p042`–`p046` |
| Phrase lengths / AABA-family; avoid odd phrase counts | **PASS** | BAM `p075` |
| Tags/intros Co5 skeleton; key lifts | **PASS** | BAM `p371`+; Prietto key-change ~L2405+ |
| Exact TTBB lead MIDI band; “hitch = cheap” | **PARTIAL** | Range discussed; “cheap” is gloss |

### 12 — Eleven chords / JI (Rylander)

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Contest eleven + construction formulas | **PASS** | Rylander §2 |
| BS7 = 4:5:6:7; ♭7 = 7/4 ≈ −31¢ | **PASS** | Rylander f.not; cents derived |
| Maj7 only contest chord with chord-tone m2 | **PASS** | Rylander §2.3 |
| Dom9 five tones → omit one; keep characteristic tones | **PASS** | §2.6 |
| Omit-root labeled “(common)” without Rylander dissent | **SOURCE SPLIT** | Prietto: omit **root** most common; Rylander: normally omit **5th** |
| Dim7 escape: drop tone → BS7 | **PARTIAL** | Rylander: down→BS7 **or** up→m6; docs only teach down |
| Multi-key V7→I spellings | **PASS** | Programmatic + spot-check |

### 13 — Szabo

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Free chords I/IV; P5 law | **PASS** | Szabo free-chord / P5 sections |
| Secondary Mm7 map; prefer **I7** (alt V7/IV); II7 ↔ V7/V | **PASS** | Szabo secondary-dominant chapter |
| IV7 not “V7 of a diatonic triad” | **PASS** | Szabo IV7 discussion |
| `m7` never labeled V7 | **PASS** | Structure: secondary dominants are Mm7 |
| Five Foot Two chain | **PASS** | Matches BAM roots |
| Pure Am `F♯7→B7→E7` highway as Szabo quote | **NOT_FOUND** | Keep as teaching; don’t pin on Szabo |

### 14 — Prietto practice

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Strong bass root/5th; Dom9 omit→bass map | **PASS** | Prietto voicing ~L623–900 |
| Theory primary ≠ SAI primary | **PASS** | ~L494–496 |
| QA / manuscript / SAI vs BHS | **PASS** | Contest / assessment chapters |
| Stevens distance song examples (Coney=2, Way=3, Five Foot=4) | **PASS** | ~L314–316 |

### 18 — Chord charts by key

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Interval spellings for natures across keys | **PASS** | 0 mismatches in automated check |
| Membership / RN / Co5 teaching overlays | **PASS** | Aligns with 02/12/13/21 |

### 19 — Melody→arrangement / 20 — Troubleshooting

| Claim | Verdict | Evidence |
| --- | --- | --- |
| B♭ walkthrough (pillars, Co5, voicing, swipe) | **PASS** | Applied teaching from BAM/Prietto/Szabo |
| Playbook rows tied to hard grammar | **PASS** | Where mapped to sources |
| Soft engine items (R5 soft gate, parallel soft, lint IDs) | **PRODUCT** / **PARTIAL** | Correctly framed as coach |

### 21 — Circle of fifths

| Claim | Verdict | Evidence |
| --- | --- | --- |
| Counterclockwise = progressive down-P5 | **PASS** | BAM `p025`; Prietto/Stevens |
| Distance-from-home (G=1…E=4); F ≠ dist 1 | **PASS** | Prietto/Stevens |
| Springboard + walk home; IV→I exception | **PASS** | BAM + Szabo |
| Density ~⅓+ | **PASS** | Paraphrase of BAM 35% |
| Chromatic string = fifths + counterparts | **PASS** | BAM `p228` (also in 06) |

---

## Source conflicts (keep both; cite)

1. **Dom9 omit preference** — Prietto/BAM favor omit **root**; Rylander “normally” omit **5th**. Both legal if 3/♭7/9 kept. Fix: attribute both in [12](../knowledge/12-eleven-chords-ji.md).
2. **S13 / maj7 m2** — BAM official def bans m2 chords; Rylander (and contest practice) allow maj7’s chord-tone m2. Docs follow contest carve-out — mark as such.
3. **Dim7 utility** — Rylander up→m6 missing from [12](../knowledge/12-eleven-chords-ji.md) escape hatch.

---

## Doc hygiene applied (post-audit)

1. `12` Dom9 omit table now cites **Prietto/BAM** (omit root) vs **Rylander** (normally omit 5th).
2. `12` dim7 escape now includes Rylander **up → m6** as well as down → BS7.
3. `01` S13 / `12` maj7 note: BAM ban + Rylander/contest carve-out.

Still open (labeling only): Approach Two Step II/III Roman vs BAM OCR; keep R1–R5 engine language as rank/filter except true style bans.

Also folded from [BAM style + Approach Three re-audit](d3c373b0-0f45-4f49-8f65-45c11ce9eb82): S1/S3 BAM exceptions, Prietto attribution for lock-and-ring / tri-tone energy, density wording aligned to “more than 35%,” R3 root/5th soft language.

From [Parts B voicing/JI/circle audit](230d6aaa-79ae-49b2-b969-62dec76a6518): Chinese 7th / BAM voicing preference ranking, outer tenor–bass parallel caution, hitch wording (drop unsourced “cheap”), G♭7 E↔F♭ note.

---

## Coverage notes

- **Engraved OCR** (music examples, Romans) is unreliable; prefer prose roots and Prietto/Stevens when OCR conflicts (Five Foot Two lesson).
- **Meta chapters** (`09`, `15`–`17`, `22`) are product/curriculum — not scored as BAM statutes.
- Cross-checks: [BAM Approach Two/Three audit](8eefb792-4fca-4fb7-989e-66d52b529819), [Szabo/Rylander/Prietto audit](cb6d91a9-a250-4c83-9ea2-2767d612934c), [core-claim OCR check](208a98bb-3de2-47ae-bbdd-4fd38cfd5570).
