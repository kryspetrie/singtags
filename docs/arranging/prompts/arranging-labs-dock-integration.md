# Prompt: Integrate arranging as Tag Studio right-dock companion

Copy everything below the line into a chat opened on the **barbershop-website** / SingTags repo (destination).  
Source tree: sibling `../arranging`.

**Prerequisite:** Tag Studio ports hygiene is done (`docs/plans/tag-studio-ports-readiness.md` — TS0–TS2, TS1, TS6, export/persist via ports, `singtags.labs.arranging.enabled.v1` exists).

---

## Mission

Port the **arranging coach** from `../arranging` into SingTags Labs and surface it as a **right-dock companion panel inside Tag Studio** (alongside / peer to the existing Harmonize floating panel), not as a disconnected second full-screen app.

Tag Studio remains the **work surface** (piano roll / sheet). Arranging provides the **coach column**: Infer → Harmonize → Fix → Hear/Why/Learn, pillars, stacks metadata, QA — synchronized via `tagRollBridge` without merging schemas.

```
┌─ Tag Studio chrome (title, toolbar, transport) ─────────────────┐
├──────────────────────────────┬──────────────────────────────────┤
│ Work surface (existing)      │ RIGHT DOCK — Arranging Coach     │
│ tote + roll/sheet + expr     │ tip · CTAs · issues · candidates │
│                              │ Why? / Learn · mode chrome       │
├──────────────────────────────┴──────────────────────────────────┤
│ Media bar (existing)                                            │
└─────────────────────────────────────────────────────────────────┘
```

Mirror docking UX patterns from `TagRollHarmonizePanel` (open/close, right-edge default) but prefer a **stable dock column** that resizes the stage (not only a floating overlay) when the coach is open—so roll + coach read as one composition.

---

## Mandatory: ingest arranging documentation first

**Before writing code**, read and treat as source of truth the docs under `../arranging/docs/` (and knowledge). **Copy the whole `docs/` tree (and `knowledge/` or a subset) into SingTags** as e.g. `docs/arranging/` and `docs/arranging-knowledge/` (or `knowledge/arranging/`) so the Labs package does not depend on a sibling checkout forever.

### Architecture & merge (must follow)

| Doc | Role |
| --- | --- |
| [`implementation-plan.md`](../arranging/docs/implementation-plan.md) | Hexagonal layering; backend-first; backlog incl. A17 |
| [`headless-backend-plan.md`](../arranging/docs/headless-backend-plan.md) | Domain purity; H1 MusicXML; H7 chords; what is out of headless scope |
| [`integration-singtags.md`](../arranging/docs/integration-singtags.md) | Parallel layout; schemas; merge strategy; Labs gate |
| [`tag-studio-alignment.md`](../arranging/docs/tag-studio-alignment.md) | Bridge rules; TS*/A-TS*; no schema merge; viewport port later |
| [`pr-architecture-checklist.md`](../arranging/docs/pr-architecture-checklist.md) | No business rules in Vue/Pinia |

### UX / workflows (must drive the right-dock UI)

| Doc | Role |
| --- | --- |
| [`ux-workflows.md`](../arranging/docs/ux-workflows.md) | 3 modes; Quick happy path; coach column; never silent / stranded |
| [`workflow-guides.md`](../arranging/docs/workflow-guides.md) | UC catalog (P0 vs P2); invariants; teaching moments |
| [`ui-presentation-layer-design.md`](../arranging/docs/ui-presentation-layer-design.md) | Modes chrome; DTOs; ContextCard; U0–U6; hard bans for Vue |
| [`ui-workflow-evaluation.md`](../arranging/docs/ui-workflow-evaluation.md) | Port readiness vs current Vue gaps; Fix CTA miswire to avoid |
| [`theory-teaching-integration-plan.md`](../arranging/docs/theory-teaching-integration-plan.md) | Why?/Learn/autocomplete/narrative teaching surfaces |

### Theory / correctness (do not regress)

| Doc | Role |
| --- | --- |
| [`doc-code-deviations.md`](../arranging/docs/doc-code-deviations.md) | Known sync fixes already applied in arranging |
| [`source-claim-audit.md`](../arranging/docs/source-claim-audit.md) / [`source-verification.md`](../arranging/docs/source-verification.md) | Claim ↔ BAM/Szabo/… hygiene |
| [`theory-correctness-remediation-plan.md`](../arranging/docs/theory-correctness-remediation-plan.md) | Remediation history |
| [`remediation-arranging-depth.md`](../arranging/docs/remediation-arranging-depth.md) | Depth/VL/etc. |
| [`notation-library-strategy.md`](../arranging/docs/notation-library-strategy.md) | abcjs pedagogy vs Verovio later (U6) |

