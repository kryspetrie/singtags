# Plan: Close harmony-sketch success gaps

Follow-up to `harmony-sketch-plan.md`. The MuseScore-style **strip path** exists; this plan makes the **product claim** true: phrase harmony has one authoritative surface, clear entry, distinct detect vs declared rows, and **mixer-controlled sketch audition** (including chord-only playback).

## Problem (current state)

| Claimed goal | Reality today |
|--------------|---------------|
| One place to declare phrase chords | Strip works **and** Coach Pillars is still a full roots editor |
| Pillars = view / sync of sketch | Bidirectional wiring exists but is **asymmetric** |
| Single durable truth | Locked sketch on TagRoll + coach session pillars can **diverge** |
| Display follows sketch | Chord-analysis **overrides** can pin labels beside the sketch record |
| Obvious chord entry | **Add** is unclear; hard to tell declared vs inferred; awkward symbols (♭ ° ø) |
| Chord-only / sketch audition | Transport may skip sketch when TBB sounds; no mixer row for sketch |
| Independent chord check | Span Hear exists, but not a first-class “sound sketch chord (ignore stacks)” control |

### Confirmed bugs / asymmetries

1. **`mergePillarsIntoSketch` is additive** — deleting a pillar does not remove the matching sketch span (`useArrangingCoachDock` still calls sync after delete, but merge never drops).
2. **Coach reopen prefers existing pillars over sketch** when `existing.pillars.length > 0` (`mergeCoachSessionFromExisting`), even if the roll’s locked sketch is newer / richer.
3. **Label overrides** — `onHarmonyPick` still writes `chordAnalysisPrefs` after upserting sketch.
4. **Pillars panel** still offers Propose / Add / Draft all / root edit as a first-class editor; copy only *suggests* preferring the strip.
5. **Entry UX** — “Add” drops a default maj chord for ~1 measure at the playhead without a clear compose affordance; typed entry is easy to miss; detect and locked share one row so intent is muddy.
6. **Playback coupling** — Scheduler **skips** locked sketch where TBB notes sound, so you cannot audit “what I declared” under a finished stack, and a chart that is *only* Lead + sketch is not framed as a first-class mix.

### Explicit non-goals (this plan)

- Replacing TTBB stacks with sketch (stacks remain the Chords / Apply path).
- Mid-chart key regions / full jazz lead-sheet orthography beyond a practical autocomplete catalog.
- Full MuseScore span UX (edge drag / split / merge) — stretch after exit checklist.
- Renaming every “chord analysis” internal module (nice-to-have hygiene only).

---

## Target mental model

**Harmony sketch** on the roll = authoritative **declared** phrase-chord map (root + quality over time).

**Detect row** = optional ghosts / proposals only — never looks like the same thing as declared chords.

**Coach Pillars** = *helpers* that propose/lock roots **into that sketch**, not a second list you maintain forever.

**Chords step** = TTBB stacks. Sketch audition is **independent** of stacks (mixer + Hear).

**Playback** = parts (TTBB) **plus** an optional **Sketch** mix channel. You can play Lead + declared chords with stacks muted, or all together.

---

## Workstreams

### A — Single durable truth (sync authority)

**A1. Sketch wins on coach open**  
When linking Tag Studio → arrangement:

- Always seed / refresh pillars from **locked** `tag.harmonySketch` (authoritative).
- Preserve coach-only session fields (wizard, stacks merge, melody roles, skips) as today.
- Do **not** keep stale `existing.pillars` when they disagree with locked sketch.

Recommendation: replace “prefer existing if non-empty” with:

- `pillars = pillarsFromHarmonySketch(lockedSketch)` when sketch has any locked spans; else keep existing pillars (legacy charts with pillars only).
- Soft merge: if sketch empty but existing pillars present, one-shot write pillars → sketch (migration), then treat sketch as source.

**A2. Symmetric pillar ↔ sketch ops**

| User action | Required effect |
|-------------|-----------------|
| Lock / add / extend / change root on pillar | Upsert matching sketch span (default quality `major` if new; keep quality if span exists) |
| Delete pillar | **Remove** matching sketch span(s) by id or overlapping tick range |
| Upsert / lock / quality / remove on strip | Replace arrangement pillars from locked sketch (preserve pillar ids by tick when possible) |
| `pushToRoll` / Apply stacks | Merge stacks into notes; sketch unchanged unless pillars changed |

Simplest durable rule:

> After any coach pillar mutation: `harmonySketch = mergeQualities(oldSketch, pillarsToSketch(pillars))` where spans not in pillars are dropped (except unlocked detect is never stored).

**A3. Tests**

