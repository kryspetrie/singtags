# Tag Roulette — feature implementation plan

> **Status:** proposed / implementing behind Labs ([impl plan](tag-roulette-impl.md))  
> **Updated:** 2026-09-04  
> **Created:** 2026-08-27  
> **Goal:** A dedicated **Tag Roulette** surface (SingTags **Labs**, opt-in) where users build reusable **modes** (mixture of catalog pools + score curves), **deal a batch** of tags, then optionally run a **slot-style reel** to pick one from that batch — with sung/greyed state, reset that clears greys, and optional auto-open to fullscreen sheet.  
> **Visual:** Reel / decorative color accents use **theme tokens** only (`--accent` and mixes), not a fixed rainbow.  
> **Related:** Catalog (`stores/catalog.ts`, `TagSummary`), Browse filters (`search/engine.ts`, collection facets), Recent opens (`stores/recent.ts` — **orthogonal** to roulette sung/avoid state).

---

## Product sketch

Tag Roulette has **three layers**:

1. **Modes** — named, persisted recipes (mixture slices + batch size + order).
2. **Deal** — run the active mode → a **batch** of up to **10** tags (default 10).
3. **Pick** — “Select 1 randomly” runs a **~5s reel/spinner** over the **current batch**, lands on one unused tag, leaves the rest of the batch visible.

```
┌────────────────────────────────────────────────────────────┐
│  Tag Roulette                    Mode: [ Rehearsal mix ▾ ] │
│                                  [ Edit mode ] [ + New ]   │
├────────────────────────────────────────────────────────────┤
│  [ Deal batch ]     10 tags · Random order                 │
│  [ Select 1 randomly ]   [ Reset batch ]                   │
│  ☐ Open automatically (fullscreen sheet)                   │
├────────────────────────────────────────────────────────────┤
│  ★ Reel (during / after pick)                              │
│     ┌─────────────────┐                                    │
│     │   Title …       │  ← scrolling titles (slot style)   │
│     │ ▶ Winner title  │  ← ticker / focus window           │
│     │   Title …       │  ~5s ease-out                      │
│     └─────────────────┘                                    │
│     [ Open ]  (or auto-open if pref on)                    │
├────────────────────────────────────────────────────────────┤
│  Batch                                                     │
│  ○ Title A — …                          [open]             │
│  ● Title B — …  (sung · greyed)         [open]             │
│  ◐ Title C — …  (picked)                [open]             │
│  …                                                         │
└────────────────────────────────────────────────────────────┘
```

Opening a tag marks it **sung** (greyed, still clickable). Reel landings are tracked separately so the next pick won’t land on the same batch member until **Reset**.

---

## Core concepts

### Mode

A **mode** is a saved configuration the user builds and reuses:

| Field | Meaning |
| --- | --- |
| `id`, `label` | Stable id + display name |
| `slices[]` | Weighted mixture of pools (see below); weights **normalize to 100%** |
| `batchSize` | Tags per Deal: **1–10** (UI presets 1 / 3 / 5 / 10; default **10**) |
| `batchOrder` | `random` (shuffle after draw) \| `bySlice` (keep slice groups) \| `byScore` (sort by active score desc) — default **random** |

Users can keep several modes (e.g. “Warm-up classics”, “Downloads deep cut”, “Rehearsal mix”). Active mode id persists.

### Slice (mixture component)

Each slice answers: *from which tags, scored how, with what popularity curve, for what share of the batch?*

| Field | Values |
| --- | --- |
| `weightPct` | Relative share of the batch (UI shows %; stored as weight, **normalized** so Σ = 100) |
| `pool` | Which tags are eligible (see Pools) |
| `score` | What number drives the curve: `uniform` \| `rating` \| `downloads` \| `year` |
| `curve` | Shape applied to that score: `equal` \| `reverseJ` \| `leftSkew` \| `bell` (see Curves) |

**Illustrative mode** (weights must sum to 100 in the editor — normalize on save if slightly off):

| Weight | Pool | Curve | Score |
| --- | --- | --- | --- |
| 50% | Classic | Equal | — (uniform) |
| 20% | 100 Days | Reverse-J | Downloads |
| 10% | Easy Tags | Left skew | Rating |
| 20% | Other (non–Classic / 100 / Easy) | Bell | Year |

*(Earlier draft listed 50+20+10+30 = 110%; editor always normalizes. Prefer explicit “Other = remainder” or enforce Σ = 100.)*

### Deal vs Pick vs Reset

