# Tag Roulette — feature implementation plan

> **Status:** proposed (not implemented)  
> **Created:** 2026-08-27  
> **Goal:** A dedicated page that draws **n** tag suggestions from the catalog using configurable pools, optional popularity weighting, and short-term “don’t show again” memory across spins.  
> **Related:** Catalog (`stores/catalog.ts`, `TagSummary`), Browse filters (`search/engine.ts`, `FilterSheet`), Recent opens (`stores/recent.ts` — **not** the same as roulette avoid-list).

---

## Product sketch

**Tag Roulette** is a “deal me some tags” surface for rehearsal variety: hit **Spin**, get a short list of suggestions, open any of them, spin again.

```
┌──────────────────────────────────────────────┐
│  Tag Roulette                         [⚙]    │  ← settings disclosure (default closed)
├──────────────────────────────────────────────┤
│  [ Spin ]     Showing 3 of ~7.1k             │
├──────────────────────────────────────────────┤
│  • Title A — Arranger — ★4.2 — Classic #12   │
│  • Title B — …                               │
│  • Title C — …                               │
└──────────────────────────────────────────────┘
```

Each result row links to `/tag/:id` (same as Browse). Optional secondary actions later: star, add to queue — **not required for v1**.

---

## Product requirements

1. **Draw size `n`** — user picks **1 / 3 / 10 / 20** tags per spin (default **3**).
2. **Pool / criteria**
   - **Full library** (default) — all catalog tags with enough identity to open (id present).
   - **Limit to collection** — one or more catalog `collection` values (e.g. `classic`), multi-select like Browse chips when useful.
   - **Limit by arranger** (v1.1 or v1 if cheap) — e.g. Paul Olguin via existing arranger facet; same weighted draw over the filtered set.
3. **Weighting modes** (mutually exclusive primary mode, or “none” + optional toggles — see below)
   - **Uniform** — every eligible tag equal probability.
   - **Weight by rating** — higher `rating` → higher draw chance.
   - **Weight by downloads** — higher `downloads` → higher draw chance.
4. **Avoid recent roulette picks**
   - Remember tag ids from the last **10 spins** (not 10 tags — **10 presses** of Spin).
   - Across those spins, avoid re-drawing ids already returned (when the pool is large enough).
   - If the user does **not** press Spin for **1 day**, clear the avoid-list (fresh start).
5. **Offline** — works entirely from the in-memory / cached catalog (no network). If catalog empty, show the same “load catalog” empty state as Browse.
6. **Persist settings** — layout of controls + weighting + `n` + collection filter in preferences (`localStorage`), same pattern as pitch pipe (`singtags.*` keys). Avoid-list is separate session-ish state (see Storage).

### Non-goals (v1)

- ML / embedding “similar tags” (see vibe search docs separately).
- Guaranteeing uniqueness forever or across devices.
- Replacing Browse search or Recent page.
- Server-side random API.

---

## Data model (existing)

From `TagSummary` (catalog index):

| Field | Use in roulette |
| --- | --- |
| `id` | Result identity + avoid-list |
| `title`, `arranger`, `key` | Result row display |
| `rating` | Weighting (nullable → treat as low / neutral) |
| `downloads` | Weighting (nullable → 0) |
| `collection` | Pool filter |
| `classic` | Display only (optional badge); not a pool unless we add “Classic booklet only” later |
| `type` | Optional future filter |

Facet lists already exist on the catalog store (`collections`, `arrangers`) for filter UIs.

**Important:** Roulette “avoid recent” is **not** `useRecentStore` (tag *opens*). It is a dedicated **spin history** so opening a suggested tag does not by itself burn avoid slots — only **Spin** does.

---

## Weighting math

Goal: with weighting on, higher-rated / more-downloaded tags appear **more often**, without making the top ~50 tags the *only* outcomes.

### Recommended approach: power-law / exponential-style weights

For each eligible tag \(i\) with score \(s_i \ge 0\):

\[
w_i = (s_i + \varepsilon)^{\alpha}
\]

Then sample without replacement using weighted random draws (sequential: pick one, remove, renormalize — or exponential-race / Efraimidis–Spirakis for without-replacement).

| Mode | Score \(s_i\) | Notes |
| --- | --- | --- |
| Uniform | \(1\) | Ignore \(\alpha\) |
| Rating | `rating` (e.g. 0–5) | Missing rating → \(\varepsilon\) only or a floor like `2.5` — **decide in Phase 0** |
| Downloads | `log1p(downloads)` | Raw download counts are heavy-tailed; **log** before power keeps the curve usable |

