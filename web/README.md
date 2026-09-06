# SingTags web app

Vue 3 + TypeScript + Vite SPA for **[www.singtags.com](https://www.singtags.com)**.

Static site: no app server. Catalog search, playback, sheets, offline packs, and downloads all run in the browser against published indexes and media.

| Upstream | Role |
| --- | --- |
| [`../library/`](../library/) | Working media (gitignored); Vite serves it at `/library` in dev |
| [`../build/`](../build/) | Builds gzipped indexes into `public/indexes/` |
| [`../deploy/`](../deploy/) | Publishes this app + indexes (and separately, media) to S3 |
| [`../docs/`](../docs/README.md) | Architecture, decisions, publish runbook |

---

## Prerequisites

```bash
# From website repo root — need indexes (and preferably a local library/)
python3 build/build_indexes.py
python3 build/build_offline_manifest.py   # Settings → Offline packs
```

`web/public/indexes/` is usually committed; `web/public/tags/` is gitignored — rebuild indexes after clone for local tag detail. Without `library/`, browse/search still work from indexes; tag audio/sheets 404 until media is present or `VITE_MEDIA_BASE` points at a remote library.

Catalog / offline-pack rebuilds and deploy order: [`../docs/publish.md`](../docs/publish.md) (website deploy does **not** run these scripts).

---

## Commands

```bash
cd web
npm install
npm run dev            # http://localhost:5173 — library/ at /library
npm run build          # vue-tsc + Vite production build (PWA)
npm run preview
npm run test           # vitest
npm run test:coverage
npm run typecheck
npm run storybook
npm run lighthouse
```

Deploy the built site:

```bash
# from repo root
./deploy/publish.sh website
```

---

## Environment

| Variable | Purpose |
| --- | --- |
| `VITE_BASE` | App URL prefix (`/` default; e.g. `/singtags/` for a subpath) |
| `VITE_MEDIA_BASE` | Public library root in prod (e.g. `https://…/library`). Dev default: `/library` |

Set these when invoking the website deploy scripts (see [`../docs/publish.md`](../docs/publish.md)). Media and tag-detail URL helpers live in `src/lib/mediaUrl.ts`.

---

## Routes

| Path | View |
| --- | --- |
| `/` | Browse + search |
| `/tag/:id` | Tag (sheets, tracks, Sing mode, share) |
| `/favorites`, `/recent`, `/queue` | Favorites, Recent, Export queue |
| `/pitch-pipe` | Chromatic pitch pipe / pay-the-key |
| `/settings` | Prefs, offline packs, backup |
| `/labs` | Feature flags / experimental entry |
| `/labs/pitch-pipe-sound` | Pitch pipe voice lab |
| `/library`, `/library/:id` | Local Library (Labs flag) |
| `/tx`, `/rx` | Optical transfer send / receive |

---

## Source layout

Boundaries match [`../docs/architecture.md`](../docs/architecture.md): keep DSP out of views, Pinia out of `audio/` / `download/`, and search pure.

| Path | Role |
| --- | --- |
| `src/views/` | Route composition |
| `src/components/` | Sheets, players, filters, scrub rail, share/transfer UI |
| `src/stores/` | Catalog, prefs, favorites, queue, local library, … |
| `src/search/` | Query DSL + search engine (no fetch / no Vue) |
| `src/audio/` | Web Audio playback, bake-first pitch/speed, pitch pipe voice, Opus WASM |
| `src/offline/` | Device packs, media resolve, IndexedDB |
| `src/download/` | Transform, encode, zip |
| `src/composables/` | Tag detail load, online, object URLs |
| `src/lib/` | Media URLs, scrub, optical/Decimen helpers, backup |
| `src/router/` | Routes + browse scroll restore |
| `public/indexes/` | `core.json.gz`, `lyrics.json.gz` (from `build/`) |
| `public/tags/` | Slim per-tag `metadata.json` for detail hydrate |

---

## Product surfaces (in this package)

- **Browse** — title DSL, chips, lyrics FTS, year bins, density scrub, window virtualization
- **Tag / Sing** — WebP sheets, learning tracks, bake-first pitch & speed, fullscreen Sing mode
- **Pitch pipe** — E3–E4 (and layouts); optional custom voice from Labs
- **Offline** — favorites + songbook/audio packs; 64 kbps Opus online (WASM decode when needed)
- **Local Library + optical transfer** — on-device charts; QR transfer under Labs flags
- **PWA** — installable shell; waiting service workers apply silently when the session is idle (not playing / not fullscreen)

Practice mode is compiled off (`PRACTICE_MODE_ENABLED` in `src/lib/practiceMode.ts`).

---

## Testing notes

- Unit / store / composable / light component tests via Vitest (`happy-dom` / `jsdom`, `fake-indexeddb`)
- Coverage thresholds are enforced in the Vitest config
- Prefer pure tests under `search/`, `audio/`, `download/` without mounting the whole app

---

## Further reading

- [Architecture](../docs/architecture.md)
- [Audio tiers](../docs/decisions/audio-storage-cache.md)
- [Pitch / speed bake](../docs/decisions/pitch-speed-bake.md)
- [Pitch pipe voice](../docs/decisions/pitch-pipe-voice.md)
- [Offline library](../docs/decisions/offline-library.md)
- [Publish](../docs/publish.md)
