# Virtual piano — feature implementation plan

> **Status:** proposed (not implemented)  
> **Created:** 2026-08-27  
> **Goal:** A dedicated multi-touch virtual piano page with two engines — an FM-style synth with tweakable knobs, and a soundfont sampler — without replacing the one-note Pitch Pipe.  
> **Related:** Pitch Pipe (`/pitch-pipe`, `PitchPipeView.vue`, `pitchPlayer.ts`); playback DSP plan in [pitch-speed-bake](../decisions/pitch-speed-bake.md).

---

## Product requirements

1. **Separate from Pitch Pipe**
   - Pitch Pipe stays the pay-the-key / single-pitch tool (hold one note, concert A, fine cents, layout presets).
   - Virtual piano is for chords, harmony drills, and longer play sessions.
2. **Two engines behind one keyboard**
   - **Synth mode** — FM / subtractive-leaning Web Audio voice with knobs (oscillators, modulation, LFO, envelope, filter).
   - **Soundfont mode** — sample-based instrument from SF2/SF3 (or equivalent decoded bank).
3. **Multi-touch polyphony**
   - Several fingers / pointers can hold different notes at once.
   - Mouse click-drag glissando and keyboard shortcuts are nice-to-haves after touch works.
4. **Mobile-first playability**
   - Keyboard usable on phone (1–2 octaves visible; octave shift).
   - Desktop can show a wider span.
5. **Offline-friendly**
   - App shell already offline; soundfont assets must be cacheable (Cache API / OPFS) after first load.
6. **No silent failure**
   - If a soundfont fails to load or AudioContext is suspended, show a clear UI error / CTA — do not sit silent.

---

## Non-goals (v1)

- Full DX7 / 6-operator editor.
- MIDI file player, recording, or DAW timeline.
- Microtonal / just-intonation beyond optional global cents (can share Pitch Pipe’s A440/432 later).
- Replacing Pitch Pipe or sheet “pay the key” FAB.
- Cloud sync of synth presets (localStorage / IndexedDB only for v1).

---

## Information architecture

| Surface | Route | Purpose |
| --- | --- | --- |
| Pitch Pipe | `/pitch-pipe` | One pitch at a time; layouts grid / wide list / vertical piano |
| Virtual piano | `/piano` (proposed) | Polyphonic keyboard; Synth \| Soundfont |

**Nav:** Add **Piano** next to Pitch Pipe (top nav + bottom tab). Keep labels distinct so users do not confuse single-pitch vs poly.

**Page chrome (proposed):**

```
[ Synth | Soundfont ]   [ octave − / + ]   [ sustain ]   [ ⚙ settings ]
┌─────────────────────────────────────────────────────┐
│                 PianoKeyboard (multi-touch)         │
└─────────────────────────────────────────────────────┘
┌─ Synth knobs / Soundfont instrument picker ─────────┐
│  (collapsible panel; defaults sensible)             │
└─────────────────────────────────────────────────────┘
```

Settings dropdown (default closed) can hold: velocity curve, voice count, master volume, A reference if shared, “reset presets”.

---

## Architecture

```
PianoView.vue
  ├─ PianoKeyboard.vue          # pointer → note events only
  ├─ SynthPanel.vue             # knobs + presets (synth mode)
  ├─ SoundfontPanel.vue         # instrument select + load state
  └─ composables/usePianoEngine.ts
        ├─ engines/SynthEngine.ts
        └─ engines/SoundfontEngine.ts
```

### Shared engine interface

```ts
interface PianoEngine {
  readonly id: 'synth' | 'soundfont'
  noteOn(midi: number, velocity: number, voiceId: string): void
  noteOff(voiceId: string): void
  allNotesOff(): void
  setMasterGain(g: number): void
  /** Engine-specific params; ignored keys are no-ops. */
  setParam(key: string, value: number | string): void
  dispose(): void
}
```

- `voiceId` = stable id per pointer (`pointer-${pointerId}`) or keyboard key, so glissando can noteOff previous + noteOn next under the same id.
- UI never talks to Web Audio nodes directly.

### Audio graph (high level)

**Synth voice (v1 target):**

```
Osc A ──┐
        ├─→ Gain (AM/FM mix) → Filter (LP) → VoiceGain (ADSR) ─┐
Osc B ──┘   ↑ LFO → pitch and/or cutoff                        │
                                                               ├→ MasterGain → destination
```

