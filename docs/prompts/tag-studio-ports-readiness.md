# Prompt: Tag Studio ports/adapters readiness (paste into SingTags agent)

Copy everything below the line into a chat opened on the **barbershop-website** / SingTags repo.

---

## Context

You are working in the SingTags repo (`barbershop-website`). Tag Studio (Tag Roll) is the Labs piano-roll editor under `/tag-studio`. Today it has a fat Pinia store (`web/src/stores/tagRoll.ts`), pure-ish helpers in `web/src/lib/tagRoll/*`, IndexedDB in `web/src/offline/tagRollDb.ts`, and Vue chrome in `views/` + `components/tagRoll/`.

A sibling project (`../arranging`) is building a barbershop arranging coach with **strict ports/adapters** (domain → application → ports → adapters; Pinia as façade only). We will merge arranging into SingTags Labs later. Tag Studio must become merge-ready **without** rewriting the canvas or stuffing arrangement schemas into `TagRollProject`.

Full alignment notes (if readable from this machine): `../arranging/docs/tag-studio-alignment.md`.

## Goals (do these; stay incremental)

Implement Tag Studio readiness items **TS0 → TS2 → TS1 → TS6**, then as much of **TS3** as fits without a big-bang rewrite. Defer TS5 (chord package ownership — wait for arranging H7), TS7 (viewport port), and TS8 (TTBB MusicXML layout) unless trivial.

### Non-goals

- Do **not** fold `ArrangementProject` / pillars / wizard into `TagRollProject`.
- Do **not** rewrite `TagRollViewport.vue` or replace the piano-roll UI.
- Do **not** break existing Tag Studio behavior, Labs gate, exports, or tests.
- Do **not** import arranging packages yet (bridge lives in arranging first).

### Architecture target

```
domain/application (pure use-cases + helpers)
        ↓
ports/ (interfaces only)
        ↓
adapters/ (IDB, MIDI, MusicXML, audio, library)
        ↓
Pinia store = document + selection + playhead façade that calls use-cases
Vue = render + intents only
```

Match patterns already used in sibling arranging (`ports/`, `composition/`, inject `IdGenerator` / `Clock`). Prefer thin wrappers around existing `lib/tagRoll` functions over rewriting exporters.

---

## Work items (in order)

### TS0 — Document layering (cheap)

Add a short decision or architecture note, e.g. `docs/decisions/tag-studio-ports.md` or a section in `docs/architecture.md`:

- Tag Studio / future Arranging Labs: domain pure → application use-cases → ports → adapters.
- Pinia holds document + UI session state only; no new business rules in SFCs.
- Keep `singtags.tagRoll.project.v1` separate from future `arranging.arrangement.v1`; share via bridge later, not schema merge.
- Link/reference sibling arranging `docs/implementation-plan.md` §0 if path is known; otherwise describe the same rule in-repo.

Update `docs/plans/tag-roll.md` or status with a one-line “ports readiness” pointer if appropriate.

### TS2 — Decouple `applyHarmony` from IndexedDB (do early)

File: `web/src/lib/tagRoll/harmonizer/applyHarmony.ts`

- It currently imports `newLocalId` from `offline/localLibraryDb`.
- Change: accept an injected id generator (`idGen: () => string` or small `IdGenerator` interface).
- Call sites (store / panel) pass the id function; composition or store wires `newLocalId` (or a ports-based IdGenerator).
- Add/adjust unit tests so `applyHarmonyToNotes` needs **no** offline imports.
- Ensure `lib/tagRoll/harmonizer/*` stays free of Vue/Pinia/IndexedDB imports (add a purity test if the repo has an architecture test pattern).

### TS1 — Extract ports + composition root (medium)

Introduce:

```
web/src/ports/          # TagRollRepository, MidiExporter, MusicXmlExporter, IdGenerator, Clock
                        # optional: AudioBounce / LibraryIngest
web/src/composition/tagStudio.ts   # wire adapters once
web/src/adapters/       # thin wrappers OR re-home existing modules behind interfaces
```