- Open coach: locked sketch seeds pillars; existing stale pillars do not override.
- Delete pillar → sketch span gone.
- Strip remove → pillar gone when linked.
- Quality on sketch survives pillar root/span edit.

---

### B — Demote Pillars UI (no second roots world)

**B1. Primary surface = Harmony strip (declared row)**

Pillars step chrome becomes:

- Short hint: “Phrase chords live on the Harmony strip. Use Propose / Lock here to fill gaps.”
- Transport: Propose next, Hear, Lock, Skip, ←/→ (keep).
- **Uncovered** list: Jump / Add / Extend (keep — these write into sketch via sync).
- **Remove or collapse** the big root list + large root editor as the default view.

**B2. Root editor demotion**

Choose one (recommended **B2a**):

- **B2a (preferred):** Hide the selected-pillar root dial / “Lock remaining” batch chrome behind **Advanced**. Default panel = coverage + propose CTA only.
- **B2b:** Keep root dial only when a draft (unconfirmed) pillar is selected; locked pillars are read-only here (“Edit on Harmony strip”).

**B3. Copy**

- Align Pillars panel + repair tour with strip-authoritative language.
- Next-action CTAs: prefer “Open Harmony strip” / “Propose next” over “Mark home roots” where still present.

**B4. Tests / smoke**

- Default pillars view has no primary root PC control (if B2a).

---

### C — Display follows sketch only

**C1. Stop writing overrides on sketch picks**  
`onHarmonyPick` / Lock from detect: upsert sketch only; do **not** call `setChordAnalysisOverride` for values already represented by sketch.

**C2. Strip display**  
Segments: prefer sketch labels; ignore overrides for locked sketch spans (or ignore overrides entirely once sketch exists for that tick).

**C3. Migration**  
Leave old localStorage overrides unused (or clear on next pick).

**C4. Tests**  
Pick / Lock updates `harmonySketch` and segment label without needing overrides map.

---

### F — Chord entry redesign (replace bad “Add”)

**Problem:** Current **Add** is non-obvious, unclear vs detect, and typing ♭ / ° / ø / Δ is hostile.

**F1. Entry model**

Primary entry = **focused typeahead** on the declared (sketch) row, not a mysterious Add:

- Click empty declared-lane / press shortcut → open composer at playhead (or selection range).
- Placeholder clarifies: “Type a chord (C, G7, V7)…” vs detect ghosts which are never typed into.
- **Retire or demote Add** to a secondary “Insert blank maj at playhead” under Advanced / long-press; default path is typeahead commit.

**F2. Autocomplete (code-completion style)**

As the user types ASCII-friendly tokens, suggest completions that insert proper symbols / qualities:

| Typed | Suggest / commit |
|-------|------------------|
| `b` / `bb` after root | `♭` / `𝄫` |
| `#` | `♯` |
| `dim` `o` `°` | diminished |
| `hd` `hdim` `0` `ø` | half-diminished (map to catalog quality we support, or closest sketch quality + label) |
| `maj7` `Δ` | maj7 |
| `m7` `7` `m` | existing qualities |
| RN mode | `V7` `ii` `♭VII` etc. via existing `parseHarmonyEntry` |

UI: combobox under the entry field — arrow keys + Enter / click. Completions show **display label** (with symbols) and write **rootPc + quality** into sketch (same record as today).

Catalog source: extend `HARMONY_SKETCH_QUALITIES` / parse tables only as far as autocomplete needs; half-diminished may need a quality id or map to `m7`+label carefully — prefer adding `half-dim` to the closed set if MusicXML/Hear can support it.

**F3. Range meaning**

On commit without an open span:

- Prefer **inspect / L–R range** if set; else melody note under playhead; else one measure (document in tip).
- Overwrite locked sketch in that window (same as upsert), never “secretly” edit detect.

**F4. Tests**

- Completions for `Bb7`, `bVII`, `dim`, `ø` (or agreed alias) parse to expected `rootPc`/`quality`.
- Commit creates locked sketch; detect row unchanged except holes.

---

### G — Two visual rows (declared ≠ detected)

**G1. Layout**

Replace the single mixed strip with **two lanes** under the ruler:

1. **Declared (sketch)** — solid, higher contrast; empty state CTA (“Type a chord…”); only locked/user/coach spans.
2. **Detected** — lighter / dashed / shorter; label as “Detected”; Lock promotes into declared row.

Do **not** paint detect and declared in the same cell row with only opacity differences.

**G2. Interaction**

- Clicks on declared → edit / Hear / Remove / quality.
- Clicks on detect → Lock / Hear proposal / dismiss (optional); never looks like an owned chord until locked.
- Chord/Number toggle applies to **both** rows’ labels.
- Collapse: one **Harmony** chip restores **both** rows (or collapses to chip as today).