Start with **2 operators**: carrier + modulator (FM) *or* dual oscillators into a filter (user-visible “FM feel” via mod index + ratio). Prefer one clear topology in code comments so knobs map 1:1.

**Soundfont:**

```
Decoded sample / SF player → per-voice gain → MasterGain → destination
```

Library choice deferred to Phase 3 selection gate (see below).

---

## Multi-touch keyboard design

### Pointer model

1. `touch-action: none` on the keyboard surface; `preventDefault` on `pointerdown`.
2. Map each `pointerId` → `{ midi, voiceId }`.
3. `pointerdown` on a key → `noteOn`.
4. `pointermove` (captured) across keys → if midi changed, `noteOff` old + `noteOn` new (same `voiceId`).
5. `pointerup` / `pointercancel` / `lostpointercapture` → `noteOff`.
6. Sustain pedal (UI toggle): defer `noteOff` until sustain released; track sustained voice set.

### Polyphony limits

| Mode | Soft cap | On overflow |
| --- | --- | --- |
| Synth | 12–16 voices | Steal oldest non-sustained voice |
| Soundfont | Library / decode budget (often 16–32) | Same steal policy |

### Layout

- **Horizontal piano** primary (white keys in a row, black keys overlaid).
- Black keys: rounded corners; **height ≥ 50% of white key length**; easy hit targets on touch.
- Visible range: default ~14–17 white keys on phone; octave shift buttons.
- Optional later: reuse Pitch Pipe’s vertical piano strip as an alternate layout — **not required for v1**.

### Velocity

- Prefer `event.pressure` when `> 0`; else default ~0.7.
- Optional settings curve (linear / soft) in Phase 4.

---

## Synth mode — knobs & presets

### v1 parameter set (keep short)

| Param | Range (suggested) | Maps to |
| --- | --- | --- |
| Volume | 0–1 | Master / voice scale |
| Ratio | 0.5–8 | Modulator:carrier frequency ratio |
| Mod index | 0–10 | FM depth |
| Cutoff | 200–8k Hz | Low-pass |
| Resonance | 0–20 | Filter Q |
| Attack / Decay / Sustain / Release | times + level | ADSR on voice gain |
| LFO rate | 0.1–12 Hz | LFO |
| LFO depth | 0–1 | → pitch cents and/or cutoff |
| LFO target | pitch \| cutoff \| both | Routing |

Persist last knob state + selected preset in `localStorage` (e.g. `singtags.pianoSynth.v1`).

### Presets (ship 3)

1. **Bell** — higher ratio, short decay, moderate mod.
2. **Brass-ish** — lower ratio, slower attack, filter open.
3. **Soft pad** — low mod, long release, gentle LFO on cutoff.

“Reset to preset” must not require a reload.

---

## Soundfont mode

### Selection gate (before locking a library)

Evaluate candidates against:

1. Works under Vite (import or WASM path clear).
2. `noteOn` / `noteOff` with velocity.
3. Reasonable mobile CPU for 8+ voices.
4. License OK for bundling or CDN + cache.
5. Can load from `ArrayBuffer` (so we can stash in Cache API / OPFS).

**Candidates to spike (pick one):** `smplr`, midi.js-style soundfont loaders, or a minimal custom SF2 parser if a dependency fails the gate.

### Assets

- v1: **one** instrument (recommend acoustic piano *or* soft choir “ooh” — product pick at Phase 3 start).
- Host under `web/public/soundfonts/` or media CDN; document size in the PR.
- After first successful fetch: cache with SW runtime caching or explicit Cache API put.
- Offline: if missing, show “Connect once to download piano sounds”.

### Instrument UI

- Dropdown (even if only one option at first).
- Loading progress / error text.
- Optional “Use synth while loading” fallback.

---

## Phased delivery

### Phase 0 — Spec lock (½ day)

- Confirm route name (`/piano`), nav label, default soundfont instrument.
- Confirm synth topology (2-op FM vs dual-osc + filter).
- Add this doc’s open questions answers in a short ADR if decisions diverge.

### Phase 1 — Keyboard + polyphony proof

**Deliver**

- `/piano` route + nav links.
- `PianoKeyboard` with multi-touch + mouse.
- Minimal engine: 2 oscillators (or 2-op FM with fixed params), ADSR, voice pool, steal policy.
- Octave shift; master volume.

**Exit criteria**

