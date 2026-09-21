# Tag Studio ports readiness — progress

> **Status:** Hygiene complete; arranging package port in progress (see [arranging-labs-dock.md](arranging-labs-dock.md))  
> **Updated:** 2026-09-20  
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

## Hard bans (unchanged)

- No Vue / Pinia / IndexedDB in pure `lib/tagRoll` helpers
- No pillars / wizard / contest / JI stuffed into `TagRollProject`
- No arranging rule classifiers in `.vue` (Approach Three stays in domain)
