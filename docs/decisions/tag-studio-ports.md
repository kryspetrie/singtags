# Tag Studio ports / adapters layering (accepted)

**Status:** accepted / in progress  
**Date:** 2026-09-20  

## Decision

Tag Studio (Tag Roll) and future Arranging Labs share the same layering north star as the sibling arranging app:

**domain (pure) → application (use-cases) → ports (interfaces) → adapters (IDB, MIDI, MusicXML, bounce, library, audio)**

- **Pinia** holds the open document, selection, playhead, and UI session state; it calls use-cases — it is not where new business algorithms grow.
- **Vue** renders and emits intents only.
- **Composition root** (`web/src/composition/tagStudio.ts`) wires adapters once; tests inject fakes.

## Schemas stay separate

| Document | Schema |
| --- | --- |
| Tag Studio | `singtags.tagRoll.project.v1` |
| Arranging (future Labs) | `arranging.arrangement.v1` |

Do **not** fold pillars, wizard step, contest profile, or just-intonation fields into `TagRollProject`. Share via a pure bridge on open / promote / export only (bridge lives in arranging first).

## Port inventory (wrap existing)

| Port | Adapter wraps |
| --- | --- |
| `TagRollRepository` | `offline/tagRollDb.ts` |
| `IdGenerator` / `Clock` | `newLocalId` / `Date.now` |
| `MidiExporter` | `lib/tagRoll/midiExport.ts` |
| `MusicXmlExporter` | `lib/tagRoll/musicxmlExport.ts` |
| `AudioBounce` | `lib/tagRoll/audioBounce.ts` |
| `LibraryIngest` | Local Library (Pinia-free use-case) |

## Explicitly deferred

- **TS5** — chord tables re-export from arranging domain (after arranging H7)
- **TS7** — intent-based piano-roll viewport port
- **TS8** — MusicXML `layout: 'perPart' | 'ttbb'`
- **TS9** — never merge arrangement fields into the TagRoll schema
- Full store thinning (remainder of **TS3**) and god-file splits (**TS4**) ratchet when touched

## References

- Sibling: `../arranging/docs/implementation-plan.md` §0, `../arranging/docs/tag-studio-alignment.md`
- In-repo prompt: [tag-studio-ports-rewrite.md](../prompts/tag-studio-ports-rewrite.md)
- Progress / debt: [tag-studio-ports-readiness.md](../plans/tag-studio-ports-readiness.md)
