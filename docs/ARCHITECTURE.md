# SingTags architecture notes

Static Vue 3 SPA. Catalog/search/media are published objects; the browser owns search, playback, and zip.

## Boundaries

| Layer | Responsibility | Must not |
| --- | --- | --- |
| `scripts/` | Seed, remux, rasterize, indexes, S3 sync | Scrape origin; touch Vue |
| `stores/` | Catalog filters + queue state, URL sync | Decode audio; own DOM |
| `search/` | Pure DSL + engine + chip filter merge | Fetch; Vue |
| `composables/` | Online, object URLs, tag detail load | Pinia stores |
| `audio/` | Web Audio player, pitch pipe, bake-first pitch/speed | UI strings; Pinia |
| `download/` | Fetch bytes, transform, encode, zip | Pinia; Vue components |
| `components/` | Presentational UI (chips, player, sheets) | Publish paths; S3 |
| `views/` | Route composition | Heavy DSP |
| `lib/mediaUrl` | Single media / tag detail base URL | — |

## Performance practices in use

1. **Lazy heavy deps** — pitch/speed DSP (`@audio/stretch-wsola`, `@audio/shift-formant`) via worker; `wasm-media-encoders` (MP3/Vorbis) and Mediabunny AAC via dynamic `import()` only when encode is needed; never on first paint.
2. **Small eager shell** — Vue/router/pinia + app; production main JS aims well under 200 KB gzip.
3. **Gzip indexes once** — `core.json.gz` / `lyrics.json.gz`; client builds inverted title/field/lyric postings in memory (prefer RAM over re-scan / re-download).
4. **Debounced search** — 320ms dwell on free text; filter chips apply immediately and share URL state with the DSL.
5. **Pre-rasterized sheets** — WebP at publish time; no pdf.js on primary view; **not DjVu** ([decisions/sheets-format.md](decisions/sheets-format.md)).
6. **Self-contained deploy** — fonts via `@fontsource`, DSP + encoder WASM as Vite assets (no CDN).
7. **Starred offline** — IndexedDB for favorites + audio; sheets prefer the offline library pack. Bulk packs via Settings → Offline ([decisions/offline-library.md](decisions/offline-library.md)). Audio bytes follow tiered publish + lazy cache ([decisions/audio-storage-cache.md](decisions/audio-storage-cache.md)): online playback @ 64 kbps Opus, download → Original + cache upgrade, ultra-low mono solos for offline reconstruction.
8. **PWA** — `vite-plugin-pwa` precaches the app shell; indexes SWR; tag metadata CacheFirst; media packs via Cache API (not SW precache on install).
9. **Result windowing** — browse shows pages of 40 matches with “Load more” for large result sets.
10. **Pitch/speed** — decode once → bake non-identity transforms in a worker (WSOLA + formant) → play `AudioBufferSourceNode` at rate 1; live balance/solo gains. See [PITCH_SPEED_PLAN.md](PITCH_SPEED_PLAN.md).

## Testing pyramid

- Unit: normalize, query DSL, chip filters, expansions, transform/encode/zip helpers, pitch mapping, media URLs, channel solo
- Stores: catalog, stars, queue, practice, recent (IndexedDB via fake-indexeddb)
- Composables: `useOnline`, `useObjectUrls`, `useTagDetail`
- Component/view smoke: SearchChips, SheetViewer, FilterSheet, TagPlayer, App, Home/Tag/Starred/Queue/PitchPipe
- Perf: synthetic 7k-tag title search + FTS inverted-index budget tests
- Manual: Storybook (`SingTags/*`); Lighthouse script for Home + Tag

Coverage gate (vitest thresholds): ≥55% statements/lines, ≥45% branches/functions. Current suite targets ~70%+ statements on testable modules; remaining gaps are mostly Web Audio graph wiring and deep view interaction paths.

## Decisions

See [decisions/](decisions/README.md) for accepted ADRs (sheet format, offline library tiers).

## Risks / follow-ups

- **Search by Vibe** (planned): Cloudflare Worker + offline embeddings — see `docs/VIBE_SEARCH.md`
- **Offline library**: tiers 1–4 shipped — see `docs/decisions/offline-library.md`
- **Audio tiers**: S3 Original + 64k playback + 16k mono solos — see `docs/decisions/audio-storage-cache.md`
- Full ~7.1k media publish still ops work (`docs/PUBLISH.md`); sample is 250 tags
- `MediaElementSource` is one-shot per element; player dispose/recreate is required after graph teardown
- Transformed / quality MP4 downloads re-encode stereo AAC on device (Mediabunny); WAV only if AAC encode fails
- PWA: uncached learning-track media still needs network unless the tag was starred with media