| Action | Effect |
| --- | --- |
| **Deal batch** | Draw a new batch from the active mode. Clears `wheelUsedIds` and `sungIds`. |
| **Select 1 randomly** | Animate reel (~5s) over **current** batch; land on a tag **not yet picked** this batch. Does **not** redraw the batch. |
| **Reset batch** | Clears **both** `wheelUsedIds` and `sungIds` (greys go away; every tag is pickable again). Does **not** redraw tags — same titles stay until the next Deal. |

### Sung

- When the user **opens** a batch tag (row Open, or post-pick Open / auto-open), mark that id **sung**.
- Sung rows are **greyed / dimmed** with a “Sung” affordance, but **remain clickable**.
- Sung is **batch-scoped** and persisted with the session.
- Sung does **not** block the reel (only **picked** / `wheelUsedIds` does). Optional later: “Prefer unsung on pick”.

### Open after pick

- Default: **stay on Roulette**; show the landed title + primary **Open** button (and highlight the batch row).
- Preference (persisted in `singtags.roulette.v1`): **Open automatically** → after the reel stops, navigate to `/tag/:id?fullscreen=1` (fullscreen sheet). Opening still marks **sung**.
- Manual Open from the CTA or row uses the same fullscreen query when that pref is on; when off, open the normal tag page (or respect global Sing mode if already on — follow existing app link behavior).

---

## Pools

Built on catalog `collection` (+ reserved “Other”):

| Pool id | Filter |
| --- | --- |
| `classic` | `collection === 'classic'` (and aliases already normalized in catalog) |
| `days100` | `collection === '100'` (100 Tags / 100 Days) |
| `easytags` | `collection === 'easytags'` |
| `other` | Not in {classic, 100, easytags} |
| `all` | Entire catalog |
| `custom` | Explicit multi-select of collection ids and/or arrangers (v1.1 if needed) |

Reuse existing collection labels/badges from `lib/collections.ts` in the mode editor.

Eligible tags need a valid `id` and enough identity to open (same as Browse).

### Short pools (what happens when a slice can’t fill its share)

Example: mode wants **batch 10**, with **50% Easy Tags** → quota asks for **5** Easy Tags, but that collection only has **3** tags in the catalog (or 3 left after uniqueness).

**v1 policy (locked):** always try to return a full batch of `n` when the **whole catalog** allows it.

1. Draw as many as possible from the slice’s pool (with its curve).
2. **Spill** unmet slots to the remaining slices (proportional to their weights), still enforcing batch-wide uniqueness.
3. If still short, fill from `all` (excluding already chosen), uniform.
4. Show a quiet status once: e.g. “Easy Tags only had 3 — filled the rest from other pools.”

Never leave the user with a mysteriously tiny batch unless the entire eligible catalog has fewer than `n` tags.

---

## Curves & score (with graphics)

Each non-`equal` curve needs a **small SVG/icon graphic** in the mode editor so users see the shape without reading math.

### Score \(s_i\)

| Score mode | \(s_i\) | Missing data |
| --- | --- | --- |
| `uniform` | ignored | Curve forced to `equal` |
| `rating` | rating 0–5 | Floor **2.5** (unrated ≈ mid) |
| `downloads` | `log1p(downloads)` | 0 → rare but drawable |
| `year` | numeric year | Missing year → mid of observed year range in that pool |

Normalize \(s_i\) to \(u_i \in [0,1]\) within the **slice’s eligible pool** (min–max; if flat, treat as uniform).

### Curve → weight

| Curve | UI name | Feel | Weight idea |
| --- | --- | --- | --- |
| `equal` | Equal | Flat | \(w_i = 1\) |
| `reverseJ` | Reverse J | Favor **high** score (hits / recent years if year) | \(w_i = (u_i + \varepsilon)^{\alpha}\) with \(\alpha \approx 1.5\)–`2` |
| `leftSkew` | Left skew | Favor **low** score (deeper cuts / older years) | \(w_i = (1 - u_i + \varepsilon)^{\alpha}\) |
| `bell` | Bell | Favor **middle** of the score range | \(w_i = \exp\!\big(-(u_i - 0.5)^2 / (2\sigma^2)\big)\), \(\sigma \approx 0.2\) |

Advanced (optional): expose \(\alpha\) / \(\sigma\) per slice; v1 can hardcode good defaults and only show the four named shapes + graphics.

Sampling: **weighted without replacement** within each slice (Efraimidis–Spirakis or sequential renormalize). Inject `rng` for tests.