Suggested ports (wrap existing behavior; do not rewrite MIDI/MusicXML logic):

| Port | Existing implementation |
| --- | --- |
| `TagRollRepository` | `offline/tagRollDb.ts` |
| `MidiExporter` | `lib/tagRoll/midiExport.ts` |
| `MusicXmlExporter` | `lib/tagRoll/musicxmlExport.ts` |
| `IdGenerator` | `newLocalId` (or equivalent) |
| `Clock` | `() => Date.now()` |

Wire the Pinia store (or new use-cases) to take these deps from the composition root. Keep public store method names stable so Vue components barely change.

Add Vitest fakes for ports; at least one test proves create/open/persist or export goes through the port (not a direct IDB import from a use-case).

### TS6 — Library ingest port (small)

`lib/tagRoll/saveToLibrary.ts` currently imports Pinia (`localLibrary` / preferences).

- Introduce `LibraryIngest` port: e.g. `ingestTagRollArtifacts({ png, wavTracks, meta }) → Promise<{ entryId }>`.
- Adapter uses Local Library store/API.
- `saveToLibrary` (or a use-case) depends on the port only.
- Tests with a fake ingest.

### TS3 — Thin Pinia into use-cases (incremental; start, don’t boil ocean)

Extract without renaming the store API overnight. Prefer new files under `web/src/application/tagRoll/` (or `web/src/lib/tagRoll/useCases/`):

| Use-case | Responsibility |
| --- | --- |
| Create / Open / Delete / Persist | CRUD + debounce policy |
| MutateNotes / MutateExpressions | edits + history checkpoints |
| ApplyHarmony | chords + `applyHarmonyToNotes` + idGen |
| ExportMidi / ExportMusicXml | call exporter ports |

Store becomes: hold `project`, selection, playhead, mode; delegate mutations/exports to use-cases.

Do **not** attempt to finish every mutation in one PR if too large—land CRUD + ApplyHarmony + Export first, leave a clear TODO list for remaining store methods.

### Explicitly defer

- **TS4** god-file splits: only ratchet LOC when you touch a file; no viewport rewrite.
- **TS5** chord re-export from arranging domain: skip until arranging moves chords (H7).
- **TS7** piano-roll viewport port / intent events: later.
- **TS8** MusicXML `layout: 'perPart' | 'ttbb'`: later (keep current exporter working).
- **TS9**: do not merge arrangement fields into TagRoll schema.

---

## Constraints & quality bar

- Follow existing SingTags style, Labs flags, and `architecture/godFiles.test.ts` budgets.
- Prefer small PRs / commits conceptually grouped: TS0 docs → TS2 → TS1 ports → TS6 → TS3 slice.
- Every new port gets a fake + at least one test.
- `npm test` / project’s usual typecheck must pass.
- No behavior change visible to users except possibly clearer internal structure (exports, playback, undo, harmonizer must still work).
- Keep PPQ = 480 and chord/voicing string contracts unchanged.

## Acceptance checklist

- [ ] ADR / architecture note for ports/adapters (TS0)
- [ ] `applyHarmony` has no offline/IDB import; id injected (TS2)
- [ ] `ports/` + `composition/tagStudio.ts` exist; repository + MIDI and/or MusicXML behind interfaces (TS1)
- [ ] Library save behind `LibraryIngest` (TS6)
- [ ] At least CRUD and/or ApplyHarmony and/or Export moved to use-cases; store is thinner (TS3 start)
- [ ] Tests green; no Vue in pure helpers
- [ ] Short note in `docs/plans/` or PR description listing what remains (TS3 rest, TS5, TS7, TS8)

## First concrete steps

1. Read `docs/plans/tag-studio-hardening.md`, `web/src/lib/tagRoll/harmonizer/applyHarmony.ts`, `stores/tagRoll.ts`, `offline/tagRollDb.ts`.
2. Land TS0 + TS2 with tests.
3. Add ports wrappers and composition; switch store persistence/export call sites.
4. Port library save (TS6).
5. Extract first use-case batch (TS3); stop when store API is stable and tests pass.

Start implementing now.
