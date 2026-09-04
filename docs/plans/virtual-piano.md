# Virtual piano — synth presets + sample piano

> **Status:** Proposed (rewrites the 2026-08-27 plan)  
> **Updated:** 2026-09-04  
> **Goal:** A polyphonic virtual piano with (1) a **partial-stack synth** using the same preset schema as Pitch Pipe Sound Lab, and (2) a **real piano sample** engine from [Leethring/piano-sound-samples](https://github.com/Leethring/piano-sound-samples) (MIT). Does **not** replace the one-note Pitch Pipe.  
> **Related:** [pitch-pipe-voice](../decisions/pitch-pipe-voice.md), Sound Lab (`PitchPipeSoundLabView.vue`), prior draft of this file (FM + SF2) — **superseded**.

---

## Why rewrite

The earlier plan targeted **2-op FM knobs + SF2 soundfont**. Since then we shipped:

- Serializable voice schema `singtags.pitchPipeVoice.v1` (partials, filter, AR)
- Labs editor/import/export/library UX at `/labs/pitch-pipe-sound`
- Shared `PitchPlayer` for pipe + pay-the-key

Rewriting the piano feature around that schema avoids a second unrelated preset language. Sample piano replaces SF2 with a known MIT MP3 set we can map and cache ourselves.

---

## Product requirements

1. **Separate from Pitch Pipe** — Pipe stays monophonic pay-the-key / `/pitch-pipe`. Piano is for chords and drills.
2. **Two engines, one keyboard**
   - **Synth** — polyphonic voice pool driven by `PitchPipeVoiceConfig` (same partials / filter / attack–release as Sound Lab).
   - **Piano sound** — one-shot (or lightly looped) samples from Leethring’s MuseScore MP3s.
3. **Multi-touch polyphony** — several pointers; glissando reassigns the same `voiceId`.
4. **Preset UX like Sound Lab** — edit / A–B / save library / set default / import–export JSON (adapted for piano scope).
5. **Offline-friendly** — after first fetch, samples play from Cache API / OPFS; clear error if missing.
6. **No silent failure** — suspended AudioContext or missing samples → visible CTA.

---

## Non-goals (v1)

- Full DX7 / multi-op FM editor (Sound Lab partials are enough for v1 synth).
- SF2/SF3 dependency.
- MIDI recorder / DAW.
- Replacing Pitch Pipe or sheet pay-the-key FAB.
- Cloud sync of presets.
- Shipping staff/keyboard **images** from Leethring (audio only).

---

## Information architecture

| Surface | Route | Purpose |
| --- | --- | --- |
| Pitch Pipe | `/pitch-pipe` | One pitch; layouts; Mellow/Bright + optional Lab override |
| Sound Lab | `/labs/pitch-pipe-sound` | Edit **pipe** default voice |
| Virtual piano | `/piano` (Labs-gated v1, recommend) | Poly keyboard; Synth \| Piano sound |

**Nav (v1 recommendation):** Labs card + More menu when enabled (`singtags.labs.virtualPiano.enabled.v1`, default off). Graduate to primary nav next to Pitch Pipe after polish — same pattern as Tag Roulette / Local Library.

**Page chrome:**

```
[ Synth | Piano ]   [ octave − / + ]   [ sustain ]   [ ⚙ ]
┌─────────────────────────────────────────────────────┐
│              PianoKeyboard (multi-touch)            │
└─────────────────────────────────────────────────────┘
┌─ Synth: Sound Lab–style knobs + presets ────────────┐
│  or Piano: load status / attribution                │
└─────────────────────────────────────────────────────┘
```

Settings (default closed): master volume, voice cap, velocity curve, A440 shared with Pitch Pipe (optional), reset.

---

## Schema

### Reuse Sound Lab voice for synth mode

Canonical type remains `PitchPipeVoiceConfig` in `web/src/audio/pitchPipeVoice.ts`:

```ts
{
  schema: 'singtags.pitchPipeVoice.v1'
  id, label, notes?
  masterGain, attackSec, releaseSec
  partials: { type, gain, semitones, detuneCents }[]
  filter: null | { type, frequencyHz, Q }
}
```

**Piano app state** (separate key so we do not hijack pipe default):

```ts
// singtags.virtualPiano.v1
{
  schema: 'singtags.virtualPiano.v1'
  engine: 'synth' | 'samples'
  /** Active synth voice — full PitchPipeVoiceConfig or id into piano library */
  synthVoiceId: string
  masterGain: number
  octaveOffset: number
  sustain: boolean
  voiceLimit: number  // e.g. 12–16
}
```

**Piano synth library** (mirror Sound Lab library pattern):

- Key: `singtags.virtualPiano.synthLibrary.v1` (max ~32)
- Entries are full `PitchPipeVoiceConfig` objects
- Ship 3 built-ins adapted from pipe classics: **Mellow**, **Bright**, plus one **Bell-ish** (higher partial + short release) — editable in-lab

**Important product split:** Setting a piano synth default must **not** call `setActivePitchPipeVoice` unless the user explicitly chooses “Also use for Pitch Pipe.” Sound Lab continues to own pipe/pay-the-key.

### Sample engine config

```ts
// embedded or separate map module — not user-edited JSON in v1
{
  id: 'leethring-piano'
  label: 'Acoustic piano (Leethring)'
  license: 'MIT'
  attribution: 'Liam Lee / Leethring piano-sound-samples'
  rootUrl: '/instruments/leethring-piano/'  // or CDN
  /** midi → relative mp3 path after our naming map */
  map: Record<number, string>
}
```

---

## Architecture

```
PianoView.vue
  ├─ PianoKeyboard.vue           # pointer → note events
  ├─ PianoSynthPanel.vue         # Sound Lab–style knobs + library (reuse components where possible)
  ├─ PianoSamplePanel.vue        # load / progress / attribution
  └─ composables/usePianoEngine.ts
        ├─ PartialsPolyEngine.ts   # voice pool of PitchPlayer-like graphs
        └─ SamplePianoEngine.ts    # AudioBufferSourceNode per note
```

### Shared engine interface

```ts
interface PianoEngine {
  readonly id: 'synth' | 'samples'
  noteOn(midi: number, velocity: number, voiceId: string): void
  noteOff(voiceId: string): void
  allNotesOff(): void
  setMasterGain(g: number): void
  dispose(): void
}

interface SynthPianoEngine extends PianoEngine {
  setVoice(cfg: PitchPipeVoiceConfig): void
  restartIfPlaying(): void  // live Lab tweaks
}
```

### Partials poly engine

- Clone the **graph** from `PitchPlayer` (partial oscillators → gains → optional filter → voice gain) once per active voice.
- Monophonic `PitchPlayer` stays as-is for pipe; extract shared `buildPartialsVoice(ctx, cfg)` helper to avoid drift.
- Steal policy: oldest non-sustained voice when over `voiceLimit`.
- Attack/release from voice config; velocity scales voice gain.

### Sample piano engine

- Decode MP3 → `AudioBuffer` (reuse app decode helpers where safe).
- `noteOn`: `AudioBufferSourceNode` + gain envelope (short attack, release on `noteOff`); natural sample decay if note held.
- Missing MIDI: nearest-neighbor sample + `playbackRate` pitch shift (±2–3 semitones max before quality warning), **or** leave gaps only if map is complete for 88 keys.
- Lazy-load: decode on first use per key; optional prefetch visible octave.

---

## Leethring samples — integration notes

| Item | Detail |
| --- | --- |
| Repo | https://github.com/Leethring/piano-sound-samples (MIT © 2020 Liam Lee) |
| Audio | MuseScore-exported **MP3** under `sound_keyboard_staff/` |
| Naming | Non-MIDI (`A_2`, `C`, `aa`, `Cs`, `a1`, `high…`) — need an explicit **MIDI ↔ filename** table in code + unit tests |
| Bundle | Prefer curated **88 naturals+accidentals** subset (dedupe enharmonics); document MB size |
| Hosting | `web/public/instruments/leethring-piano/` **or** S3 `/instruments/…` + first-run cache (same pattern as offline media) |
| Attribution | In-panel credit + `docs/` / NOTICE; keep LICENSE text with vendored files |
| Skip | PNG/JPG staff/keyboard images, Anki deck, `.mscz` |

**Phase 0 spike:** script a map for A0–C8; measure total MP3 bytes; decide bundle vs CDN.

---

## Sound Lab UX reuse

| Sound Lab capability | Piano synth panel |
| --- | --- |
| Partials / filter / AR sliders | Same controls bound to active piano library voice |
| A/B vs classic | A/B vs built-in Mellow/Bright |
| Save to library / rename / delete | Piano library key (not pipe library) |
| Export / import JSON | Same `PitchPipeVoiceConfig` files — **interoperable** with Sound Lab exports |
| “Set as default” | Default for **piano synth mode only** |
| Optional | “Also set as Pitch Pipe voice” secondary action |

Prefer extracting shared form bits (`VoicePartialsEditor.vue` or similar) rather than duplicating `PitchPipeSoundLabView.vue`.

---

## Phased delivery

### Phase 0 — Spec + sample map (½–1 day)

- Confirm Labs gate + route `/piano`.
- Build MIDI ↔ Leethring filename map; size budget; LICENSE copy path.
- Decide extract `buildPartialsVoice` from `pitchPlayer.ts`.
- Short ADR addendum under pitch-pipe-voice or new `docs/decisions/virtual-piano.md` if hosting choice is non-obvious.

### Phase 1 — Keyboard + synth polyphony

- Route + Labs flag + More/Labs links.
- `PianoKeyboard` multi-touch + mouse.
- `PartialsPolyEngine` with built-in Mellow voice.
- Octave shift, master volume, dispose on leave.

**Exit:** Two fingers, two pitches; no stuck notes; no AudioContext leak after repeated visits.

### Phase 2 — Sound Lab–aligned presets

- Synth panel + library persistence.
- Import/export `singtags.pitchPipeVoice.v1`.
- Optional “Also use for Pitch Pipe.”

**Exit:** Reload restores engine + voice; imported Sound Lab JSON plays polyphonically.

### Phase 3 — Piano sound (samples)

- Vend/map Leethring MP3s; `SamplePianoEngine`.
- Mode toggle Synth \| Piano; load/error/offline UI; attribution.
- Cache after first success.

**Exit:** Offline replay of cached samples; mode switch cancels in-flight notes cleanly.

### Phase 4 — Polish

- Sustain; velocity curve; desktop width; voice-steal tests; iOS/Android PWA QA.

---

## Testing

| Layer | What |
| --- | --- |
| Unit | MIDI↔Leethring map; voice steal order; clamp of shared voice schema |
| Component | Pointer → noteOn/noteOff with mocked engine |
| Audio smoke | Partials poly + one sample note (manual / automated if harness exists) |
| Manual | Multi-touch phone; headphones; background resume |

---

## Performance & memory

- One shared `AudioContext`.
- Cap concurrent MP3 decodes (1–2).
- Sample set size called out on first load (“Download ~X MB piano sounds”).
- Prefer decode-once buffers keyed by MIDI.

---

## Accessibility

- Keys as buttons with note labels (`C4`, `D♯4`).
- Settings in real disclosure.
- Active key: outline + `aria-pressed`, not color alone.

---

## Security / licensing

- MIT samples: retain copyright notice with vendored files; UI attribution.
- No remote script eval — fetch MP3/JSON map only.

---

## Open questions

1. **Nav:** Labs-gated first (**recommended**) vs primary nav day one vs fold into Pitch Pipe?
2. **Hosting:** Bundle ~subset in repo vs S3 `/instruments` + cache-on-first-use?
3. **Shared A440 / cents** with Pitch Pipe prefs? (**Recommend yes** for synth; samples already fixed to concert pitch — apply cents via `playbackRate` if desired.)
4. Extract shared Voice editor component in Phase 2 or duplicate lightly then refactor?

---

## Implementation checklist

**Phase 0**

- [ ] MIDI ↔ filename map + size note
- [ ] Labs flag / route decision recorded

**Phase 1**

- [ ] `/piano` + keyboard + `PartialsPolyEngine`
- [ ] Dispose / steal / octave / volume

**Phase 2**

- [ ] Synth library + Sound Lab–style panel
- [ ] Import/export interoperability

**Phase 3**

- [ ] Leethring assets + `SamplePianoEngine`
- [ ] Mode toggle + offline cache + attribution

**Phase 4**

- [ ] Sustain, velocity, tests, device QA

---

## Relationship to Pitch Pipe (unchanged)

Pitch Pipe keeps:

- Single-note `PitchPlayer`
- Layouts (grid / list / vertical piano strip)
- Concert A + fine detune
- Sound Lab as the **pipe** voice editor

Virtual piano shares **schema + graph helper**, not the monophonic UX.