**Exponent \(\alpha\)** (tunable in settings, advanced):

| \(\alpha\) | Feel |
| --- | --- |
| `0` | Uniform (even if “weight by X” UI is on — avoid) |
| `1` | Mild preference |
| `1.5`–`2` | **Default recommendation** — clear bias to popular tags, long tail still reachable |
| `3+` | Very “hits radio” — may feel repetitive; expose only as Advanced |

Call the curve **“popularity curve”** in UI copy, not “exponential decay” (decay usually means time; here we mean a **convex lift** of high scores). Document in code as `weight = (score + eps) ** alpha`.

### Missing data policy (lock in Phase 0)

- **Downloads null/0:** \(s = 0\) → weight \(\varepsilon^{\alpha}\) (still drawable, rare).
- **Rating null:** prefer floor **2.5** (mid) *or* treat as 0 — mid avoids punishing unrated classics unfairly; pick one and unit-test.

### Combined weighting (optional v1.1)

`weight by rating` **or** `weight by downloads` as a single select for v1. Later: blend  
\(s = a\cdot \mathrm{norm}(rating) + b\cdot \mathrm{norm}(\log downloads)\).

---

## Avoid-list semantics

### State

```ts
type RouletteAvoidState = {
  /** Tag ids returned by recent spins, oldest → newest or newest-first — pick one and stick. */
  spinBatches: number[][]  // length ≤ 10; each batch is the n ids from one Spin
  /** ISO time of last Spin press */
  lastSpinAt: string
}
```

### Rules on Spin

1. If `now - lastSpinAt > 1 day` → clear `spinBatches`.
2. Build eligible pool = filter(catalog) minus `flatten(spinBatches)`.
3. If pool size `< n`:
   - **v1 policy:** clear oldest spins until `pool.length >= n`, or if still short, allow draws from full filtered set (ignore avoid). Prefer shrinking avoid-list first so small collections (e.g. tiny custom collection) still work.
4. Draw `n` distinct ids (weighted or uniform).
5. Append batch to `spinBatches`; trim to last **10** batches.
6. Set `lastSpinAt = now`.

### “10 presses”

User wording: *avoid tags from the past 10 presses of the random button*.  
→ Avoid-list capacity = **10 spin batches**, not 10 tags. With `n=20`, up to 200 ids could be excluded — acceptable; for tiny pools the fallback in step 3 matters.

### Persistence

- Persist avoid state in `localStorage` (`singtags.rouletteAvoid.v1`) so refresh doesn’t reset mid-rehearsal.
- 1-day idle still clears on next Spin (lazy expiry), not a background timer.

---

## Settings (persist)

| Setting | Values | Default |
| --- | --- | --- |
| Count `n` | 1, 3, 10, 20 | 3 |
| Pool | Full library \| Collection(s)… | Full |
| Weighting | Off (uniform) \| Rating \| Downloads | Off |
| Curve strength \(\alpha\) | e.g. 1.0 / 1.5 / 2.0 (Advanced) | 1.5 |
| Avoid recent spins | on/off | on |

UI: collapsible **Settings** disclosure (default closed), summary line like Pitch Pipe (`3 · Full library · Uniform`).

Persist blob: `singtags.roulette.v1` JSON (same approach as pitch pipe prefs). Optionally include in offline cache zip later — **nice-to-have**, not blocking.

---

## Architecture

```
RouletteView.vue
  ├─ settings disclosure (n, pool, weight, avoid)
  ├─ Spin button + status (“Avoiding 24 tags from last 8 spins”)
  └─ result list → RouterLink /tag/:id

lib/rouletteDraw.ts          # pure: filter + weight + sample without replacement
stores/roulette.ts           # avoid-list + lastSpinAt; prefs may live in preferences store
```

### Core API (pure, unit-tested)

```ts
function rouletteEligible(
  tags: TagSummary[],
  opts: { collections?: string[]; arrangers?: string[] },
): TagSummary[]

function tagWeight(
  tag: TagSummary,
  mode: 'uniform' | 'rating' | 'downloads',
  alpha: number,
): number

function drawWeightedUnique(
  tags: TagSummary[],
  n: number,
  weightOf: (t: TagSummary) => number,
  rng?: () => number,
): TagSummary[]
```

Inject `rng` for deterministic tests.

### Catalog dependency

- `useCatalogStore().tags` must be loaded (reuse Browse’s load / hydrate path on mount).
- Offline: snapshot catalog is enough; no media required to *suggest* (opening a tag may still need cache — same as Browse).