**G3. Data**

- Declared = `authoritativeSketch(project.harmonySketch)`.
- Detect = `mergeDetectIntoSketchHoles` extras only (or build detect list separately without merging into one array for UI). Prefer **separate computed lists** in `useChordAnalysisBar` / `harmonyStrip` for clarity.

**G4. Tests**

- Strip builder returns two collections; UI smoke that declared locked span does not appear on detect row.

---

### H — Sketch playback, mixer, independent Hear

**H1. Chord-only / Lead+sketch arrangements**

A project with Lead notes + locked sketch (no TBB) must play as a listenable sketch arrangement: melody + block chords for each declared span.

**H2. Mixer channel “Sketch” (or “Harmony”)**

- When `harmonySketch` has any locked span (or always once strip exists), mixer shows a **Sketch** row: mute / solo / volume (/ pan optional).
- **Default: unmuted**, sensible volume (~0.55–0.7 relative to Lead).
- Persist with project mix — either:
  - **H2a (preferred):** virtual mix id `sketch` not tied to a `parts[]` row (`TagRollProject.mix` allows orphan sketch row, or `view.sketchMix` / `sketchMix: TagRollPartMix`-like), or
  - **H2b:** synthetic part `Sketch` hidden from note entry but present in mix (more invasive).

Scheduler respects sketch mute/solo like parts (`isPartAudible` analogue for sketch).

**H3. Stop skipping sketch under TBB**

Remove “skip block chords when TBB sounds.” Stacks and sketch are **independent layers**:

- Sketch mute off → hear declared voicing even if TTBB exists.
- TTBB mute / Sketch solo → chord-only check under Lead.
- Both on → denser mix (acceptable; volume defaults keep sketch under Lead).

**H4. Independent Hear (ignore stacks)**

- One **Hear sketch chord** action: play `blockChordMidis` for the span at playhead (or selected declared cell) **without** sounding TTBB notes.
- Bind to strip button (already) + **keyboard shortcut** (e.g. extend catalog: `hear-sketch` — propose `J` or `Shift+H` to avoid clashing with `H` = hear stack). Document in shortcuts overlay.
- Must work while transport is stopped; while playing, optional no-op or flash tip.

**H5. Tests**

- Scheduler fires sketch voices when sketch unmuted and TBB present.
- Sketch muted → no sketch voices.
- Hear-sketch helper returns midis / does not require stack midi.

---

### D — Strip UX leftovers

| Item | Priority |
|------|----------|
| Collapsed **Harmony** chip always restorable | Done |
| Detect → Lock writes sketch with correct `rootPc` | Done; keep under dual-row |
| Entry range tip | Part of F3 |
| Remove declared span ↔ coach pillar | Part of A |

**Stretch (not on exit checklist):** edge drag, split at playhead, merge adjacent same chords.

---

### E — Hygiene (optional, after A–C / F–H)

- Extract `useHarmonySketchActions` if EditorView grows.
- Optional rename `useChordAnalysisBar` → `useHarmonyStrip` when touching that file for G.

---

## Implementation order

1. **A2 + A3** — symmetric sync + tests.  
2. **A1** — sketch wins on open (+ migration).  
3. **C1–C4** — kill override dual-truth.  
4. **G** — dual rows (declared vs detect).  
5. **F** — typeahead entry + autocomplete; demote Add.  
6. **H** — mixer Sketch channel; stop TBB skip; Hear shortcut.  
7. **B** — demote Pillars UI/copy (can parallelize after A).  
8. **E** as needed for budgets.

---

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Users with pillars-only coach sessions lose list on open | A1 migration: empty sketch ← existing pillars once |
| Replacing sketch from pillars drops qualities | Match by tick overlap / id; copy `quality` from previous sketch |
| Demoting Pillars confuses Approach Two teachers | Keep Propose/Lock/Uncovered; only remove duplicate *editing* of locked roots |
| Dual row eats vertical space | Compact detect row (~1.1rem); collapse remembers state |
| Autocomplete scope creep | Closed suggestion list tied to `HARMONY_SKETCH_QUALITIES` + RN helpers |
| Sketch + TTBB both sounding is muddy | Default sketch volume under Lead; solo Sketch for audit |
| Half-diminished / exotic symbols | Map aliases in autocomplete; add quality to closed set only if Hear/MusicXML ready |
| Mixer virtual channel vs fake part | Prefer H2a virtual `sketch` mix id to avoid note-entry pollution |

---

## Final checklist (definition of done)

