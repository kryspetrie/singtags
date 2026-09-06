# Local Library UX — search & consistency

> **Status:** Proposed  
> **Created:** 2026-09-04  
> **Goal:** Bring Local Library search chrome and query power closer to Browse, without pretending it is the catalog. Clean up residual UX inconsistencies with Favorites / Browse after [local-library-hardening](local-library-hardening.md).  
> **Related:** [local-library-transfer.md](local-library-transfer.md), [local-library-hardening.md](local-library-hardening.md), Browse search (`web/src/search/*`, `HomeView.vue`).

---

## What’s already defined (and done)

Hardening **A–I is implemented**. Do **not** reopen those phase tables as backlog.

| Already shipped | Still deferred (not this plan) |
| --- | --- |
| Entry + Assets IDB model | Phase C short-lived S3 transfer |
| Groups curation (add/remove/rename) | Bottom-nav promotion out of Labs |
| Merge / import-as-one / optical | Indexed / FTS engine |
| Soft receive dedupe + size honesty | Full Favorites backup / clear-cache wipe of LL |
| Pitch + detune on Local Doc | Catalog Browse “Offline” packs (separate system) |

**Naming reminder:** **Local Library** (Labs, user songs in IDB) ≠ **Offline library** (Settings catalog packs / Cache API). Keep copy distinct.

---

## Problems this plan fixes

1. **Search notes chrome** — Always-visible checkbox under the field. Browse’s analog (**Search lyrics**) lives in a trailing **⋮ options** panel. Users asked to match Browse.
2. **Weak search** — Single case-insensitive substring over title / arranger / key (+ notes when opted in). No tokens, excludes, quotes, or field prefixes.
3. **Visual / interaction drift** — Search toolbar, options panel, and list chrome differ from Browse / Favorites without a product reason (groups already mirror Favorites chips).

---

## Non-goals

- Porting Browse `SearchChips` (Sheet / Tracks / Offline / Year / Collection) — Local Library has no catalog facets; **groups remain the filter**.
- Full Browse engine / lyrics index / vibe search.
- Sort modes (A–Z, View by) — still optional polish; drag order stays primary when not searching.
- Promoting Local Library out of Labs / bottom nav.
- Changing catalog offline packs.

---

## Phase 1 — Browse-shaped search options (UI)

**Deliver**

Mirror Browse’s search row pattern in `LocalLibraryView.vue`:

```
[ Search field … Clear ✕ ]  [ ⋮ options ]
▾ options panel (default closed)
  ─ Search notes (switch)   “Also match text in song notes”
```

| Detail | Spec |
| --- | --- |
| Button | Same `options-btn` affordance as Browse (`aria-expanded`, `aria-controls="library-options"`) |
| Closed tip | “Show search options” |
| Open tip | “Hide search options” |
| Switch | Replaces the always-visible **Search notes** checkbox; default **off** (unchanged) |
| Placeholder | Keep titles/arrangers/keys; optionally append hint when notes on (“…and notes”) |
| Persistence | Optional: remember `searchNotes` in `sessionStorage` or prefs — **nice-to-have**, not required for exit |

**Done when:** No checkbox under the field; opening ⋮ reveals Search notes like Browse’s Search lyrics.

**Files:** `LocalLibraryView.vue` (+ scoped CSS aligned with HomeView options panel tokens).

---

## Phase 2 — Better query matching (Browse-lite)

Extend `matchLocalLibraryQuery` (or a thin `localLibraryQuery.ts` next to it) without pulling in the full catalog `SearchEngine`.

### Supported query language (v1)

| Feature | Behavior |
| --- | --- |
| Tokens | Whitespace-split; **all** must match (AND) |
| Exclude | `-token` must not appear in the haystack |
| Phrases | `"exact phrase"` |
| Field prefixes | `title:`, `arranger:`, `key:`, `notes:` (notes field only searched when Search notes is on **or** when `notes:` is used explicitly) |
| Case | Case-insensitive; trim |

### Explicitly out of v1

