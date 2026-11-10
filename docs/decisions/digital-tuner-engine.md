# Digital Tuner engine — multi-F0 kill-gate (accepted)

**Status:** accepted — **Conditional**  
**Date:** 2026-11-10  
**Plan:** [digital-tuner.md](../plans/digital-tuner.md) Phase 4

## Decision

Ship the Chord Analyze / Rehearsal stack surface as **Assisted** (Phase 4 Conditional):

- Synthetics meet Go: Locked / Shifted / Fix discrimination ≥95% and nature ID ≥90% under pinned nature+root (`runSyntheticKillGate()`).
- Real / labeled-proxy quartet room-mic fixtures are **not** measured yet → do **not** claim unassisted Go.
- Product consequence (locked in plan): Assisted banner; pin nature/root for reliable coloring; no extra Labs flag; still pitch-order rows (no TTBB labels).

Classical DFT peak multi-F0 (`audio/tuner/multiF0.ts`) + `scoreChordStack` + `matchNatureFromPcs` are the v1 path. ML / multi-mic require a new ADR.

## Evidence (synthetics)

Battery: natures `seventh` + `major`; roots C3/F3/G3; cases locked / +18¢ shifted / single-voice fault. Frames = Hann-windowed sine stacks @ 48 kHz / 8192. Provenance: generated in-test (`synthStackFrame` / `jiStackHz`) — not room mic.

| Metric | Threshold (Go) | Measured |
| --- | --- | --- |
| Status discrimination | ≥95% | ≥95% (CI `killGateEval.test.ts`) |
| Nature ID (PC set) | ≥90% | ≥90% (same harness) |
| Real/proxy PC-set recall | ≥70% unassisted | **Deferred** |

## Rejected for this ADR

- Hiding Chord entirely (No-go) — synthetics clear Go discrimination.
- Shipping Chord as fully automatic Go — no real-mic table yet.
- Blocking Phase 5 on field recordings — plan allows Conditional with Assisted UI.

## Follow-ups

- Add short CC0 / internal held-chord WAVs under `web/src/audio/tuner/fixtures/quartet/` (or labeled polecat-mix proxies) and re-score → may promote to Go.
- Hysteresis + pin UX dogfood in rehearsal; 10 ft Glance walk-back before graduate.
