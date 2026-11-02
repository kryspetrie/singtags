# Tag Studio: Chrome unification & reuse

**Status:** Phase 1 complete · Phase 2 **investigated** (2a Esc contracts are the next code step; shell is gated)  
**Checkpoint commit:** `c7c5b4f` (tuplet containers + aligned editor chrome)  
**Goal:** One look-and-feel vocabulary for Tag Studio overlays, buttons, and segments — without regressions to editing, Esc dismiss, or transport.

## Principles (non-negotiable)

1. **Additive first.** Prefer extending shared CSS/components before deleting scoped styles.
2. **One surface per PR/phase.** Finish tests green before the next phase.
3. **High-risk = plan then pause.** Esc stacks, z-index, flyout geometry, and Chords/Coach interactions need investigation notes before edits.
4. **No behavior change by accident.** Visual class swaps must keep the same aria attributes, click handlers, and keyboard paths.
5. **Regression gate.** Every phase ends with: targeted vitest + `vue-tsc` + listed manual smoke.

## Existing shared primitives (use these)

| Primitive | Location | Intended use |
|-----------|----------|--------------|
| `.btn` / `.btn-primary` / `.btn-ghost` / `.btn-danger` | `web/src/styles/utilities.css` | All action buttons |
| `.ctrl-segment` / `.ctrl-tabs` / `.ctrl-toggle` | `web/src/styles/controls.css` | Mode rails / one-of-many |
| `ConfirmDialog` | `web/src/components/ConfirmDialog.vue` | Confirm / cancel modals |
| `tagRollTip` / `tipByShortcutId` | `web/src/lib/tagRoll/shortcuts.ts` | Titles with shortcuts |
| `overlayShell` (`setScrollLock`, `setShellInert`) | `web/src/lib/overlayShell.ts` | Fullscreen overlay body lock |
| Teach panel head | `arranging-teach-chrome.css` | Pattern for dock heads |

## Risk legend

| Risk | Meaning | Rule |
|------|---------|------|
| **Low** | Class rename / CSS delete when markup already matches globals | Proceed with tests |
| **Medium** | Shared component extraction; visual density change | One consumer first, then expand |
| **High** | Esc priority, z-index, focus traps, pointer tools, Chords/Coach | Written investigation + dry-run checklist before code |

---

## Phase 0 — Safety net & inventory

**Outcome:** Documented inventory + regression tests that lock the *contracts* we must not break. No production look change yet (except optional additive CSS).

### Deliverables

- [x] This plan file (checked into repo)
- [x] Inventory table of Tag Studio surfaces → shell dialect → button dialect → Esc owner
- [x] Architecture / contract tests for global button + segment class presence
- [x] Manual smoke checklist (below)

### Checklist

- [x] List every Tag Studio overlay/panel (Confirm, Seed, Tuplet, Shortcuts, Print, Parts, Filters, Mixer, Format, Key, Tweaks, Chords, Coach docks, Lane menus)
- [x] Note which already use globals (Seed, Tweaks markup)
- [x] Note high-risk owners of Esc (`TagRollEditorView` central handler vs per-overlay)

### Tests required

| Test | Asserts |
|------|---------|
| `tagStudioChromeContract.test.ts` | `utilities.css` exports `.btn`, `.btn-primary`, `.btn-ghost`, `.btn-danger`; `controls.css` exports `.ctrl-segment`, `.ctrl-tabs` ✅ |
| Existing tagRoll suite still green | No accidental breaks from additive CSS ✅ |

### Manual smoke (every later phase)

1. Open Tag Studio project → Compose  
2. Undo / Redo / Del note  
3. Esc clears selection, then closes docks in order  
4. Parts / Mixer / Filters open + close  
5. Tuplet tool `T` → drag span → editor Apply / Cancel / Esc  
6. Sheet Format dock open/close  
7. Shortcuts `?` open/close  
8. Play / Space / Enter transport  

### Exit criteria

Inventory + contract tests green; smoke list checked once on current main (`c7c5b4f` baseline).

---

## Phase 1 — Button vocabulary (low risk)

