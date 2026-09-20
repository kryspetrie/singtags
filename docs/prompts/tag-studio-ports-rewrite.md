# Prompt: Tag Studio ports rewrite (full framing)

Paste-oriented companion to [tag-studio-ports-readiness.md](tag-studio-ports-readiness.md). Reflects Tag Studio as of 2026-09 and arranging’s ports/bridge.

For agent work on this repo, prefer the shorter checklist in the readiness prompt; this file is the fuller north-star framing.

## North star

Refactor Tag Studio toward the same ports/adapters shape as `../arranging`, incrementally, so Labs merge later is a copy of domain+ports+bridge—not a second architecture.

```
web/src/ports/                 # interfaces only
web/src/adapters/…             # IDB, MIDI, MusicXML, bounce, library, audio
web/src/application/tagRoll/   # use-cases
web/src/composition/tagStudio.ts
web/src/stores/tagRoll.ts      # thin façade
web/src/lib/tagRoll/           # pure domain helpers (no Vue/Pinia/IDB)
Vue views/components           # render + emit intents only
```

## Ordered work

| ID | Work | Status target |
| --- | --- | --- |
| TS0 | ADR: domain → application → ports → adapters; schemas stay separate | Done |
| TS2 | Inject IdGenerator; kill IDB imports from pure helpers | Done |
| TS1 | Ports + composition; wrap repository / MIDI / MusicXML / … | Done |
| TS6 | LibraryIngest; remove Pinia from save path | Done |
| TS3 | Thin Pinia; extract Create/Open/Persist, ApplyHarmony, Export* | Started |
| TS4 | Ratchet god SFCs when touched | Ongoing |
| TS5 | Chord re-export after arranging H7 | Deferred |
| TS7 | PianoRollViewport intents | Deferred |
| TS8 | MusicXML `perPart` \| `ttbb` | Deferred |
| TS9 | Never merge arrangement fields into TagRoll schema | Forever |

## Hard bans

- No Vue / Pinia / IndexedDB / localStorage in pure `lib/tagRoll` helpers
- No new business rules in Vue SFCs; no store algorithm growth
- No importing arranging Vue/store; bridge/chords only as pure TS when added
- No pillars / wizard / contest / JI in `TagRollProject`
- Do not treat engraver or bounce oscillators as document SoT
- Do not copy arranging coach rules into Tag Studio components

## Sibling references

- `../arranging/docs/tag-studio-alignment.md` (TS0–TS9, A-TS*)
- `../arranging/docs/integration-singtags.md`
- `../arranging/web/src/ports/` + `composition/createAppServices.ts`
- Bridge: `../arranging/web/src/domain/arranging/bridge/tagRollBridge.ts`

Progress: [tag-studio-ports-readiness.md](../plans/tag-studio-ports-readiness.md) · Decision: [tag-studio-ports.md](../decisions/tag-studio-ports.md)
