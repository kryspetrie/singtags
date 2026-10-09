# Theory / weight audit — 2026-10-07

**Sources re-verified this pass**

| Source | Method | Artifact |
| --- | --- | --- |
| Flinn *11 BBS Chords* (repo `11-chords.pdf`) | `pdftotext` + tesseract | `work/ocr-verify/11-chords.txt`, `flinn-11-chords-tesseract.txt` |
| Rylander *11 Chords* | tesseract pp. 3–5 + prior `arranging/work/ocr_extra/rylander_11_chords.txt` | `work/ocr-verify/ryl-p-*.txt` |
| BAM 1980 | tesseract pp. 24–26, 258–265 (PDF has no text layer) | `work/ocr-verify/bam-p-*.txt`, `bam-voicing-*.txt` |
| Prietto arranging notes | existing OCR | `arranging/work/ocr_extra/prietto_arranging.txt` |
| Glenda Lloyd *Intro to Arranging — ranges* | `pdftotext` + tesseract | `work/ocr-verify/intro-*` |
| Sharon/Bell *A Cappella Arranging* | text layer weak on engraved pages; TOC only | not used for weight claims |

Flinn pdftotext and tesseract agree on all material claims (double root; Dom9 omit root or 5th; predominant = major / BS7 / Dom9). BAM re-OCR matches prior `work/ocr/p024–026` and voicing chapter claims.

---

## Scorecard (weights & logic vs corpus)

| Area | Code | Corpus | Verdict |
| --- | --- | --- | --- |
| SAI-11 natures / `RING_TIER` | `contestProfile.ts` | Rylander LCD; Flinn 11 | **PASS** |
| Dom9 dual omit (root-first) | `VOICINGS_BY_CHORD.ninth` | Prietto omit-root; Rylander omit-5 “normally”; Flinn either | **PASS** (source split already documented) |
| Color chords deferred | `colorChordPenalty`, Basic allowlist | BAM: 6 / 9 / M7 “avoided except melody” | **PASS** |
| Unforced minor demotion | `unforcedMinorPenalty` 3.5 | BAM: minor when called for; Flinn minor = substitution | **PASS** |
| `diatonicFunction` + Basic allowlist `major/minor/seventh/m7` | `candidates.ts` | Classical I/V/IV/ii highway; Szabo RN | **PASS** for Basic coach (not full barbershop density) |
| `songFinalHome` kills hanging V7 | weight 6, path cost 22 | Cadence grammar; user Bonnie bug | **PASS** |
| Bass prefers 1/5 | voicing tables + BAM p265 | BAM “Principle of bass root or fifth”; Flinn bass rules | **PASS** |
| Spacing / closed at Basic | `closedVoicing` ↑ with basic | BAM close/open/divorced; Lloyd close/medium/wide | **PASS** (ensemble ranges are UI/keying, not ranker) |
| Prefer 4 distinct PCs mid-phrase | `completeFourPart` 4.5 | Prietto: “Four-note chords have no double” | **PASS** as soft preference |
| **Final tonic → I7 / 4-PC over major triad** | `finalComplete` 5.5; `homeTriad` zeroed at final; `seventhBias` boosts final I7 | **Rylander:** “99% of all Barbershop arrangements end with a **major** chord.” BAM: tonic triad is the home release | **FAIL** vs Rylander endings |
| **When triad doubles, prefer Lead PC** | `completeFourPartBias` / `incompleteVoicingCost` | Flinn/BAM/Prietto/Rylander: major → **double the root**; Rylander: double 3rd is “ugly”; Prietto: bass doubles with upper parts, upper parts don’t double each other | **FAIL** |
| Dom9 not in Basic allowlist | `natureAllowlistForRisk` ≤0.35 | Flinn: Dom9 is one of three **predominant** flavors | **SOFT GAP** (OK for “classical Basic”; wrong if Basic means “barbershoppy”) |
| BS7 density coach ~30% | lint | BAM >35% duration | **Known soft** (already in deviations) |

---

## Critical tensions (fix recommended)

### 1. Song / phrase finals should prefer I (major), not I7

Re-OCR Rylander p.3:

