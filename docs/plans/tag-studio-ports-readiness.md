# Tag Studio ports readiness — progress

> **Status:** In progress (hygiene pass complete; arranging package port is next)  
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
| **Hygiene** | Editor exports go through application use-cases + ports (no direct midi/musicxml/audioExport imports) |
| **Hygiene** | Store create/open/list/delete/save via `application/tagRoll/persist.ts` + `Clock` |
| **Labs** | `singtags.labs.arranging.enabled.v1` gate only (no routes / no package copy) |

## Remaining debt (next: arranging package port)

| ID | Work | Notes |
| --- | --- | --- |
| **Arranging port** | Copy domain+ports+bridge into Labs; consume gate | Explicit next step — do not invent a second I/O spine |
| **TS3 rest** | MutateNotes / MutateExpressions fully out of store | Keep store method names stable |
| **TS4** | Ratchet god SFCs when touched | No canvas rewrite |
| **TS5** | Chord SoT re-export from arranging | Wait for arranging H7 |
| **TS7** | PianoRollViewport intent port | Defer (arranging A17) |
| **TS8** | MusicXML TTBB layout option | Defer |
| **Audio** | Single AudioPreview owner (editor vs tote vs harmonizer) | Known dual-ownership debt |

## Hard bans (unchanged)

- No Vue / Pinia / IndexedDB in pure `lib/tagRoll` helpers
- No arranging Vue/store imports until package port; bridge/chords only as pure TS
- No pillars / wizard / contest / JI stuffed into `TagRollProject`