### Prompts / prior Tag Studio work (context only)

| Doc | Role |
| --- | --- |
| [`prompts/tag-studio-pre-integration.md`](../arranging/docs/prompts/tag-studio-pre-integration.md) | Hygiene that should already be done |
| [`prompts/tag-studio-ports-readiness.md`](../arranging/docs/prompts/tag-studio-ports-readiness.md) | Earlier readiness prompt |
| SingTags `docs/plans/tag-studio-ports-readiness.md` | Local status of ports work |

### Knowledge corpus

Copy or symlink `../arranging/knowledge/` (especially style, Approach Two/Three, voicing/VL, teachable curriculum, guidance automation). Domain education catalog must stay consistent with these texts.

**Rule:** If UI copy, ranking, or lint behavior conflicts with these docs, **fix code toward docs** (or file a deviation note)—do not invent coach behavior in Vue.

---

## Non-goals (this integration pass)

- Do **not** fold pillars / wizard / contest / JI into `singtags.tagRoll.project.v1`.
- Do **not** rewrite `TagRollViewport` / replace the roll with arranging’s MelodyRoll (A17 viewport port is later).
- Do **not** delete Tag Studio Harmonize panel in v1—coach dock is additive; Harmonize can remain for manual chord entry.
- Do **not** implement Verovio full score or Tag Studio viewport port (U6 / A17) in this pass.
- Do **not** boil-the-ocean U0–U5 in one PR—ship a **Quick Arrange–shaped dock** first (see phasing).

---

## Architecture target

```
Tag Studio (TagRollProject)  ←bridge→  ArrangementProject
        ↑                                    ↑
  useTagRollStore                    useArrangementStore (façade)
        ↑                                    ↑
  getTagStudioServices()          getArrangingServices() / shared Labs DI
        ↑                                    ↑
  ports (TagRoll*)                 ports (Arrangement*, AudioPreview, …)
```

- **Two schemas forever**; sync via `arrangementToTagRoll` / `tagRollToArrangement` from arranging `domain/arranging/bridge/tagRollBridge.ts`.
- Domain/application stay pure (no Vue in `domain/` / `application/`).
- Vue dock only: bind inputs, call store/use-cases, render DTOs, highlight via roll intents, hear via audio port.
- Prefer **one Labs composition root** that wires Tag Studio + arranging adapters (shared `IdGenerator` / `Clock` where sensible).

### Package layout (suggested)

```
web/src/domain/arranging/          # copy from ../arranging
web/src/application/               # arranging use-cases (merge carefully with tagRoll/)
web/src/ports/                     # add Arrangement* ports beside TagRoll*
web/src/adapters/arranging/        # IDB, MIDI, MusicXML, audio preview
web/src/composition/arranging.ts   # or extend Labs composition
web/src/stores/arrangement.ts
web/src/components/arranging/      # CoachDock, IssueList, CandidateList, …
docs/arranging/                    # copied docs tree
docs/arranging-knowledge/          # or knowledge/arranging/
```

Chord tables: either keep dual temporarily or land H7 shim (`lib/tagRoll/harmonizer/chords.ts` → re-export arranging domain). Prefer shim if low-risk.

---

## UX: right-dock companion (v1 = Quick Arrange)

Implement per `ux-workflows.md` + `ui-presentation-layer-design.md` **Quick** mode emphasis:

1. **Toggle** in Tag Studio toolbar: “Coach” / “Arrange” (gated by `ARRANGING_ENABLED_KEY` / `singtags.labs.arranging.enabled.v1`).
2. **Right dock** when open:
   - One tip sentence (wizard step or Quick tip)
   - Primary CTAs: **Infer pillars** → **Auto-harmonize** → **Fix issues** (Fix must focus issues / safe-fix—not a bare QA refresh; see evaluation doc)
   - Issue badge + collapsible list (Fix / Learn when available)
   - Advanced ▸: candidates for selection, Why?, contest profile, tuning
3. **Selection sync:** playhead / selected Tag Studio notes → melody selection in arrangement; applying a candidate updates arrangement stacks then **projects** TTBB notes back through the bridge into TagRoll (or apply via bridge helpers).
4. **Human gates:** pillars confirm in dock; do not auto-confirm.
5. **Hear:** reuse Tag Studio audio where possible; arranging JI/compare can use arranging `AudioPreview` adapter—avoid dual players fighting transport (document if temporary).

