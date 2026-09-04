# Tag Roulette — Labs implementation plan

> **Status:** Phase 0–3 complete; Phase 4 polish optional  
> **Product spec:** [tag-roulette.md](tag-roulette.md)  
> **Placement:** SingTags **Labs** feature (opt-in, default **off**), like Local Library.  
> **Visual:** Pick UI (reel / any decorative wheel) uses **design tokens** (`--accent`, `--surface`, `--border`, `--muted`, `--bg`, `--text`, `--danger`) — no one-off rainbow palette.

---

## Continuous retrospective (living log)

Update this section at the **end of every phase** (and mid-phase if a decision flips).

### Retro — kickoff (2026-09-04)

| Went well | Learn / adjust |
| --- | --- |
| Spec already locked: modes, spill, reset clears sung, reel > pie for titles, auto-open pref | Ship behind Labs so incomplete phases don’t hit all users |
| Token-first chrome matches Pitch Pipe / Labs cards | “Color wheel” = token-derived segment colors if we add a pie accent ring; primary picker remains the **reel** |

### Retro — Phase 0–1 landed (2026-09-04)

| Went well | Learn / adjust |
| --- | --- |
| Labs flag + gated `/labs/roulette` mirrors Local Library pattern | Keep main nav free until graduation |
| Uniform deal + sung + reset + session persist are small and testable | Phase 2 modes should reuse `dealBatch` signature / spill status line already stubbed |
| Theme tokens on batch chrome (`--accent` picked border, muted sung) | Phase 3 reel must stay token-only — no Hack Club rainbow |

### Retro — Phase 2 landed (2026-09-04)

| Went well | Learn / adjust |
| --- | --- |
| Modes + slices + curve glyphs + spill status are on the main Roulette page | Keep editor open by default so distribution isn’t “hidden” again |
| Seed “Rehearsal mix” matches the product example | Phase 3 reel should read eligible batch only (not redraw) |

**Next:** Phase 3 reel pick.

---

## Phase 0 — Labs plumbing

**Goal:** Feature exists as an opt-in Labs experiment with a gated route.

| # | Task | Done |
| --- | --- | --- |
| 0.1 | Pref `tagRouletteEnabled` (`singtags.labs.tagRoulette.enabled.v1`), default **false** | ✅ |
| 0.2 | Store getters/setters + preferences test | ✅ |
| 0.3 | Labs card: description, switch, “Open Tag Roulette” when on | ✅ |
| 0.4 | Route `/labs/roulette` + `meta.requiresTagRoulette` → redirect Labs if off | ✅ |
| 0.5 | When enabled: **More → Tag Roulette** (Labs is flag-only; no open button) | ✅ |
| 0.6 | Point [tag-roulette.md](tag-roulette.md) + status at Labs placement | ✅ |

**Exit:** Toggle on → can open `/labs/roulette`; toggle off → redirect to `/labs`. ✅

---

## Phase 1 — Deal batch + sung + reset

**Goal:** Useful without modes/reel: deal N from full catalog (uniform), list, open→sung, reset clears greys + picks.

| # | Task | Done |
| --- | --- | --- |
| 1.1 | `lib/rouletteDraw.ts`: `drawUniformUnique`, inject `rng` | ✅ |
| 1.2 | Unit tests: uniqueness, n > pool, empty pool | ✅ |
| 1.3 | `stores/roulette.ts`: session (`items`, `sungIds`, `wheelUsedIds`, `dealtAt`); prefs stub (`batchSize`, `openAutomatically`) | ✅ |
| 1.4 | Persist `singtags.rouletteSession.v1` + minimal `singtags.roulette.v1` | ✅ |
| 1.5 | `RouletteView.vue`: ensure `catalog.load()`, Deal / Reset / batch list | ✅ |
| 1.6 | Open → mark sung (grey, still clickable); Sing mode / openAutomatically query stub | ✅ |
| 1.7 | Batch size control 1/3/5/10 (default 10) | ✅ |
| 1.8 | Empty / loading / short-catalog copy | ✅ |
| 1.9 | Store + Labs tests for deal + sung + reset + flag | ✅ |

**Exit:** Deal returns distinct tags; remount keeps batch; Reset clears sung; Labs-gated. ✅

---

## Phase 2 — Modes + mixture + curves

**Goal:** Editable modes with slices, pools, curves + graphics, spill fill.

| # | Task | Done |
| --- | --- | --- |
| 2.1 | Mode / slice types; seed “Full library · equal” + rehearsal mix | ✅ |
| 2.2 | Pools: classic / days100 / easytags / other / all | ✅ |
| 2.3 | Scores + curves (`equal`, `reverseJ`, `leftSkew`, `bell`) + unit tests | ✅ |
| 2.4 | Quotas + short-pool spill + status line | ✅ |
| 2.5 | `RouletteModeEditor.vue` (weights, pool, curve graphics via tokens) | ✅ |
| 2.6 | Active mode switcher on main Roulette view | ✅ |
| 2.7 | Persist full `singtags.roulette.v1` modes library | ✅ |

**Exit:** Rehearsal-style mix deals; spill notice when a pool is short. ✅

---

## Phase 3 — Reel pick (token colors)

**Goal:** “Pick one” opens a modal reel; Open CTA; optional auto fullscreen.

| # | Task | Done |
| --- | --- | --- |
| 3.1 | `RoulettePickModal.vue`: ~5 visible rows, 5s ease-out strip | ✅ |
| 3.2 | Token color ring (`conic-gradient` from `--accent` mixes) + reel chrome | ✅ |
| 3.3 | Pre-choose winner; choreograph land; `wheelUsedIds` | ✅ |
| 3.4 | Disable when all picked; Reset clears picked + sung | ✅ |
| 3.5 | Stay + **Open**; pref **Open automatically** → `?fullscreen=1` | ✅ |
| 3.6 | `aria-live` + `prefers-reduced-motion` | ✅ |
| 3.7 | Decorative token color ring behind reel | ✅ |

**Exit:** No re-pick until Reset; reduced-motion path; auto-open works. ✅

### Retro — Phase 3 landed (2026-09-04)

| Went well | Learn / adjust |
| --- | --- |
| Modal via FilterSheet matches More/settings patterns | “Pick one” label (not “Select 1 randomly”) |
| Accent-only conic ring avoids rainbow | — |

**Next:** Phase 4 polish / optional prefer-unsung.

---

## Phase 4 — Polish

| # | Task | Done |
| --- | --- | --- |
| 4.1 | Second seed mode already ships with Phase 2 | ✅ |
| 4.2 | Prefer-unsung-on-pick (optional) | ☐ |
| 4.3 | Perf smoke: Deal &lt; ~50ms on ~7k | ☐ |
| 4.4 | Manual QA phone + offline catalog | ☐ |
| 4.5 | Consider graduating out of Labs (separate product decision) | ☐ |

**Retro checkpoint:** after Phase 4 / ship.

---

## Architecture (Labs)

```
prefs.tagRouletteEnabled  →  Labs card + router guard
/labs/roulette            →  RouletteView.vue
  ├─ stores/roulette.ts
  ├─ lib/rouletteDraw.ts
  ├─ RouletteModeEditor.vue
  └─ RouletteReel.vue         (Phase 3; token colors)
```

---

## Testing (per phase)

- Unit: draw / curves / quotas / spill / wheel winner  
- Prefs: Labs flag default off + toggle  
- Mount: Labs card; Roulette deal/sung/reset when flag on  

---

## Out of scope until later

- Main chrome nav / bottom tab  
- Pie wheel as primary label UI  
- Cross-device sync  
- Tick sounds (unless Phase 4 stretch)