---

## UX details

- Primary CTA: large **Spin** (or **Deal** — pick one label and stick; recommend **Spin**).
- After spin: list replaces previous results (no infinite scroll of history on the page). Optional “previous spin” is out of scope.
- Empty pool: “No tags match these filters.”
- Collection picker: multi-select from `catalog.collections`; empty selection = full library.
- Accessibility: Spin is a button; results are links; settings in `<details>`.

### Nav

- Add **Roulette** route `/roulette`.
- Top nav + consider bottom tab carefully (tab bar already crowded). Options:
  - **A:** Top nav only (Browse / Recent / … / Roulette)
  - **B:** Under Browse as a header action (“Feeling lucky”)
  - **C:** Bottom tab replacing something — **avoid unless user insists**

Recommend **A** for v1.

---

## Phased delivery

### Phase 0 — Spec lock (short)

- Confirm missing-rating policy (floor 2.5 vs 0).
- Confirm avoid = 10 **spins** (batches) vs 10 **tags**.
- Confirm nav placement (top-only vs Browse entry point).
- Confirm whether arranger filter ships in v1 or v1.1.

### Phase 1 — Core draw + page shell

**Deliver**

- `/roulette` + nav link.
- Uniform draw over full catalog; `n` ∈ {1,3,10,20}.
- Results list with title / arranger / rating.
- Pure functions + tests for sampling without replacement.

**Exit:** Spin returns `n` distinct tags; `npm test` covers draw helpers.

### Phase 2 — Filters + weighting

**Deliver**

- Collection multi-filter.
- Weight modes: uniform / rating / downloads with \(\alpha\) default 1.5.
- Settings disclosure + persisted prefs.

**Exit:** With downloads weighting, high-download tags appear more often in a Monte Carlo unit test (e.g. 5k draws, top decile mass significantly above uniform).

### Phase 3 — Avoid recent spins

**Deliver**

- Avoid store: 10 batches, 1-day lazy expiry, pool exhaustion fallback.
- Status copy when avoid is active.
- Toggle to disable avoid.

**Exit:** Spinning 10 times with `n=3` never repeats an id while pool allows; after mocking `lastSpinAt` − 25h, repeats become possible.

### Phase 4 — Polish

- Arranger filter (if deferred).
- Classic badge on rows; star from row (optional).
- Include roulette prefs in offline cache zip (optional).
- Manual QA offline + large catalog performance (draw should be &lt; ~50ms on 7k tags).

---

## Testing strategy

| Layer | Cases |
| --- | --- |
| Unit | Uniform uniqueness; weighted bias Monte Carlo; log1p downloads; null rating policy; avoid expiry; shrink avoid when pool small |
| Component | Spin updates list; settings persist across remount |
| Manual | Phone; offline catalog; collection-only pool of size &lt; n |

---

## Performance

- Precompute weights array once per spin (O(N)); sampling O(N·n) is fine for N≈7k, n≤20.
- Do not copy full catalog unnecessarily; filter into a working array per spin.
- Avoid Vue reactivity on the 7k-element weight buffer — keep draw in plain TS.

---

## Open questions

1. Missing **rating**: floor **2.5** or treat as **0**?
2. Nav: **top link only** vs entry from Browse?
3. Arranger filter in **v1** or **v1.1**?
4. Should Spin also exclude tags in the user’s **Recent opens** list (optional extra checkbox)?
5. Copy: **Spin** vs **Deal** vs **Shuffle**?

---

## Implementation checklist (copy into PR)

**Phase 1**

- [ ] `lib/rouletteDraw.ts` + tests
- [ ] `RouletteView.vue` + route + nav
- [ ] Catalog ensure-loaded on mount
- [ ] `n` selector 1/3/10/20

**Phase 2**

- [ ] Collection filter
- [ ] Weight modes + \(\alpha\)
- [ ] Prefs persistence `singtags.roulette.v1`

**Phase 3**

- [ ] Avoid-list store (10 spins, 1-day expiry)
- [ ] Exhaustion fallback + UI status

**Phase 4**

- [ ] Arranger filter / polish / optional zip prefs

---

## Relationship to other features

| Feature | Relationship |
| --- | --- |
| Browse | Shares catalog + collection facets; roulette does not replace search |
| Recent | Opens history — orthogonal; do not reuse for avoid-list |
| Practice set | Ordered starred set — different intent (deliberate vs discovery) |
| Pitch Pipe / Piano | Unrelated audio tools |
