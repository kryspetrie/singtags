# Knowledge corpus — learn barbershop arranging

This folder is the **teachable distillate** of the arranging sources behind the app:

| Source | Role |
| --- | --- |
| *Barbershop Arranging Manual* (SPEBSQSA, 1980) | Style, workflow (Approach One–Three), voicing, embellishments, form |
| Burt Szabo, *Theory of Barbershop Harmony* (1976) | Roman numerals, free chords, secondary dominants, circle-of-fifths grammar |
| Simon Rylander, *The 11 Chords of Barbershop* (2008) | Contest chord set + just intonation / lock & ring |
| Carole Prietto, *Arranging Barbershop Harmony* (2nd ed.) | Practice checklist, strong voicing, SAI vs BHS |

Text is **original paraphrase + worked examples** (not verbatim manual extracts). **Filenames keep stable numbers** for code `@see` links — **read by Parts I–VIII below**, not by `01…21` order.

**Audit log:** [22-adversarial-doc-review.md](22-adversarial-doc-review.md).

---

## Mini glossary (read once)

| Term | Meaning |
| --- | --- |
| **Pillar** | Primary harmony a stretch of melody is “about” (strong-beat destination) |
| **PMN / SMN** | Primary vs secondary melody notes (structural vs connective) |
| **PCF** | Primary chord family — qualities on the pillar root |
| **SCF** | Secondary chord family — Groups 1–6 of related passing roots |
| **BS7** | Barbershop / dominant seventh (Mm7), often just-tuned |
| **Springboard** | I and IV may leap to any root; then normal highway rules resume |
| **Highway** | Descending-fifth (circle) root motion toward the next pillar |

---

## Who you are → where to start

| Reader | Path |
| --- | --- |
| **Beginner** (scales, triads, V7→I; never finished a chart) | **MVP** below, then backfill |
| **Mid-level** | Skim I–II; deep **III–VI** + [20](20-troubleshooting.md) |
| **Advanced** | [06](06-approach-three-rules.md), [14](14-prietto-practice.md), [17](17-general-theory-and-acappella.md); [18](18-chord-charts-by-key.md) as lookup |
| **AI / RAG** | Prefer each Part’s **source of truth**; do not merge conflicting summaries |

### MVP shortcut (first finished draft)

`01 → 10 → 12 → 21 → 03 → 05 → 07 → 19`  
then repair with `20`, and backfill `18` / `02` / `04` / `06` / `13` as needed.

---

## Start-to-finish path (Parts I–VIII)

### Part I — What counts as barbershop

| # | File | Source of truth for |
| --- | --- | --- |
| 1 | [01-style-definition.md](01-style-definition.md) | Style gates S1–S16 |
| 2 | [10-song-selection-form.md](10-song-selection-form.md) | Song eligibility / form |

### Part II — Build chords, then the highway

| # | File | Source of truth for |
| --- | --- | --- |
| 3 | [12-eleven-chords-ji.md](12-eleven-chords-ji.md) | Contest natures + **construction** + JI |
| 4 | [21-circle-of-fifths.md](21-circle-of-fifths.md) | **Circle / distance / springboards** (S11 pedagogy) |
| 5 | [18-chord-charts-by-key.md](18-chord-charts-by-key.md) | **Note-name spellings** (lookup bible) |

### Part III — Name it and place it in time

| # | File | Source of truth for |
| --- | --- | --- |
| 6 | [13-szabo-theory.md](13-szabo-theory.md) | **Romans / secondary-dominant labels** |
| 7 | [03-harmonic-rhythm.md](03-harmonic-rhythm.md) | Pillars vs embellishment |

### Part IV — Families under a pillar + the method

| # | File | Source of truth for |
| --- | --- | --- |
| 8 | [02-chord-vocabulary.md](02-chord-vocabulary.md) | **PCF / SCF Groups 1–6** |
| 9 | [05-approach-two-workflow.md](05-approach-two-workflow.md) | **Nine-step workflow** |
| 10 | [04-approach-one.md](04-approach-one.md) | NCT / leftover-note tactics (Steps III–V depth) |
| 11 | [06-approach-three-rules.md](06-approach-three-rules.md) | **R1–R5 legality** |

### Part V — Voice it, do one chart, repair

| # | File | Source of truth for |
| --- | --- | --- |
| 12 | [07-voicing-voice-leading.md](07-voicing-voice-leading.md) | TTBB / doubles / Dom9 stacks |
| 13 | [19-melody-to-arrangement.md](19-melody-to-arrangement.md) | End-to-end practice (B♭) |
| 14 | [20-troubleshooting.md](20-troubleshooting.md) | Symptom → fix |
| 15 | [14-prietto-practice.md](14-prietto-practice.md) | Strong-voicing QA / SAI–BHS |

### Part VI — After the block chart

| # | File | Source of truth for |
| --- | --- | --- |
| 16 | [08-embellishments.md](08-embellishments.md) | Swipes / devices |
| 17 | [11-intros-tags-medleys.md](11-intros-tags-medleys.md) | Tags, intros, lifts, medleys |

### Part VII — Enrichment (optional)