**Outcome:** Tag Studio action buttons use `utilities.css`. Compact toolbar density via additive `.btn-sm` — no Esc/z-index changes.

**Risk:** Low–Medium (ConfirmDialog is widely used — migrate carefully).

### Investigation before ConfirmDialog change

- Confirm markup already uses `btn` / `btn-primary` / `btn-danger`.
- Scoped styles currently duplicate globals at 44px touch height.
- **Safe path:** Delete Confirm scoped `.btn*` only after verifying global rules apply in a mounted Confirm smoke/test.
- **Do not** change Confirm’s Teleport / backdrop / Esc in this phase.

### Deliverables

- [x] Additive `.btn-sm` (and optional `.btn-sm.btn-primary`) in `utilities.css` for ~34px chrome
- [x] Migrate **one** thin consumer first: `TagRollApplyScopeDialog` (remove local `.btn` copy)
- [x] Migrate `ConfirmDialog` scoped button CSS → globals (behavior unchanged)
- [x] Migrate `TagRollTupletEditor` footer buttons → globals
- [ ] Leave Toolbar `.btn.on` / `.btn.ghost` for Phase 1b or Phase 3 (custom “latched” chrome)

### Checklist

- [x] No markup class renamed without a CSS rule that still matches
- [x] `--on-accent` used for primary label color
- [x] Touch targets on modal actions remain ≥ 44px (`min-height: var(--touch)`)
- [x] Compact `.btn-sm` only where previous height was ~32–34px (additive; Toolbar not migrated yet)

### Tests required

| Test | Asserts |
|------|---------|
| Contract test | `.btn-sm` present after additive change ✅ |
| Mount ConfirmDialog (or existing consumer test) | Primary + cancel render; classes present ✅ |
| `vue-tsc` | Clean |
| Manual smoke | Confirm delete dialogs still work; Tuplet Apply/Cancel look correct |

### Exit criteria

ApplyScope + Confirm + Tuplet on globals; Toolbar deferred if `.btn.on` needs a shared latch class.

---

## Phase 2 — Modal shell extraction (medium → high risk)

**Outcome:** Confirm / Seed / Tuplet share one shell for Teleport, backdrop, panel, safe-area, z-index 110 — **without changing Esc ownership until Phase 2a gates pass.**

**Risk:** High for Esc; Medium for pure geometry.

### Esc / focus map (deep dive 2026-10-28)

#### Listener topology

| Actor | Registration | Phase | Esc action |
|-------|--------------|-------|------------|
| `TagRollEditorView` | `window.addEventListener('keydown', onKeyDown)` | **bubble** | Ordered dismiss stack (below) |
| `TagRollTupletEditor` | `window.addEventListener('keydown', onKey, true)` | **capture** + `stopPropagation` | Close editor; clear `pendingPreset` first |
| `TagRollTupletEditor` | `@keydown.escape.prevent` on root | bubble (only if event reaches dialog) | `onCancel` (duplicate path) |
| `ConfirmDialog` | `@keydown.escape.prevent` on root | bubble **inside dialog only** | `emit('close')` — **no** `stop` |
| `TagRollSeedLibraryDialog` | `@keydown.escape.prevent` on root | bubble inside dialog | `emit('close')` |
| `TagRollShortcutsOverlay` | `window` capture + `stopPropagation` | capture | Close; also sets `body.style.overflow` |

Editor Esc order today (`onKeyDown`, after `isTypingTarget` early-return):

1. Assign-roles → clear note selection only  
2. **`tupletEditorOpen` → false**  
3. `shortcutsOpen` → false  
4. Title editing cancel  
5. `clearRollSelection()` (includes **`selectedTupletId`**)  
6. Harmonize / Coach / Parts / Marks / Mixer  
7. `expressionTool` / **`tupletTool`** / lyrics lane  

#### Proven interaction (happy-dom event model)

