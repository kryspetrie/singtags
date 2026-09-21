# Prompt: Tag Studio pre-integration refactors (paste into SingTags agent)

Copy everything below the line into a chat opened on the **barbershop-website** / SingTags repo.

**Prerequisite:** TS0–TS2, TS1, TS6, and first TS3 slice are already landed (see `docs/plans/tag-studio-ports-readiness.md`). This prompt is only the **remaining work before copying arranging into Labs**.

---

## Context

You are finishing Tag Studio ports/adapters hygiene in SingTags (`barbershop-website`) so we can next **port the sibling arranging coach** (`../arranging`) into Labs without fighting two I/O spines.

**Already done (do not redo):**
- ADR `docs/decisions/tag-studio-ports.md`
- `web/src/ports/` + `adapters/tagRoll/` + `composition/tagStudio.ts`
- `applyHarmony` IdGenerator injection; `lib/tagRoll` purity tests
- `LibraryIngest` + save use-case without Pinia
- Application stubs: `application/tagRoll/applyHarmony.ts`, `exportMidi.ts`, `exportMusicXml.ts`, `persist.ts`, `saveToLibrary.ts`

**Verified gaps (fix these):**
1. `TagRollEditorView.vue` still imports `downloadTagRollMidi` / `downloadTagRollMusicXml` / `downloadTagRollAudio` from `lib/tagRoll/*` instead of composition / export use-cases / ports.
2. Store uses `TagRollRepository` via `getTagStudioServices()` but often **bypasses** `application/tagRoll/persist.ts` and uses raw `Date.now()` instead of the `Clock` port.
3. No Labs preference key yet for arranging (`singtags.labs.arranging.enabled.v1`) — needed before the coach package lands.
4. Export / bounce adapters exist but are not the single path the UI uses.

**Still defer (do not implement now):**
- **TS5** chord re-export from arranging (wait for arranging H7)
- **TS7** PianoRollViewport intent port (arranging A17)
- **TS8** MusicXML TTBB layout
- Full **MutateNotes / MutateExpressions** extraction (can continue after Labs arranging ships)
- Canvas / viewport rewrite
- Importing arranging packages or wiring `tagRollBridge` (that lands **with** the arranging port, not before)

Alignment SoT (if readable): `../arranging/docs/tag-studio-alignment.md`, `../arranging/docs/integration-singtags.md`.

---

## Goals (pre-integration only)

Make Tag Studio’s **I/O and composition root** the only path for persist / export / library / bounce from the editor and store, matching arranging’s DI pattern so a future `createLabsServices()` can sit beside `getTagStudioServices()`.

### Work items (in order)

### P1 — Editor exports go through ports / use-cases (required)

File: `web/src/views/TagRollEditorView.vue`

- Remove direct imports of `downloadTagRollMidi`, `downloadTagRollMusicXml`, `downloadTagRollAudio` (and similar) from `lib/tagRoll/*`.
- Call existing application use-cases (`exportMidi`, `exportMusicXml`) and/or `getTagStudioServices().midiExporter` / `musicXmlExporter` / `audioBounce`.
- Keep UX identical: modes `one` / `two` / `all`, filenames, download triggers.
- Prefer thin browser download helpers at the adapter edge (bytes → file) if not already present — **Vue must not own SMF/MusicXML encoding**.

Add or extend a test that proves export goes through the port (fake exporter), not a direct `lib` encode from the view.

### P2 — Store CRUD / timestamps use persist use-cases + Clock (required)

File: `web/src/stores/tagRoll.ts`

- Route create / open / list / delete / debounced save through `application/tagRoll/persist.ts` (or expand those helpers until the store has no inline `repository.put/get/list` + `Date.now()` for document timestamps).
- All document timestamps from `getTagStudioServices().clock.now()` (or persist helpers that take `Clock`).
- Keep **public store method names stable** so Vue barely changes.
- Extend `stores/tagRoll.ports.test.ts` (or use-case tests) so persist paths are covered with fakes.

Note mutations / expressions may stay in the store for now (**TS3 rest** deferred).

### P3 — Bounce / audio export behind `AudioBounce` end-to-end (required if adapter exists)

- Editor (and any remaining `lib/tagRoll/audioExport` call sites used by Tag Studio UI) must go through the `AudioBounce` port / a small use-case.
- Leave live transport/`PitchTonePlayer` alone except where needed to avoid a second download path.

### P4 — Labs arranging gate key (required, tiny)

- Add preference key `singtags.labs.arranging.enabled.v1` next to the Tag Studio Labs key (`web/src/lib/preferences/keys.ts` and any Labs UI catalog).
- Do **not** add arranging routes or copy arranging code in this PR — key + optional Labs stub entry (“coming soon” / hidden until package lands) only.
- Document in `docs/plans/tag-studio-ports-readiness.md` or a one-line ADR note.

### P5 — Hygiene / docs (required)

- Update `docs/plans/tag-studio-ports-readiness.md`: mark P1–P4 done; list deferred TS3 rest / TS5 / TS7 / TS8.
- Confirm `architecture/tagRollPurity.test.ts` and `godFiles.test.ts` still pass (ratchet LOC only if you must touch a god file; do not expand budgets casually).
- Optional: if `lib/tagRoll/harmonizer/applyHarmony.ts` imports `ports/IdGenerator`, leave it **or** introduce a local type alias so `lib/` does not depend on `ports/` — only if cheap.

---

## Non-goals

- Do **not** copy `../arranging` into this repo yet.
- Do **not** add `tagRollBridge` consumption, `/labs/arranging` coach UI, or pillars into `TagRollProject`.
- Do **not** rewrite `TagRollViewport.vue` / sheet view.
- Do **not** unify MusicXML return types with arranging (`Uint8Array` vs `string`) beyond documenting the difference — shared adapter comes at merge.
- Do **not** move chord tables (TS5).

---

## Quality bar

- Behavior unchanged for users (exports, undo, harmonizer, library save, Labs Tag Studio gate).
- Every touched port path has a fake + test.
- Usual `npm test` / typecheck green.
- PPQ 480 and `singtags.tagRoll.project.v1` unchanged.

## Acceptance checklist

- [ ] Editor has **no** direct `lib/tagRoll/midiExport|musicxmlExport|audioExport` imports for user export actions
- [ ] Store persist/create/open/list/delete go through application + `Clock` (no raw `Date.now()` for document stamps)
- [ ] Bounce/download audio uses `AudioBounce` port path
- [ ] `singtags.labs.arranging.enabled.v1` exists
- [ ] Readiness plan updated; tests green
- [ ] Explicit note: arranging package port + bridge wiring is the **next** project (not this PR)

## First concrete steps

1. Read `docs/plans/tag-studio-ports-readiness.md`, `composition/tagStudio.ts`, `application/tagRoll/*`, `TagRollEditorView.vue` export handlers, `stores/tagRoll.ts` persist paths.
2. Land P1 (editor exports) with a port fake test.
3. Land P2 (persist + Clock).
4. Land P3 if any UI still hits `audioExport` / bounce directly.
5. Land P4 Labs arranging key + docs.
6. Stop — do not start copying arranging.

Start implementing now.