| # | File | Audience |
| --- | --- | --- |
| 18 | [17-general-theory-and-acappella.md](17-general-theory-and-acappella.md) | Mid/advanced VL / spacing / tension |

### Part VIII — Product / AI wiring (optional; off human spine)

| # | File | Audience |
| --- | --- | --- |
| 19 | [16-teachable-curriculum.md](16-teachable-curriculum.md) | In-app glossary / lesson IDs |
| 20 | [09-computability-matrix.md](09-computability-matrix.md) | What software can automate |
| 21 | [15-guidance-automation.md](15-guidance-automation.md) | Coach design |

**Schema:** [schemas/arrangement.v1.json](schemas/arrangement.v1.json).

---

## Why this order

1. **Construct → circle → spell** — formulas ([12](12-eleven-chords-ji.md)), highway story ([21](21-circle-of-fifths.md)), then multi-key lookup ([18](18-chord-charts-by-key.md)).
2. **Romans after circle** — labels ([13](13-szabo-theory.md)) name stations you already feel.
3. **SCF after pillars** — families are relative to a pillar ([03](03-harmonic-rhythm.md) then [02](02-chord-vocabulary.md)).
4. **Wizard before NCT deep-dive** — [05](05-approach-two-workflow.md) is the method; [04](04-approach-one.md) sharpens leftover-note steps.
5. **R1–R5 after you know the wizard** — [06](06-approach-three-rules.md) filters candidates.
6. **Voicing before the big walkthrough** — [07](07-voicing-voice-leading.md) then [19](19-melody-to-arrangement.md).
7. **Tags last; product last** — don’t ornament or automate an unfinished highway.

**Worked keys:** concepts often in **C / Am**; lookup + walkthrough in **B♭, F, E♭, …**.

---

## Engineering map (stable filenames → modules)

| File | Manual focus (approx.) | Software module |
| --- | --- | --- |
| [01-style-definition.md](01-style-definition.md) | BAM pp. 3–25 | Style lint / song eligibility |
| [02-chord-vocabulary.md](02-chord-vocabulary.md) | BAM pp. 11–21 | Chord natures, PCF/SCF |
| [03-harmonic-rhythm.md](03-harmonic-rhythm.md) | BAM pp. 67–72 | Pillars / timing |
| [04-approach-one.md](04-approach-one.md) | BAM pp. 74–126 | Non-chord-tone → chord choice |
| [05-approach-two-workflow.md](05-approach-two-workflow.md) | BAM pp. 141–205 | Wizard (9 steps) |
| [06-approach-three-rules.md](06-approach-three-rules.md) | BAM pp. 206–243 | Root-motion ranking |
| [07-voicing-voice-leading.md](07-voicing-voice-leading.md) | BAM pp. 245–279 | Voicing + VL |
| [08-embellishments.md](08-embellishments.md) | BAM pp. 297–331 | Post-pass devices |
| [09-computability-matrix.md](09-computability-matrix.md) | — | Feasibility |
| [10-song-selection-form.md](10-song-selection-form.md) | BAM pp. 27–66 | Eligibility / form |
| [11-intros-tags-medleys.md](11-intros-tags-medleys.md) | BAM pp. 342–390 | Intros / tags / medleys / lifts |
| [12-eleven-chords-ji.md](12-eleven-chords-ji.md) | Rylander 2008 | Contest 11 + JI |
| [13-szabo-theory.md](13-szabo-theory.md) | Szabo 1976 | Harmonic grammar |
| [14-prietto-practice.md](14-prietto-practice.md) | Prietto 2nd ed. | Practice / SAI–BHS |
| [15-guidance-automation.md](15-guidance-automation.md) | — | Coach design |
| [16-teachable-curriculum.md](16-teachable-curriculum.md) | All sources | In-app glossary / Why? |
| [17-general-theory-and-acappella.md](17-general-theory-and-acappella.md) | Chorale + filtered a cappella | VL / spacing / tension |
| [18-chord-charts-by-key.md](18-chord-charts-by-key.md) | Synthesized reference | Multi-key spellings |
| [19-melody-to-arrangement.md](19-melody-to-arrangement.md) | BAM Approaches 1–3 | Melody → draft in B♭ |
| [20-troubleshooting.md](20-troubleshooting.md) | All sources | Symptom → fix |
| [21-circle-of-fifths.md](21-circle-of-fifths.md) | BAM S11 + Szabo / Prietto | Circle pedagogy |
| [22-adversarial-doc-review.md](22-adversarial-doc-review.md) | Meta | Audit log |

**Calibration (1980 manual):** printed page \(N\) ≈ PDF page \(N + 13\).

**OCR coverage:** BAM all 462 pages; Szabo 39 pages; Rylander + Prietto text extracts (`work/ocr_extra/`).

**Feasibility:** [`../docs/feasibility.md`](../docs/feasibility.md) — `GO_WITH_LIMITS`.  
**Implementation:** [`../docs/implementation-plan.md`](../docs/implementation-plan.md).  
**Doc ↔ code audit:** [`../docs/doc-code-deviations.md`](../docs/doc-code-deviations.md).  
**Source OCR verification:** [`../docs/source-verification.md`](../docs/source-verification.md).