Guided step rail + Review IssueBoard grouping = **phase 2** (still design-locked in docs; don’t invent alternate IA).

---

## Sync protocol (critical)

1. On **Coach open** (or first enable): `tagRollToArrangement(project)` → load/create linked `ArrangementProject` (store id association on TagRoll `localEntryId`-like field **or** parallel IDB key map—do **not** stuff pillars into TagRoll JSON). Prefer a side table / `arrangingLink: { arrangementId }` in Tag Studio prefs or a small link store if schema must stay pure.
2. After arranging mutations that change stacks/melody: `arrangementToTagRoll` → merge notes into TagRoll (preserve expressions, mix, non-TTBB parts carefully—bridge is TTBB-centric; document lossy rules).
3. After Tag Studio melody edits while coach open: push melody into arrangement (`UpdateMelody` / upsert) and re-QA.
4. Undo: define ownership—either TagRoll history wins for notes and arranging rebuilds from bridge, or dual checkpoints; pick one and test. Prefer **TagRoll history as roll SoT** and re-bridge arranging view on undo if simpler for v1.

---

## Work sequence (implement in order)

### Phase A — Package port (headless)

1. Copy `domain/arranging`, arranging `application/*` (non-Vue), ports, adapters, bridge, tests.
2. Copy `docs/` → `docs/arranging/` and knowledge corpus.
3. Wire `composition` + IndexedDB for `arranging.arrangement.v1` (mirror `arrangingDb` / repository port).
4. Run arranging Vitest suites under SingTags (or subset); fix import paths.
5. Gate: feature works only when `singtags.labs.arranging.enabled.v1` is on (Labs UI toggle).

### Phase B — Right-dock shell

1. `ArrangingCoachDock.vue` (or similar) mounted from `TagRollEditorView` when Labs arranging enabled + user toggles Coach.
2. Thin `useArrangementStore` façade → use-cases only (no `classifyRootMotion` in Vue—architecture test).
3. Wire Infer / Auto-harmonize / runQa / applyFix / applyAllSafeFixes / listCandidates.
4. Status: errors/warns/unconfirmed pillars.

### Phase C — Bridge sync

1. Open/promote helpers using `tagRollBridge`.
2. Apply candidate → stacks → project to TagRoll notes.
3. Golden tests: TTBB round-trip fixture; coach apply updates roll notes.

### Phase D — Teaching surfaces (minimum)

1. Why? via `ExplainCoach` / teachCandidate (not ad-hoc strings).
2. Learn chip on lints when catalog maps exist.
3. Avoid growing a god `WizardPanel`—keep dock sliced (tip / CTAs / issues / advanced).

### Phase E — Docs & Labs

1. SingTags plan: `docs/plans/arranging-labs-dock.md` status + link to copied arranging docs.
2. Labs entry: enable arranging gate; short blurb “Coach dock in Tag Studio”.
3. Update `docs/plans/tag-studio-ports-readiness.md`: arranging port in progress / done.

---

## Hard bans

- No arranging rule constants / SCF / Dom9 omit preference / density thresholds / Roman dual-label logic in `.vue` files.
- No merging `ArrangementProject` fields into `TagRollProject`.
- No second MIDI/MusicXML encoder outside ports.
- Do not import from `../arranging` at runtime after copy—in-repo paths only.

---

## Acceptance checklist

- [ ] `docs/arranging/` (and knowledge) present in SingTags with the tables above
- [ ] Labs gate enables Coach toggle in Tag Studio
- [ ] Right dock: Infer → Harmonize → Fix path works on a demo/tag-roll project
- [ ] Bridge: stacks ↔ TTBB notes round-trip covered by tests
- [ ] Applying a coach candidate visibly updates the piano roll
- [ ] QA issues appear in dock; Fix/Learn wired for at least one lint
- [ ] Pinia/Vue free of Approach Three classifiers (grep/architecture test)
- [ ] Tag Studio-only workflows (harmonize panel, export, library) still work with coach closed
- [ ] Plan doc lists phase-2: Guided rail, Review IssueBoard, U0 DTO freeze polish, A17, Verovio

## First concrete steps

1. Copy/symlink docs + knowledge; skim `ux-workflows.md`, `ui-presentation-layer-design.md`, `tag-studio-alignment.md`, `integration-singtags.md`.
2. Port domain + bridge + composition; get tests green.
3. Add Coach dock shell + three CTAs.
4. Wire bridge sync + one golden test.
5. Stop before Verovio / full Guided mode / viewport rewrite.

Start implementing now.
