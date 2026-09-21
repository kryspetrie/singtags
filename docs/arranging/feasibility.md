# Feasibility verdict

**Verdict: `GO_WITH_LIMITS`**

Guided barbershop arranging software is feasible if it assists humans through Approach Two’s pillar→passing workflow and ranks options with Approach Three’s five rules — not if it aims to fully auto-arrange from melody with no confirmation.

**Build roadmap:** [`implementation-plan.md`](implementation-plan.md).

## Question answered

Can we build: melody in → block (primary) chords → passing chords as stacked homophony → selective variations / alternate chords → Vue PWA with piano roll + (later) sheet + MIDI/MusicXML?

**Yes, with limits:** pillars and taste-sensitive choices stay user-confirmed; voicing and legal chord candidate generation are largely automatable.

## Evidence base

| Source | Role |
| --- | --- |
| *Barbershop Arranging Manual* (1980), P0 OCR (~220 pages rendered; tesseract extracts in `work/ocr/`) | Rules, 9-step workflow, 5 root-motion rules |
| Synthesized corpus in [`knowledge/`](../knowledge/) | AI/engine-readable constraints |
| [MuseScore Barbershop Harmonizer](https://github.com/znarf94/MuseScore_Barbershop_Harmonizer) | Per-note root/nature/voicing UX |
| SingTags [`chords.ts`](../../barbershop-website/web/src/lib/tagRoll/harmonizer/chords.ts) | Same tables already in TS + ghost/apply UI |

## Coverage map

```mermaid
flowchart LR
  melody[Melody_entry]
  pillars[Primary_pillars]
  pcf[PCF_stacks]
  scf[SCF_passing]
  voice[Voicing_VL]
  vary[Variations]
  melody --> pillars --> pcf --> scf --> voice --> vary
```

| Layer | Manual | MuseScore / SingTags today | Gap |
| --- | --- | --- | --- |
| Enter lead pitches | assumed | Tag Studio piano roll | reuse |
| Primary pillars | Approach Two I–II | missing | **build** |
| PMN/SMN + PCF/SCF | Steps III–VI | missing | **build** |
| Root-motion legality | Approach Three | missing | **build** |
| Apply TTBB voicing | voicing chapter | **exists** | reuse |
| Embellishments | ch. 297+ | missing | defer |
| MusicXML / staff | — | missing (MIDI+PNG only) | later |

## Computability

From [`09-computability-matrix.md`](../knowledge/09-computability-matrix.md): for MVP Steps I–VI + Rules 1–5, roughly **55% deterministic**, **33% heuristic+user**, **12% creative/defer**.

That mix matches an interactive wizard, not batch auto-arrange.

## Hard risks (accepted)

| Risk | Mitigation |
| --- | --- |
| Just intonation | Keep 12-TET MIDI; optional coaching later |
| Pillar identification is ear-driven | Step I–II UI: suggest + confirm |
| Dim7 root ambiguity (Rule 4) | Offer dual-root interpretations |
| Fast-tempo counterpart flicker | Tempo heuristic + simplify toggle |
| Copyright to arrange songs | In-app reminder only |
| Manual is image scan + sheet examples | No full OMR required for rules engine |
| Acrobat-style OCR weak on mixed pages | Priority OCR + synthesis (done for P0) |

## Recommended MVP (post this milestone)

1. Scaffold `web/` from SingTags Vite/Vue/Pinia/PWA; port `tagRoll/*` + harmonizer.
2. Arrangement document per [`schemas/arrangement.v1.json`](../knowledge/schemas/arrangement.v1.json).
3. Wizard: Steps I–VI only (block + passing homophony).
4. Candidate ranking via Approach Three Rules 1–5.
5. Reuse existing harmonizer for voicing preview/apply.
6. Export MIDI first; MusicXML + engraved sheet after notation view exists.
7. Defer embellishment panel (swipes/tags/pyramids).

## What would make it `NO_GO`

- Requirement of fully automatic contest-quality charts with no user harmonic decisions, **or**
- Requirement to OMR the entire 462-page manual (and user lead sheets) before any arranging UX.

Neither is required for the stated product.

## Copyright posture

Committed artifacts are **original synthesis** + schemas. Raw page images and OCR dumps remain gitignored under `work/`. Do not redistribute the SPEBSQSA manual text verbatim.

---

## Addendum — full-book OCR (P1/P2)

After OCR of remaining pages (all 462), additional product-relevant rules surfaced. **Verdict unchanged (`GO_WITH_LIMITS`).**

### New / strengthened rules to account for

| Area | Takeaway | Corpus |
| --- | --- | --- |
| Song eligibility | Lead range D/Eb3–F4; Sol→Sol preferred; avoid low 1/3/7 density | `10-song-selection-form.md` |
| Form lint | Phrases 4 or 8 bars only (never 3/5/7); prefer AABA/ABAB/ABAC; no cutting beats | same |
| Embellishment inventory | Official **29** devices including **Cascade** (missed in TOC skim) | `08-embellishments.md` |
| Swipes | Fill dead air under sustained lead; preserve form; breath before next phrase | `08`, `11` |
| Tags / intros | Main “composed” material; tags optional but symmetrical; tenor may take tag melody | `11-intros-tags-medleys.md` |
| Medleys | Theme continuity + key lifts; contest vs show; defer past MVP | `11` |
| Climax | Align lyric/melody/harmony peaks | `10` |

### Still not MVP-blocking

Appendix letters, history, contest-politics essays, and show-medley narration do not change the core harmonization engine. They inform optional later modules (eligibility UI, tag builder, medley mode).

---

## Addendum — supplemental PDFs (Rylander / Szabo / Prietto)

Text/OCR completed for Rylander (*11 Chords*), Szabo (*Theory*, 1976), and Prietto (*Arranging*, 2nd ed.). Corpus: `knowledge/12`–`15`. **Verdict unchanged.**

In-app: contest profiles (SAI 11 / BHS extended / learning), ring-weighted ranking, secondary-dominant bias, Rylander JI ratios, QA lint panel.