> To double the third is considered an ugly solution). **99% of all Barbershop arrangements end with a major chord.**

Current stack at true finals (`songFinalHome` + `finalComplete` + `completeFourPart`, with `homeTriad` disabled) systematically elevates tonic **Mm7**. That fixed hanging-V7 endings but overshoots the manuals.

**Recommended:** At `isTrueSongFinal` / cadence tonic home with Lead on 1 or 5 → prefer `major` (root doubled, bass on 1 or 5). Prefer `seventh` only when Lead is on ♭7 (or forced 4-tone color). Keep strong `songFinalHome` demotion of non-tonic / hanging V7.

### 2. Triad doubling: root, not Lead

Prietto:

> Major triad — Double the root. … Bass can double with any of the upper parts, but upper parts don’t double with each other.

Flinn / BAM / Rylander agree: usually root; occasionally 5th; never prefer the 3rd.

`completeFourPartBias` treating “doubles Lead” as the good rare case **rewards doubled 3rds** whenever Lead is the third — the opposite of the corpus.

**Recommended:** Replace lead-double preference with **root-double** (major/aug) and **root-or-3** (minor, Flinn “anything equally strong”). Soft-penalize doubled major 3rd hard. Keep 4-PC preference above any triad double.

### 3. Basic vs “barbershop flavor”

Basic highway (I / V7 / IV / ii7) matches the user’s “classical” request and Szabo function gravity. Flinn’s predominant trio is **major + BS7 + Dom9**. If Basic is meant to sound barbershoppy, allow Dom9 when Lead is the 9th (melody-forced), and keep mid-phrase BS7 density via `seventh` / ring — without putting Dom9 on every pick.

---

## Alignments that should stay

- Dom9 omit-root first, omit-5 second (`chords.ts` comment + tests).
- `RING_TIER` order vs knowledge/12.
- `unforcedMinorPenalty`, `colorChordPenalty`, `passingSoftPenalty` at Basic.
- `diatonicFunction` + `songFinalHome` anti–hanging-V7 (Bonnie-class bug).
- BAM voicing typology (close/open/spread/divorced) already reflected in knowledge/07 and Basic `closedVoicing`.
- Lloyd ranges/ensemble spread = keying / ensemble config, not candidate ranking.

---

## Weight magnitude notes (current defaults)

| Weight | Default | Basic path scale (risk→0) | Role |
| --- | --- | --- | --- |
| `songFinalHome` | 6 | ×(2.0+2.5) | Dominates true finals — keep demotion of V7; retarget tonic nature |
| `finalComplete` | 5.5 | ×(1.4+0.8) | Overpowers home triad at cadences — **dial down / gate by Lead role** |
| `completeFourPart` | 4.5 | ×(1.3+1.6) | Good for preferring tetrads; **fix double-tone heuristic** |
| `homeTriad` | 3.25 | ×(0.85+1.4)×cadenceScale | Currently **0 at final tonic** — restore for song final |
| `diatonicFunction` | 2.5 | ×(1.6+3.2) | Strong Basic gravity — keep |
| `unforcedMinorPenalty` | 3.5 | ×(0.8+2.4) | Keep |
| `colorChordPenalty` | 2.5 | ×(0.6+2.2) | Keep |

---

## Verdict (updated after 2026-10-07 implementation)

Corpus OCR confirmed the knowledge base. Code now matches manuals on:

- **Tonic finales → major/minor** (I7 only when Lead is on ♭7)
- **Triad doubles → root** (demote doubled major 3rds)
- **Basic Dom9** when Lead is the 9th (`colorChordPenalty` otherwise)

Intentional remaining deviations are tracked in [doc-code-deviations.md](doc-code-deviations.md) (**P1–P5**): mid-phrase 4-PC I7 preference, Basic classical highway vs Flinn density, soft vs hard Approach Three, density lint threshold, Dom9 omit-root-first editorial choice.

**Ades *Choral Arranging* (classical OCR `mbl_vok2`):** soft costs in `partWritingCosts.ts` — upper-trio close, post-leap direction change, hazardous ↑A4/↓d5 in harmony parts — wired into ranking + Path Optimize. Parallel 5ths/8ves remain soft (barbershop-friendly).