- Two fingers hold two pitches on a phone.
- Glissando across keys does not stick notes.
- Leaving the page `dispose()`s context/nodes (no leak in DevTools after 10 visits).

### Phase 2 — Synth panel

**Deliver**

- `SynthPanel` knobs bound to `setParam`.
- 3 presets + persistence.
- Collapsible settings dropdown (default closed) for secondary options.

**Exit criteria**

- Tweaking mod index / cutoff is audible within ~1 buffer quantum.
- Reload restores last preset / knobs.

### Phase 3 — Soundfont engine

**Deliver**

- Library spike + chosen dependency.
- `SoundfontEngine` implementing `PianoEngine`.
- Mode toggle Synth \| Soundfont sharing the same keyboard.
- Offline cache path + empty/error states.

**Exit criteria**

- Mode switch does not drop the page; in-flight notes cancelled cleanly (`allNotesOff`).
- Second visit offline still plays the cached instrument (or clear message).

### Phase 4 — Polish

- Sustain toggle; optional velocity curve.
- Wider desktop keyboard; safe-area / landscape.
- Basic unit tests: voice steal, pointer id mapping, param clamp.
- Manual QA checklist on iOS Safari + Android Chrome (installed PWA).

---

## Testing strategy

| Layer | What |
| --- | --- |
| Unit | MIDI↔note helpers; param clamps; voice allocator steal order |
| Component | Pointer down/up/move produces expected `noteOn`/`noteOff` sequence (mocked engine) |
| Manual | Multi-touch device; headphones; background/foreground AudioContext resume |
| Perf | 8-voice synth on mid Android; no obvious audio underruns |

Do **not** rely on pure sine coupling tests from the pitch/speed plan; this feature is live synthesis/sampling, not bake DSP.

---

## Performance & memory budgets

- Prefer one shared `AudioContext` (or reuse app shared context if already exposed) — never spawn per note.
- Cap concurrent decodes for soundfont to 1–2.
- Synth: avoid per-note `createOscillator` storms without pooling if profiling shows GC pressure; v1 may allocate per noteOn if steal/`stop()` is correct, then pool in Phase 4 if needed.
- Soundfont bank size: call out MB in UI the first time (“Download ~X MB piano samples”).

---

## Accessibility

- Keys are buttons (or `role="button"`) with aria-labels (`C4`, `D♯4`, etc.).
- Settings in a real `<details>` / disclosure, not hover-only.
- Do not rely on color alone for active keys (outline + `aria-pressed`).
- Screen-reader users can still trigger notes via keyboard focus + Space/Enter (single note); chord playing via AT is best-effort.

---

## Security / licensing

- Vend soundfonts only with compatible licenses; record attribution in `docs/` or README section.
- No eval of remote instrument scripts — fetch binary / JSON sample maps only.

---

## Open questions

1. Default soundfont instrument: **piano** vs **choir ooh**?
2. Bundle soundfont in repo vs CDN + cache-on-first-use?
3. Synth topology: **2-op FM** vs **dual osc + filter** as the primary “FM feel”?
4. Should concert A / fine cents from Pitch Pipe apply to Piano (shared prefs) or stay independent?
5. Bottom-tab icon: reuse Pitch Pipe entry or separate tab (tab bar is already crowded)?

---

## Implementation checklist (copy into PR)

**Phase 1**

- [ ] Router + `PianoView` shell
- [ ] `PianoKeyboard` multi-touch
- [ ] `SynthEngine` minimal + voice steal
- [ ] Octave + volume
- [ ] Dispose on unmount

**Phase 2**

- [ ] Knob panel + presets + persistence
- [ ] Settings disclosure (default closed)

**Phase 3**

- [ ] Soundfont library spike write-up (short note in PR)
- [ ] `SoundfontEngine` + mode toggle
- [ ] Offline cache + error UI

**Phase 4**

- [ ] Sustain, velocity curve, desktop width
- [ ] Tests + device QA notes

---

## Relationship to Pitch Pipe (already shipping)

Pitch Pipe continues to own:

- Single-note hold-to-sound (`PitchPlayer`)
- Layouts: grid, wide list, vertical piano (high pitches toward the top)
- ♯ / ♭ labels; light / mid-dark key colors
- Concert A + fine detune
- Collapsible settings

Virtual piano must **not** regress those flows; shared code should be limited to note/MIDI helpers and glyph formatting where reuse is obvious.
