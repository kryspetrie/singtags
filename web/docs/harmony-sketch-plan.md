# Plan: Harmony sketch strip (MuseScore-style)

Working product plan for Tag Studio. Sketch lives on `TagRollProject`; detect fills holes only; default quality on coach propose is `major`.

## Target

**Harmony sketch** = time-aligned chord labels on the roll (root + quality). Playback can audition Lead + block chords before TTBB stacks. Coach Pillars sync with locked sketch spans (roots/spans); Chords still write stacks.

## Phases

| Phase | Deliverable |
|-------|-------------|
| **0** | Docs + UI copy toward Harmony / Sketch |
| **1** | Persist `harmonySketch`; strip shows sketch first, detect as ghosts until locked |
| **2** | Span Hear + transport schedules locked sketch block chords under Lead |
| **3** | Key anytime (toolbar); Chord / Number entry into the same sketch record |
| **4** | Coach pillars ↔ locked sketch sync |
| **5** | MusicXML chord symbols from locked sketch |

## Rules

- Detect never overwrites locked sketch; only fills holes.
- Absolute roots stay when key changes; RN labels re-spell.
- Stacks remain the Chords / Apply path — sketch is not TTBB.
