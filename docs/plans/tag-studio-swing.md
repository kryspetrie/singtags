# Tag Studio — swing playback & export bake

> **Status:** Implemented (S0–S4)  
> **Created:** 2026-09-20  
> **Related:** [tag-roll.md](tag-roll.md), [tag-studio-hardening.md](tag-studio-hardening.md) (playback/export honesty), [product-honesty.md](product-honesty.md)

## Goal

Add optional **swing / shuffle feel** to Tag Studio playback and exports without rewriting the piano-roll edit grid.

- **Edit / display:** always straight score ticks (PPQ 480).  
- **Hear / bounce MP3:** swing is always **baked into wall-clock audio** when enabled (what you hear is what you get).  
- **MIDI export:** optional **Bake swing into score** — rewrite note onsets/durations into unequal ticks at straight tempo so DAWs that ignore “feel” still play swung.

## Model

```ts
type TagRollSwingUnit = 'eighth' | 'sixteenth'
type TagRollSwingStyle = 'ratio' | 'triplet'

type TagRollSwing = {
  enabled: boolean
  unit: TagRollSwingUnit
  /** `ratio`: amount morphs straight → heavy (toward dotted). `triplet`: amount morphs straight → 2:1 shuffle. */
  style: TagRollSwingStyle
  /** 0 = straight, 1 = full target for style. */
  amount: number
}
```

Defaults: `{ enabled: false, unit: 'eighth', style: 'triplet', amount: 0.67 }` when enabling from UI; stored amount still 0 when disabled.

Project fields: `swing`, `midiBakeSwing` (default true), `metronomeSwing` (default true).

### Intensity

| amount | Feel (triplet style) |
| --- | --- |
| 0 | Straight |
| ~0.67 | Classic shuffle (off-beat near last third of the pair) |
| 1 | Full triplet lock |

`ratio` style uses a heavier target (~0.75 split) for “hard swing / dotted” without locking to exact triplets.

### Unit

- **eighth** — delay even 8ths (pair = one quarter in 4/4).  
- **sixteenth** — delay even 16ths (pair = one eighth).

## Timing algorithm

Pure helper: `web/src/lib/tagRoll/swingMap.ts`

Within each swing **pair** (two units):

1. Split ratio `r = lerp(0.5, target, amount)` (`target` = ⅔ for triplet style, ¾ for ratio).  
2. Map first half of the pair onto `[0, r)`, second half onto `[r, 1)`.  
3. **Wall-clock** (playback + MP3):  
   `wallSec(t) = pairStartSec + (swungLocal / pairLen) * (pairEndSec - pairStartSec)`  
   where `pairStartSec` / `pairEndSec` come from existing `secondsAtTick` (tempo + fermata honesty).  
4. **Bake to score ticks** (MIDI option):  
   `bakedTick = pairStart + swungLocal` (same warp in tick space).

Compose with rit/accel/fermata via endpoint `secondsAtTick` on pair boundaries — do not invent a second tempo map.

## MIDI: “Bake swing into score”

Export UI (MIDI submenu):

- Checkbox **Bake swing into MIDI** (default **on**; shown when swing is enabled).  
- When **on:** export notes after `bakeSwingIntoNotes` at the project’s normal tempo map.  
- When **off:** export straight score ticks.

MP3 / WAV bounce: **always** uses swung wall-clock when `swing.enabled`.

## UX

Sound popover:

- Swing toggle, unit, feel, amount (+ Shuffle notch / snap)  
- **Swing click** — with metronome + swing, click swung subdivisions instead of beats only  

MIDI export: bake checkbox as above.

Live playhead remains in **score ticks** (may drift visually vs ear within a beat — same class as rit).

## Phases

| ID | Work | Status |
| --- | --- | --- |
| **S0** | `swingMap` + unit tests | Done |
| **S1** | Schema / normalize / history / JSON; Sound popover | Done |
| **S2** | Live scheduler uses swung wall-clock | Done |
| **S3** | Bounce MP3 always swung; MIDI bake option | Done |
| **S4** | Metronome swing subdivisions + polish | Done |

## Non-goals

- Baking swing permanently into the edited document (no destructive “Convert to straight grid”)  
- Region envelopes, odd-meter swing, sheet engraving of swung rhythms  
- Arranging-schema fields  

## Test plan

- [x] Pure map: amount 0 identity; triplet 1 → ⅔ split; sixteenth pair length  
- [x] Bake: note on even 8th moves later; duration stays coherent  
- [x] Bounce: offbeat onset later; pair endpoint unchanged  
- [x] MIDI bake on/off differs when swing enabled  
- [x] Normalize round-trip; missing swing defaults safely  
- [x] Metronome subdivisions crossed at swing unit  