- Capture listener on `window` that calls `stopPropagation()` **prevents** the editor’s bubble `window` listener from running.  
- Therefore Tuplet’s capture path currently **isolates** Esc from the editor stack (selection is preserved when closing via that path).  
- Confirm-like path (`prevent` only, no `stop`) on an inner control: **both** dialog close **and** editor bubble fire (`confirm-root` then `editor-window-bubble`). Confirmed with a happy-dom probe.

#### High-risk findings

1. **Do not drop Tuplet’s capture listener** as part of a “shell only uses `@keydown.escape`” refactor.  
   Without capture+`stopPropagation`, Esc while focus is on Close/backdrop/non-input chrome closes the modal **and** falls through the editor stack → `clearRollSelection()` clears the selected tuplet band on the **same** keypress.

2. **Confirm dialogs inside the editor are Esc-leaky today.**  
   `@keydown.escape.prevent` does not stop propagation to `window`. Esc on a focused Confirm action can close the confirm **and** run editor dismiss (selection/docks). Confirm also has `tabindex="-1"` but **no autofocus**, so Esc often hits the editor instead of the dialog unless focus was moved into it.

3. **Seed library is on `TagRollListView`, not the editor** — no editor Esc stack. Lowest-risk shell consumer.

4. **Duplicate Esc paths on Tuplet** (capture window + template `@keydown.escape`) are redundant while capture stops propagation; template path mainly matters if capture is removed.

5. **`isTypingTarget` masks one failure mode:** Esc from a focused MIDI `<input>` skips the editor handler, so only Tuplet closes — looks fine. The dangerous case is Esc from non-typing chrome inside the modal.

6. **Scroll lock:** Shortcuts mutates `document.body.style.overflow` manually; Confirm/Seed/Tuplet do **not** lock scroll. Shell should **not** adopt Shortcuts’ lock in Phase 2 (different product surface). Optional later via `setScrollLock` with a prop defaulting off.

7. **Focus:** Tuplet autofocuses first MIDI field; Shortcuts focuses close; Confirm/Seed do not autofocus. Shell must not steal focus unless the consumer opts in (`initialFocus: 'first-tabbable' | 'close' | 'none'`).

#### CSS / structure overlap (safe to unify)

Shared across Confirm / Seed / Tuplet:

- `Teleport` → fixed root `z-index: 110`  
- Absolute backdrop `rgba(0,0,0,0.45)`  
- Panel: `var(--radius)`, border, `box-shadow: 0 12px 40px…`, safe-area / `--bottom-nav-h` padding  
- Display title using `var(--font-display)` (Confirm/Seed/Tuplet)

Differences to preserve as shell props/slots:

| Concern | Confirm | Seed | Tuplet |
|---------|---------|------|--------|
| Width | 22rem / wide 28rem | 28rem | 28rem |
| Close ✕ | no | no | yes |
| Header lead | message `<p>` | lead | lead |
| Body | default slot | scroll + checkboxes | presets + slots |
| Footer | actions slot | actions | Hear + Cancel + Apply |
| Esc | root prevent | root prevent | **window capture** |

### Revised decision (go / no-go)

| Step | Action | Risk | Go? |
|------|--------|------|-----|
| **2a** | Fix Esc contracts **before** shell: (1) editor early-return while any blocking modal open (`tupletEditorOpen`, `pendingInspectDeleteMessage`, `pendingClearSketchAfterRealize`) at top of Esc; (2) Confirm Esc uses `.stop` (or capture) so editor does not continue; (3) regression tests | Med | **GO first** |
| **2b** | Extract `ModalDialogShell` = Teleport + backdrop + panel geometry + optional close ✕. **No default Esc owner.** Consumers pass Esc strategy. | Med | **GO after 2a** |
| **2c** | Migrate **Seed** onto shell (list view; no editor stack) | Low | **GO** |
| **2d** | Migrate **Confirm** onto shell; keep Esc stop behavior from 2a | Med | **GO** |
| **2e** | Migrate **Tuplet** onto shell **keeping** capture+`stopPropagation` (or editor modal gate from 2a makes capture optional but keep until tests prove editor gate alone is enough) | High | **GO only with tests** |
| **2f** | Drop Tuplet capture in favor of shell `@keydown.escape` only | High | **NO-GO** until 2a tests prove editor never double-dismisses |

