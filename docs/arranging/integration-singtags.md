# Integrating with SingTags (`../barbershop-website`)

This `web/` app mirrors SingTags Tag Studio tooling and layout for Labs merge.

**Alignment detail (document bridge, ports suggestions, PR order):** [`tag-studio-alignment.md`](tag-studio-alignment.md).  
**Agent prompt (right-dock Labs integration):** [`prompts/arranging-labs-dock-integration.md`](prompts/arranging-labs-dock-integration.md).  
**Pre-integration Tag Studio hygiene:** [`prompts/tag-studio-pre-integration.md`](prompts/tag-studio-pre-integration.md).

## Shared toolchain

| Concern | Arranging | SingTags |
| --- | --- | --- |
| Vite + Vue 3 + Pinia + vue-router | yes | yes |
| vite-plugin-pwa | yes | yes |
| Vitest (+ coverage thresholds) | yes | yes |
| IBM Plex (fontsource) + Font Awesome | yes | yes |
| happy-dom / fake-indexeddb | yes | yes |
| God-file architecture test | `src/architecture/godFiles.test.ts` | same pattern |

## Parallel layout

| Here | SingTags |
| --- | --- |
| `web/src/lib/tagRoll/harmonizer/chords.ts` | **re-export shim** → `domain/arranging/chords` (H7) |
| `web/src/lib/tagRoll/zoomPan.ts` | Tag Roll pinch zoom |
| `web/src/domain/arranging/*` | new pure domain (merge as package) |
| `web/src/application/*` | use-cases |
| `web/src/ports/*` + `composition/` | DI boundary |
| `web/src/offline/arrangingDb.ts` | mirrors `offline/tagRollDb.ts` |
| `web/src/domain/arranging/history.ts` | mirrors `lib/tagRoll/history.ts` |
| `web/src/stores/arrangement.ts` | beside `tagRoll.ts` on merge |
| `web/src/audio/stackPlayer.ts` | replace with pitchTone later |
| MusicXML | **shipped** `adapters/musicxml` + port | `lib/tagRoll/musicxmlExport.ts` |
| MIDI SMF | `adapters/midi` (+ JI bends) | `lib/tagRoll/midiExport.ts` (`one`/`two`/`all`) |
| TagRoll bridge | `domain/arranging/bridge/*` | call from SingTags on promote/open |

## Document models

| Schema | Role |
| --- | --- |
| `singtags.tagRoll.project.v1` | Piano-roll notes + parts + expressions (Tag Studio) |
| `arranging.arrangement.v1` | Melody + pillars + stacks + coach state |

Do **not** merge schemas. Use a pure **bridge** (`tagRollBridge`) for open/promote/export sharing — see alignment doc §2.

## Merge strategy

1. Keep domain/application pure — SingTags UI can swap adapters.
2. Prefer copying `domain/arranging` + ports into SingTags Labs (`/labs/arranging`).
3. Chord IDs / voicing strings must stay identical (H7 + SingTags re-export).
4. Labs gate: `singtags.labs.arranging.enabled.v1`.
5. Tag Studio readiness: inject `IdGenerator` into `applyHarmony`, wrap IDB/MIDI/MusicXML behind ports, thin Pinia over time ([`tag-studio-alignment.md`](tag-studio-alignment.md) §4).

## Knowledge corpus

Rules live in repo-root `knowledge/`. On merge: `docs/arranging-knowledge/` or a frozen JSON ruleset.