| Browse feature | Local Library |
| --- | --- |
| `n123` / `c45` / `p12` shortcuts | Skip (no tag numbers / classic booklet) |
| `minRating:` / `yearMin:` / `hasSheet` tokens | Skip or map later to asset roles if cheap (`has:sheet`, `has:audio`) — **stretch** |
| Lyrics / fullText index | N/A (notes are short free text) |

### Implementation sketch

```ts
type LocalLibraryParsedQuery = {
  include: Array<{ field?: 'title' | 'arranger' | 'key' | 'notes' | 'any'; text: string }>
  exclude: string[]
  phrases: string[]
}

function parseLocalLibraryQuery(raw: string): LocalLibraryParsedQuery
function matchLocalLibraryQuery(entry, raw, { includeNotes }): boolean
```

Reuse ideas from `web/src/search/query.ts` where practical, but **do not** couple Local Library to catalog indexes.

**Done when:** Unit tests cover AND tokens, `-exclude`, quotes, and `arranger:` / `notes:`; searching with notes off still ignores free-text notes unless `notes:` is used.

**Files:** `types/localLibrary.ts` and/or `lib/localLibraryQuery.ts`, `localLibrary*.test.ts`, `LocalLibraryView.vue` (wire-through only).

---

## Phase 3 — Consistency polish (scoped)

Cheap alignment with the rest of the app; stop when diminishing returns.

| Item | Approach |
| --- | --- |
| Search tips | Optional **i** tip popover (Browse-lite cheat sheet: tokens, `-`, quotes, fields) — only if Phase 2 lands |
| Empty states | Keep current; tweak “No matching songs” to mention Search notes / clear query |
| Row meta | Prefer shared patterns (muted meta line, touch targets) already used on Favorites; **do not** force `TagListRowContent` (catalog-shaped) onto local entries |
| Optical row button | Leave as-is while Optical Labs is on; demote only if product asks (catalog already demoted) |
| Smoke tests | Mount `LocalLibraryView` search options + notes toggle (hardening residual) |

**Done when:** Search chrome feels like Browse; list still feels like Favorites; no new product surfaces.

---

## Phase 4 — Optional later (explicit backlog, not required)

- `has:sheet` / `has:audio` / `has:image` tokens from asset roles  
- Session-persistent search options  
- Light sort control (title A–Z) when searching  
- Bottom-nav / graduate out of Labs (separate product decision)

---

## Testing

| Layer | What |
| --- | --- |
| Unit | `parseLocalLibraryQuery` / `matchLocalLibraryQuery` cases above |
| Component smoke | Options panel open/close; Search notes toggles match set |
| Manual | Phone: ⋮ panel, group chips + search together, reorder disabled while querying |

---

## Implementation checklist

**Phase 1**

- [ ] Remove always-visible Search notes checkbox
- [ ] Add ⋮ options button + panel with Search notes switch
- [ ] Match Browse aria / tooltips / default-closed

**Phase 2**

- [ ] Parse tokens / exclude / phrases / field prefixes
- [ ] Wire `includeNotes` + explicit `notes:`
- [ ] Unit tests

**Phase 3**

- [ ] Tips / empty copy / smoke test as needed
- [ ] Visual pass vs Browse + Favorites

---

## Open questions

1. Should explicit `notes:foo` bypass the Search notes switch? **Recommendation: yes** (power-user escape hatch).
2. Persist Search notes across visits? **Recommendation: no for v1** (match Browse lyrics: session UI state only unless Browse already persists — keep parity).

---

## Follow-on (Local Library redesign)

Shipped / in progress beyond this UX plan:

1. Filename → part heuristics + track `partId` for TagPlayer tabs
2. Single **Import** modal + review staging
3. Browse-shaped search options, row badges, Sing-mode open, scroll restore
4. **Playlists** (ordered concert sets, fullscreen default, prev/next)
5. Zip **backup/restore** + storage meter

**Labs graduation:** Keep Local Library behind Labs until Phases 1–4 feel solid in real rehearsals, then promote (More menu permanent; optional bottom nav). Do not confuse with Settings **Offline packs**.