**Stop gate (must pass before 2b+):**

- [ ] Unit/integration: Esc with tuplet editor open + focus on Close → modal closes, **`selectedTupletId` still set**  
- [ ] Esc with focus in MIDI input → modal closes, selection kept  
- [ ] Esc with Confirm open (inspect delete) → only Confirm closes; selection/docks unchanged  
- [ ] Esc with Seed open on list view → only Seed closes  
- [ ] happy-dom or component test documenting capture vs bubble contract  

### Deliverables

- [ ] Phase 2a Esc contract fixes + tests (prerequisite)  
- [ ] `ModalDialogShell.vue` (geometry; Esc opt-in)  
- [ ] Seed → shell  
- [ ] Confirm → shell  
- [ ] Tuplet → shell **with capture Esc retained** until 2f reopened  
- [ ] Optional close ✕ uses `tagRollTip('Close', 'Esc')`  
- [ ] Scroll-lock **not** required for Phase 2 (prop default off)

### Checklist

- [ ] z-index stays 110 for confirm-class modals  
- [ ] Exactly one effective Esc owner per open modal  
- [ ] Click backdrop closes  
- [ ] No nested Teleports  
- [ ] No change to Shortcuts / Print in this phase  

### Tests required

| Test | Asserts |
|------|---------|
| Esc contract (Tuplet) | Close via Esc keeps `selectedTupletId` |
| Esc contract (Confirm in editor) | Confirm close does not clear note selection / close Parts |
| Shell unit | Renders slots; backdrop emits close; z-index 110 |
| Seed smoke | Open/close/load unchanged on list view |
| Manual smoke list | Full Tag Studio editor path |

### Exit criteria

Seed + Confirm + Tuplet on one shell; Esc contract tests green; Tuplet capture still present **or** explicitly replaced only after 2a proves editor modal gate is sufficient.

---

## Phase 3 — Segment rails (medium risk)

**Outcome:** Toolbar mode/pointer rails, Tuplet presets, Format segments use `.ctrl-segment` (compact variant as needed).

**Risk:** Medium — Toolbar pointer tool mutual exclusivity + visual density.

### Investigation required

1. Diff Toolbar `.modes.segment` / `.seg-btn.on` vs `.ctrl-segment > button[aria-pressed='true']`  
2. Ensure `aria-pressed` (not only `.on`) drives selected state if migrating  
3. Bottom-lane micro chips may need `.ctrl-segment--micro` — **do not** force 40px height on lane chips without design check  

### Deliverables

- [ ] Additive `.ctrl-segment--toolbar` or use `--compact` if heights match  
- [ ] Migrate Tuplet preset rail  
- [ ] Migrate Toolbar Edit/Hand/Tuplet + Undo group carefully  
- [ ] Format panel segments only after Toolbar green  

### Checklist

- [ ] Pointer tool exclusivity preserved  
- [ ] Tuplet tool `T` still toggles  
- [ ] No regression to mode View/Compose/Lyrics segments  

### Tests required

| Test | Asserts |
|------|---------|
| Store ports / shortcut tests | Unchanged behavior |
| Manual | Toggle Edit ↔ Hand ↔ Tuplet; mode keys V/E/Y |

### Exit criteria

At least Tuplet + one Toolbar rail on `.ctrl-segment`; Format optional same phase if green.

---

## Phase 4 — Panel head chrome (medium risk)

**Outcome:** Shared head (title, hint, close) for Format / Key / Tweaks / Parts / Filters / Mixer.

**Risk:** Medium — flyout vs dock geometry must stay distinct.

### Investigation required

1. Parts bottom inset vs Filters without inset  
2. Mixer z220 drag vs dock CSS in `TagRollEditorView`  
3. Whether teach-chrome classes can be reused without pulling Coach CSS into roll  

### Deliverables

- [ ] `TagRollPanelHead.vue` or shared CSS class set  
- [ ] Migrate Format + Key + Tweaks first (same dock family)  
- [ ] Then Parts / Filters  
- [ ] Mixer last (drag handle)  