Use this as the exit gate. Every item must be **Pass** before claiming harmony-sketch success criteria.

### Truth & sync

- [ ] **T1** Locked `harmonySketch` is the durable phrase-chord source on `TagRollProject` (normalize + history + persist).
- [ ] **T2** Detect never overwrites locked sketch; only fills holes (detect row only).
- [ ] **T3** Coach open: pillars derived from locked sketch when sketch has locked spans (stale session pillars do not win).
- [ ] **T4** Empty sketch + existing pillars → one-shot migrate pillars → sketch, then sketch wins thereafter.
- [ ] **T5** Delete pillar → matching locked sketch span removed.
- [ ] **T6** Remove / edit span on strip → linked arrangement pillars updated (ids stable when possible).
- [ ] **T7** Pillar root/span edit preserves existing sketch **quality** when the span matches.
- [ ] **T8** Unit tests cover T3–T7.

### Product surface (Coach / key)

- [ ] **P1** Arranger can lay C / G7 (or I / V7) on the **declared** Harmony row without opening Coach.
- [ ] **P3** Toolbar key change re-spells RN; absolute roots unchanged.
- [ ] **P4** Pillars panel is not a second primary roots editor: no default root dial for locked phrases (Advanced or draft-only).
- [ ] **P5** Pillars copy tells users the strip is authoritative; Propose/Lock/Uncovered remain helpers.
- [ ] **P6** Collapsed strip always shows a visible control to restore (**Harmony**).

### Entry & visual distinction

- [ ] **E1** Primary chord entry is typeahead/composer on the declared row (Add is not the only/primary path).
- [ ] **E2** Autocomplete offers flats / dim / half-dim (and common qualities); commit writes `rootPc` + quality.
- [ ] **E3** Declared and detected chords are on **separate visual rows** with distinct styling and labeling.
- [ ] **E4** User can tell at a glance what is owned vs inferred; Lock moves detect → declared.

### Playback & mixer

- [ ] **M1** Lead + locked sketch (no TBB) plays as a chord-defined arrangement (melody + block chords).
- [ ] **M2** Mixer shows a **Sketch** channel when sketch is present; **default unmuted**.
- [ ] **M3** Sketch mute/solo/volume gate transport block-chord audition (independent of TTBB mute).
- [ ] **M4** Transport does **not** suppress sketch merely because TBB notes exist.
- [ ] **M5** One-click / keypress Heari>s the **declared** chord at playhead (or selection) **without** sounding the TTBB stack.
- [ ] **M6** Tests cover M3–M5 (scheduler and/or Hear helper).

### Display (labels)

- [ ] **D1** Lock / pick / typed entry write sketch; they do **not** depend on chord-analysis overrides for locked spans.
- [ ] **D2** Strip labels for locked spans come from sketch (name/RN helpers), not prefs overrides.

### Export & regression

- [ ] **X1** MusicXML still emits locked sketch as `<harmony>` on Lead.
- [ ] **X2** `vue-tsc` clean; targeted vitest (harmonySketch, syncTagRoll, musicxml, scheduler/mixer, godFiles, coach copy) green.

### Success claim (must all pass)

- [ ] **S1** Without Coach: Lead → type/autocomplete declared chords → Hear sketch / play with Sketch in mixer → change key/RN → Chords for TTBB.
- [ ] **S2** With Coach: Propose/Lock updates the **same** declared sketch the strip shows; delete on either side does not leave orphans.
- [ ] **S3** A new user is not taught two competing places to “own” phrase chords.
- [ ] **S4** Declared vs detected are visually obvious; entry is discoverable without tribal knowledge of Add.
- [ ] **S5** User can audition **only** declared chords (Sketch solo / parts muted) and can Hear a declared chord ignoring stacks.

---

## Baseline evaluation (pre-implementation)

Scored against this checklist **as of the plan update** (post initial harmony-sketch phases; before A–H follow-up).

