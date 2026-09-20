# Tag Studio ports readiness — progress

> **Status:** In progress (TS0–TS3 started; TS5/TS7/TS8 deferred)  
> **Updated:** 2026-09-20  
> **Decision:** [tag-studio-ports.md](../decisions/tag-studio-ports.md)  
> **Prompt:** [tag-studio-ports-rewrite.md](../prompts/tag-studio-ports-rewrite.md)

## Done this pass

| ID | Work |
| --- | --- |
| **TS0** | ADR + architecture pointer |
| **TS2** | `applyHarmony` / tempoMap / normalize free of `offline/` imports; ids via `IdGenerator` or `allocatePrefixedId` |
| **TS1** | `ports/` + `adapters/tagRoll/` + `composition/tagStudio.ts` |
| **TS6** | `LibraryIngest` port; save use-case no longer imports Pinia |
| **TS3** | First use-cases: apply harmony, export MIDI/MusicXML, persist helpers; store delegates |

## Remaining debt

| ID | Work | Notes |
| --- | --- | --- |
| **TS3 rest** | MutateNotes / MutateExpressions / Create-Open CRUD fully out of store | Keep store method names stable |
| **TS4** | Ratchet god SFCs (editor / viewport / harmonize panel) when touched | No canvas rewrite |
| **TS5** | Chord SoT re-export from arranging | Wait for arranging H7 |
| **TS6 polish** | Sheet PNG + bounce behind ports end-to-end from editor | Adapter exists; wire more call sites as needed |
| **TS7** | PianoRollViewport intent port | Defer (arranging A17) |
| **TS8** | MusicXML TTBB layout option | Defer |
| **Audio** | Single AudioPreview owner (editor vs tote vs harmonizer) | Known dual-ownership debt |

## Hard bans (unchanged)

- No Vue / Pinia / IndexedDB in pure `lib/tagRoll` helpers
- No arranging Vue/store imports; bridge/chords only as pure TS when added
- No pillars / wizard / contest / JI stuffed into `TagRollProject`
