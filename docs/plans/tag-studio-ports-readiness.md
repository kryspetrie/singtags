# Tag Studio ports readiness — progress

> **Status:** PA0–PA3 landed. Behavior unchanged. Remaining debt is store thinning (TS3), god-file splits (TS4), and the deferred ports below.  
> **Updated:** 2026-11-06  
> **Decision:** [tag-studio-ports.md](../decisions/tag-studio-ports.md)  
> **Prompt:** [tag-studio-ports-rewrite.md](../prompts/tag-studio-ports-rewrite.md)

## Done

| ID | Work |
| --- | --- |
| **TS0** | ADR + architecture pointer |
| **TS2** | `applyHarmony` / tempoMap / normalize free of `offline/` imports; ids via `IdGenerator` or `allocatePrefixedId` |
| **TS1** | `ports/` + `adapters/tagRoll/` + `composition/tagStudio.ts` |
| **TS6** | `LibraryIngest` port; save use-case no longer imports Pinia |
| **TS3** | Use-cases: apply harmony, persist CRUD, export MIDI/MusicXML, download audio via `AudioBounce` |
| **Hygiene** | Editor exports go through application use-cases + ports |
| **Hygiene** | Store create/open/list/delete/save via `application/tagRoll/persist.ts` + `Clock` |
| **Labs** | `singtags.labs.arranging.enabled.v1` gate |
| **Arranging A–C** | Domain/application/adapters + Coach dock + `syncTagRoll` bridge (see arranging-labs-dock plan) |
| **PA0** | `portsBoundaries.test.ts`. Grandfather list is empty. Production `domain/` and `application/` do not import adapters, Vue, Pinia, stores, components, views, or `offline/` |
| **PA1** | Tag Studio import reads stems through `CatalogAudioSource`, wired in `composition/tagStudio.ts` |
| **PA2** | `optimizeBasic` takes an optional `IdGenerator`. Omitted calls use the same `prefix_1`, `prefix_2`, … sequence as `createSequentialIdGenerator()`, implemented in domain so the eval script does not import an adapter |
| **PA3** | Labs I/O edges moved: offline readiness index, My Library zip archive, optical collection receive, recorder repository, Sing Together browser storage, WebRTC transfer, OS share helper. Drive sync, catalog browse, and the tag player stayed put |

## Remaining debt

| ID | Work | Notes |
| --- | --- | --- |
| **Arranging phase 2** | Guided rail, Why/Learn, candidate panel, melody push-while-open | [arranging-labs-dock.md](arranging-labs-dock.md) |
| **TS3 rest** | MutateNotes / MutateExpressions fully out of store | Keep store method names stable |
| **TS4** | Ratchet god SFCs when touched | No canvas rewrite |
| **TS5** | Chord SoT re-export from arranging | Prefer shim when low-risk |
| **TS7** | PianoRollViewport intent port | Defer (arranging A17) |
| **TS8** | MusicXML TTBB layout option | Defer |
| **Audio** | Single AudioPreview owner (editor vs tote vs coach) | Known dual-ownership debt |

## Pure ports-and-adapters refactor

Landed 2026-11-06. I/O moved behind ports. Tag Studio and the other Labs features keep the same behavior.

Left in place on purpose: Drive sync (Settings still shares it), catalog browse, the tag player, and Vue components that call `navigator.share` directly. The recorder store calls the same database functions through `adapters/recorder/repository.ts`. Domain and application tests may still import adapters. `sequenceEval` keeps a private default id generator so `evalGoldSequence(gold)` and the polecat eval script stay stable. God-file budgets were not raised.

**In scope, in order**

| ID | Slice | Done when |
| --- | --- | --- |
| **PA0** | Import gate in `web/src/architecture/` | `domain/` and `application/` cannot import `adapters/`, Vue, Pinia, or `offline/`. Current leaks are grandfathered and the list may only shrink. First entries: `domain/arranging/polecatGold/sequenceEval.ts` (id generator from adapters) and `application/tagRoll/importTagAudioToStudio.ts` (`offline/resolveMedia`). Test files may import adapters until the slice that owns them moves them to fakes. |
| **PA1** | Tag Studio | `importTagAudioToStudio` reads audio through a port. Store methods keep their names. New Tag Studio I/O goes through `application/tagRoll` + `composition/tagStudio.ts`. |
| **PA2** | Arranging Coach | `sequenceEval.ts` takes an `IdGenerator` argument. Domain tests inject `createSequentialIdGenerator` from the test, not from production domain code. Coach Hear stays on `AudioPreview`. |
| **PA3** | Other Labs, one feature per change | Audio Recorder, Tag Roulette, Sing Together, optical / WebRTC / OS Share, My Library. Drive sync waits until those are through, because Settings shares it. Catalog, Browse, and the tag player stay out. |

Each Labs feature in PA3 starts with a short inventory of files that touch IndexedDB, `fetch`, the filesystem, or Pinia. Only those edges move. UI layout stays in the view.

**How a slice lands without breaking the app**

1. Run the existing tests for that slice. If a behavior has no test, add a characterization test that locks today’s result before moving code.
2. Move the call behind an existing port, or add the port and a single adapter. The composition root is the only new wiring.
3. Re-run the same tests. They must pass with no expected-value edits. An assertion change means the refactor changed behavior; put the code back.
4. Shrink the PA0 grandfather list by the files just fixed. Do not raise a god-file budget in the same change.
5. Smoke the screen you touched: Tag Studio open, edit, save, and MIDI/MusicXML export; Coach Hear and Apply; for a later Labs slice, that feature’s open and save path.

**Hard bans for this refactor**

- No schema, copy, route, or visual changes.
- No god-file splits and no port moves in the same change.
- No new business rules in Vue, and no new algorithms in Pinia.
- Domain code does not construct adapters. Tests pass fakes in.

## Hard bans (unchanged)

- No Vue / Pinia / IndexedDB in pure `lib/tagRoll` helpers
- No pillars / wizard / contest / JI stuffed into `TagRollProject`
- No arranging rule classifiers in `.vue` (Approach Three stays in domain)