| ID | Result | Notes |
|----|--------|-------|
| T1 | **Pass** | Model + normalize + history + store CRUD |
| T2 | **Pass** | `mergeDetectIntoSketchHoles` (single-row UI still muddies perception) |
| T3 | **Fail** | `mergeCoachSessionFromExisting` prefers existing pillars |
| T4 | **Fail** | No pillars→sketch migration on open |
| T5 | **Fail** | Delete syncs via additive merge — span remains |
| T6 | **Pass*** | Strip→pillars when linked; *ids best-effort |
| T7 | **Pass*** | Keeps quality on hit; *edge cases thin |
| T8 | **Fail** | Missing T3–T5 tests |
| P1 | **Partial** | Possible via Add/entry, but entry UX fails E1/S4 |
| P3 | **Pass** | Toolbar key + `sketchRoman` |
| P4 | **Fail** | Full root editor still default |
| P5 | **Partial** | Copy improved; panel still competes |
| P6 | **Pass** | Collapsed Harmony chip fix |
| E1 | **Fail** | Add is primary/confusing |
| E2 | **Fail** | No autocomplete / symbol assist |
| E3 | **Fail** | Single mixed row |
| E4 | **Fail** | Locked vs implied only subtle CSS |
| M1 | **Partial** | Scheduler can play sketch if no TBB; not productized |
| M2 | **Fail** | No Sketch mixer row |
| M3 | **Fail** | No sketch mix gating |
| M4 | **Fail** | Explicitly **skips** sketch when TBB sounds |
| M5 | **Partial** | Span Hear exists; no dedicated shortcut / “ignore stack” framing |
| M6 | **Fail** | No tests for mixer-independent sketch |
| D1 | **Fail** | Overrides still written on pick |
| D2 | **Fail** | Overrides can win display |
| X1 | **Pass** | MusicXML harmony test |
| X2 | **Pass** | Re-verify after changes |
| S1 | **Partial** | Path exists but entry/mixer/Hear gaps |
| S2 | **Fail** | Orphans / reopen divergence |
| S3 | **Fail** | Two editors taught |
| S4 | **Fail** | Entry + single-row confusion |
| S5 | **Fail** | Cannot reliably solo/ignore stacks for sketch |

**Baseline summary:** ~9 Pass · ~5 Partial · ~17 Fail. Exit requires **all** items Pass (no Partial).

---

## Exit evaluation (post A–H implementation)

Scored after implementing workstreams A–H (sync, dual rows, typeahead, mixer, Pillars demotion).

| ID | Result | Evidence |
|----|--------|----------|
| T1 | **Pass** | `types.ts` / `normalize.ts` / `tagRoll` store |
| T2 | **Pass** | `mergeDetectIntoSketchHoles`; detect row only |
| T3 | **Pass** | `mergeCoachSessionFromExisting` + `mergeCoachSession.test.ts` |
| T4 | **Pass** | `migratePillarsToSketchIfEmpty` in `ensureLinked` |
| T5 | **Pass** | `replaceSketchFromPillars` drops orphans; harmonySketch.test |
| T6 | **Pass** | `syncSketchToCoachPillars` in editor |
| T7 | **Pass** | `replaceSketchFromPillars` keeps quality |
| T8 | **Pass** | mergeCoachSession + harmonySketch + syncTagRoll tests |
| P1 | **Pass** | Declared-row typeahead / commit |
| P3 | **Pass** | Unchanged toolbar key |
| P4 | **Pass** | Root dial moved under Advanced (draft only) |
| P5 | **Pass** | Pillars panel hint + locked → strip |
| P6 | **Pass** | Collapsed Harmony chip |
| E1 | **Pass** | Typeahead primary; Blank demoted |
| E2 | **Pass** | `suggestHarmonyEntries` + UI list |
| E3 | **Pass** | Declared / Detected lanes in `TagRollChordAnalysisBar` |
| E4 | **Pass** | Lane labels + Lock on detect |
| M1 | **Pass** | Scheduler sketches locked spans via mix gain |
| M2 | **Pass** | Mixer **Sketch** row (`TAG_ROLL_SKETCH_MIX_ID`) |
| M3 | **Pass** | `sketchMixGain` in scheduler |
| M4 | **Pass** | TBB skip removed |
| M5 | **Pass** | Hear + shortcut **J** (`onHearSketchAtPlayhead`) |
| M6 | **Pass** | mix.test + harmony / scheduler suites |
| D1 | **Pass** | Overrides no longer written on pick |
| D2 | **Pass** | Segments from sketch rows only |
| X1 | **Pass** | MusicXML + half-dim kind |
| X2 | **Pass** | `vue-tsc` + targeted vitest green |
| S1 | **Pass** | Declared entry → Hear/mixer → key/RN → Chords |
| S2 | **Pass** | Symmetric replace sync |
| S3 | **Pass** | Strip primary; Pillars helpers |
| S4 | **Pass** | Dual rows + typeahead |
| S5 | **Pass** | Sketch solo / J ignores stacks |

**Exit summary:** All checklist items **Pass**. Original harmony-sketch success criteria + follow-up entry/mixer/dual-row goals are met.

---

## After implementation

Re-run this section as **Exit evaluation**, mark every ID Pass/Fail with evidence (file or test name), and only then treat `harmony-sketch-plan.md` + this follow-up’s success claim as met.