### Checklist

- [ ] Close always `tagRollTip('Close', 'Esc')` when Esc closes that surface  
- [ ] No z-index changes in this phase  

### Tests / smoke

Open/close each panel; Esc order from editor unchanged.

---

## Phase 5 — Esc + scroll-lock composable (high risk)

**Outcome:** `useOverlayDismiss` wrapping `setScrollLock`; reduce per-overlay listeners.

**Risk:** High — editor Esc priority stack.

### Investigation required (mandatory write-up before code)

1. Ordered Esc branches in `TagRollEditorView`  
2. Which overlays register capturing listeners  
3. Interaction with Assign Roles, Chords, Coach, tuplet editor, shortcuts  

### Deliverables

- [ ] Investigation note in this doc (subsection)  
- [ ] Composable used by Shortcuts + Print first  
- [ ] Only then Seed/Tuplet if not already covered by shell  

### Exit criteria

Documented Esc order test or checklist; no “Esc closes two things.”

---

## Phase 6 — Overlay dialects & z-index tokens (high risk)

**Outcome:** Named z-index scale + optional `TagRollFlyoutPanel` / `FullscreenOverlayShell`.

**Risk:** High — Mixer above Shortcuts, Print under Mixer today.

### Investigation required

Current observed stacking (approximate): Toolbar menus ~30 → Print 80 → Lane menus ~96 → Confirm 110 → Shortcuts 200 → Mixer 220.

Deliverables only after a stacking matrix is written and agreed.

---

## Phase 7 — HUD chips & popovers (low–medium)

**Outcome:** Shared `.tr-hud` / `.tr-chip`; optional `AnchoredPopover` for lane menus.

Defer until Phases 1–3 are stable.

---

## Implementation order (executing now)

1. ~~Phase 0 inventory + contract tests~~  
2. ~~Phase 1 button globals (ApplyScope → Confirm → Tuplet)~~  
3. ~~Phase 2 deep Esc investigation~~ → **2a Esc contracts next** (not shell yet)  
4. Phase 2b–2e shell after 2a tests green; **2f (drop Tuplet capture) remains NO-GO**  
5. Phase 3 segments (Tuplet presets first — lowest Toolbar coupling)  

## Rollback

- Git checkpoint: `c7c5b4f`  
- Prefer revert of a single phase commit over mixed undos  

---

## Inventory (Phase 0 — fill as we go)

| Surface | Shell | Buttons today | Esc owner | Risk to unify |
|---------|-------|---------------|-----------|---------------|
| ConfirmDialog | Teleport modal z110 | Scoped ≈ global | Component + callers | Low (CSS only) |
| TagRollApplyScopeDialog | Confirm slot | Scoped duplicate | Confirm | Low |
| TagRollSeedLibraryDialog | Teleport modal z110 | Global (no local) | Template escape | Med (shell) |
| TagRollTupletEditor | Teleport modal z110 | Local ≈ Confirm | Window capture + editor | Med |
| TagRollShortcutsOverlay | Fullscreen z200 | N/A (kbd) | Capture listener | High (Esc/scroll) |
| TagRollSheetPrintPreview | Fullscreen z80 | Local `.btn` | Listener | High |
| TagRollPartsPanel | Flyout z45 | Local | Editor | Med |
| TagRollViewFiltersPanel | Flyout z45 | Local | Editor | Med |
| TagRollMixerPanel | Free z220 | Local | Editor | High |
| TagRollSheetFormatPanel | Dock | Local + segments | Editor | Med |
| TagRollKeyChangePanel | Dock | Local | Editor | Med |
| TagRollDetectedTweaksPanel | Dock | Global markup | Editor | Low–Med |
| TagRollToolbar | Chrome | Local `.btn` / `.seg-btn` | N/A | Med |
| TagRollChordsPanel | Dock/panel | Local tabs/btns | Editor + panel | High |
| Coach docks | Teach chrome | Shared teach CSS | Editor | Low (already better) |