---

## Mixture draw algorithm (Deal)

Goal: approximate slice weights in a batch of size \(n \le 10\).

1. Normalize slice weights to proportions \(p_k\), \(\sum p_k = 1\).
2. **Quota:** \(q_k = \mathrm{round}(p_k \cdot n)\) with largest-remainder method so \(\sum q_k = n\).
3. For each slice \(k\) with \(q_k > 0\):
   - Build eligible set = `pool(k)` minus tags already chosen in this Deal (global uniqueness in the batch).
   - If too small, take all remaining; spill unmet quota to later slices / final fill from `all` excluding chosen (document in UI: “Pool short — filled from other tags”).
   - Draw \(q_k\) tags with that slice’s curve/score.
4. Apply `batchOrder` (shuffle if `random`).
5. Replace `currentBatch` in the roulette store; clear `wheelUsedIds` and `sungIds` for the new batch.
6. Persist batch + mode id.

**Monte Carlo check:** over many Deals, empirical slice membership ≈ configured %.

---

## Pick animation (“Select 1 randomly”)

### Decision: slot-style **reel**, not a pie wheel

| Reference | Style | Fit for SingTags |
| --- | --- | --- |
| [Hack Club spinning wheel](https://hackclub-w.lachlanjc.com/spinning_wheel/) | Classic **pie** + side arrow; CSS `transition` ~**5s**; fixed **8** clip-path wedges; center SPIN | Best “roulette game” look of the three, and timing matches us — but labels live **inside wedges**. Long tag titles clip; segment count is hardcoded, not dynamic 1–10 |
| [CodeTap CSS roulette](https://codetap.org/project/roulette-wheel-with-css) | Same family: pie + pointer + JS rotation | Same title / segment scaling problems |
| [CodePen spin randomizer](https://codepen.io/TheNature/pen/GRJvWPj) | Rotating plate; **rewrites** the few visible labels while spinning | Closest to scalable labeling; still pie geometry with only ~4 readable slots |

**v1 choice: vertical (or horizontal) slot/reel** — keep the *feel* of those demos (5s ease-out, ticker/focus, suspense) without pie wedges:

- Fixed viewport shows ~3 rows (above / focus / below) with a highlight on the center.
- During the ~5s ease-out, cycle titles from the **eligible** batch set (and optional decoy repeats for motion).
- Recycle a small pool of DOM nodes: when a row scrolls out of view, assign the next title — **O(1) DOM**, readable at any batch size.
- Winner is chosen **before** the animation; the reel is choreographed to land on that title (fair + testable).
- `prefers-reduced-motion`: skip long spin; short fade + announce winner.

**Why not ship the Hack Club pie first?** Nicest pure roulette look, but SingTags items are **song titles**, not short tokens like “Joker”. A pie that can’t show the title fails the product job. Pie stays a possible **later skin** (e.g. Classic #12 only) if we want spectacle.

### Eligibility

From `currentBatch`, candidates = tags **not** in `wheelUsedIds`.  
If none left → disable button; copy: “All tags in this batch were picked — Reset to spin again.”

### Timing & landing

| Constraint | Spec |
| --- | --- |
| Duration | **5 seconds** total (±200ms) — same ballpark as the Hack Club workshop |
| Motion | Accelerate then ease-out; center lock on winner |
| After land | Highlight batch row; show **Open** CTA; if `openAutomatically`, route to `/tag/:id?fullscreen=1` |
| Sound | Optional soft tick — **v1.1** |

### Reset

- Clears `wheelUsedIds` **and** `sungIds` (greys clear).
- Same batch items remain until Deal.

---

## Persistence (`localStorage`)

| Key | Contents |
| --- | --- |
| `singtags.roulette.v1` | Modes library, `activeModeId`, `openAutomatically`, UI chrome |
| `singtags.rouletteSession.v1` | Current batch, `wheelUsedIds`, `sungIds`, `dealtAt` |

### Prefs shape (sketch)

```ts
type RouletteCurve = 'equal' | 'reverseJ' | 'leftSkew' | 'bell'
type RouletteScore = 'uniform' | 'rating' | 'downloads' | 'year'
type RoulettePoolId = 'classic' | 'days100' | 'easytags' | 'other' | 'all'

type RouletteSlice = {
  weightPct: number
  pool: RoulettePoolId
  score: RouletteScore
  curve: RouletteCurve
}

type RouletteMode = {
  id: string
  label: string
  slices: RouletteSlice[]
  batchSize: number        // 1..10
  batchOrder: 'random' | 'bySlice' | 'byScore'
}

type RoulettePrefs = {
  schema: 'singtags.roulette.v1'
  activeModeId: string
  modes: RouletteMode[]
  /** After reel lands, open tag fullscreen sheet automatically. */
  openAutomatically: boolean  // default false
}
```

### Session shape

```ts
type RouletteBatchItem = {
  id: number
  /** Snapshot fields for row display if catalog reloads */
  title: string
  arranger?: string | null
  collection?: string | null
  classic?: string | number | null
  rating?: number | null
}

type RouletteSession = {
  schema: 'singtags.rouletteSession.v1'
  modeId: string
  items: RouletteBatchItem[]
  wheelUsedIds: number[]
  sungIds: number[]
  dealtAt: string  // ISO
}
```

Ship **1–2 seed modes** (e.g. “Full library · equal” and the rehearsal mix example) so first visit isn’t an empty editor.

Optional later: include prefs (not session) in offline cache zip — nice-to-have.

---

## UX details

### Mode editor

- List modes; set active; duplicate / rename / delete (block delete of last mode).
- Per mode: batch size, order, slice list.
- Per slice: weight slider/%, pool select, score select (disabled when curve = equal), curve select **with graphic**.
- Live summary: `50% Classic · equal · 20% 100 Days · reverse-J / downloads · … · batch 10 · random`.
- Validate: ≥1 slice; weights &gt; 0; normalize on blur/save.

### Main page

- Mode switcher (select) + Edit / New.
- Primary **Deal batch**; secondary **Select 1 randomly**; tertiary **Reset**.
- Toggle: **Open automatically (fullscreen sheet)** — persisted.
- Batch rows: title, arranger, collection badge, rating; sung grey; picked marker; Open control.
- Empty: “Deal a batch to get started.”
- Catalog empty: same load/empty state as Browse.
- Short-pool spill: one-line status under the deal controls when fill had to borrow from other pools.

### Nav

- Route: `/labs/roulette` (Labs-gated; default off).
- Entry: **Labs → Tag Roulette** only for v1 (no top nav / bottom tab until graduation).
- See [tag-roulette-impl.md](tag-roulette-impl.md) for phased delivery.

### Accessibility

- Deal / Select / Reset are buttons with clear names.
- Reel: `aria-live` announces the landed title; reduced-motion path required.
- Mode editor: native controls + graphics with text labels (not color-only).

---

## Architecture

```
RouletteView.vue              # deal / reel / batch list
RouletteModeEditor.vue        # slices + curve graphics
components/RouletteReel.vue   # 5s slot-style spinner (recycled rows)

lib/rouletteDraw.ts           # pools, curves, mixture quotas, spill fill, weighted sample
lib/rouletteCurves.ts         # weight(u, curve) + graphic metadata
stores/roulette.ts            # prefs + session; sung / wheelUsed / openAutomatically
```

### Core API (pure, unit-tested)

```ts
function sliceEligible(tags: TagSummary[], pool: RoulettePoolId): TagSummary[]

function tagUnitScore(
  tag: TagSummary,
  score: RouletteScore,
  poolStats: { min: number; max: number },
): number  // 0..1

function curveWeight(u: number, curve: RouletteCurve): number

function allocateQuotas(weights: number[], n: number): number[]

function dealFromMode(
  tags: TagSummary[],
  mode: RouletteMode,
  rng?: () => number,
): TagSummary[]

function pickWheelWinner(
  batchIds: number[],
  wheelUsedIds: number[],
  rng?: () => number,
): number | null
```

Catalog: ensure loaded on mount (Browse hydrate path). Offline catalog is enough to Deal; opening a tag may still need media cache (same as Browse).

---

## Phased delivery

### Phase 0 — Spec lock

- Missing-rating floor **2.5** — locked.
- **Reset** clears sung + picked — locked.
- Stay on page + Open; optional **open automatically** fullscreen — locked.
- Short pools: spill to fill `n` + status line — locked.
- Confirm seed mode list and default active mode.
- Confirm nav = top link only.
- Confirm copy: **Deal batch** vs **Draw** (pick keeps “Select 1 randomly”).

### Phase 1 — Deal + batch shell

- `/roulette` + nav.
- Single built-in mode: full library, equal, `n=10`, random order.
- Deal → list; open → sung grey; Reset clears sung + picked; session persist.
- `rouletteDraw` uniform + tests.

**Exit:** Deal returns distinct tags; sung survives remount; Reset clears greys.

### Phase 2 — Modes + mixture + curves

- Mode library + editor + persistence `singtags.roulette.v1`.
- Pools: classic / days100 / easytags / other / all.
- Curves + graphics; scores rating / downloads / year.
- Quota mixture + short-pool spill + Monte Carlo tests.

**Exit:** Example rehearsal mix Deal roughly matches weights; spill status appears when a pool is short.

### Phase 3 — Reel pick

- `RouletteReel.vue`: 5s slot-style spin, recycled labels, ticker, reduced-motion.
- Select 1 randomly; `wheelUsedIds`; disable when exhausted.
- Open CTA + `openAutomatically` → `?fullscreen=1`.
- Reset clears picked + sung.

**Exit:** Cannot re-land same id until Reset; animation ≤5.2s; a11y live region; auto-open pref works.

### Phase 4 — Polish

- Seed modes; empty/short-pool messaging polish.
- Optional: prefer unsung on pick; arranger custom pool; zip prefs; tick sound; pie-wheel skin.
- Perf: Deal &lt; ~50ms on ~7k tags.

---

## Testing strategy

| Layer | Cases |
| --- | --- |
| Unit | Quotas sum to n; uniqueness in batch; reverse-J favors high downloads; left-skew favors low; bell mid-year; wheel excludes used; normalize weights |
| Component | Deal replaces batch; sung grey on open; Reset clears greys + re-enables pick; auto-open pref; mode switch persists |
| Manual | Phone; reduced motion; offline catalog; tiny Easy Tags pool with large weight (spill notice) |

---

## Performance

- Precompute scores/weights per slice per Deal (O(N)); n≤10.
- Keep draw math in plain TS (no reactive 7k arrays).
- Reel uses a fixed handful of recycled row nodes (not one DOM node per catalog tag).

---

## Non-goals (v1)

- ML / vibe similarity.
- Server-side random API.
- Replacing Browse or Recent.
- Cross-device mode sync (localStorage only).
- Infinite historical spin log UI.
- Pie-wheel as the only picker (reel is primary).
- Guaranteeing lifetime uniqueness across Deals (only uniqueness **within** a batch + picked-until-Reset).

---

## Open questions (remaining)

1. Seed modes: only “Full library · equal”, or also ship the rehearsal mix example?
2. Copy: **Deal batch** vs **Draw** vs **Spin batch**?
3. When `openAutomatically` is off, should row Open still honor global **Sing mode** fullscreen? (Likely **yes** — don’t special-case Roulette against existing Sing behavior.)

---

## Implementation checklist

**Phase 1**

- [ ] `lib/rouletteDraw.ts` (+ curve helpers) + tests
- [ ] `stores/roulette.ts` session + sung + reset clears both
- [ ] `RouletteView.vue` + route + nav
- [ ] Deal / open / sung grey / Reset

**Phase 2**

- [ ] Mode model + `singtags.roulette.v1` (+ `openAutomatically`)
- [ ] `RouletteModeEditor.vue` + curve graphics
- [ ] Mixture quotas + short-pool spill

**Phase 3**

- [ ] `RouletteReel.vue` (5s slot reel, recycled labels)
- [ ] picked ids + Open CTA + auto fullscreen
- [ ] reduced-motion + aria-live

**Phase 4**

- [ ] Seed modes / polish / optional extras

---

## Relationship to other features

| Feature | Relationship |
| --- | --- |
| Browse | Shared catalog + collection facets; roulette does not replace search |
| Recent | Open history — do **not** reuse for picked or sung |
| Favorites / practice sets | Deliberate lists — different intent from discovery Deal |
| Sing mode | Auto-open uses `?fullscreen=1`; manual open should respect Sing mode like other list → tag navigations |
| Pitch Pipe | Unrelated |

---

## Migration from prior plan draft

The earlier plan (single pool, global avoid of last 10 **Deal presses**, n up to 20) is **superseded** by:

- **Modes + mixture slices** instead of one global pool/weight.
- **Batch ≤10** for a manageable list (reel animation itself is not capped by pie wedges).
- **Slot-style reel** as the interactive “pick one” layer (pie wheel optional later).
- **Sung** (opened) vs **picked** (reel-landed) vs **Reset** (clears both), instead of a rolling 10-spin avoid-list across Deals.

Cross-Deal “don’t show tags from the last few Deals” can return later as an optional mode flag; not required for v1.
