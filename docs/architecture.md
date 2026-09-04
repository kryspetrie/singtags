# SingTags architecture notes

Static Vue 3 SPA. Catalog/search/media are published objects; the browser owns search, playback, and zip.

**Live host:** Cloudflare (DNS/SSL) → public S3 website origin. Canonical URL `https://www.singtags.com`.

## Boundaries

| Layer | Responsibility | Must not |
| --- | --- | --- |
| `sync/` / `build/` / `deploy/` | Library mirror, SPA indexes, S3 publish | Scrape origin; touch Vue |
| `web/src/stores/` | Catalog filters + queue state, URL sync | Decode audio; own DOM |
| `web/src/search/` | Pure DSL + engine + chip filter merge | Fetch; Vue |
| `web/src/composables/` | Online, object URLs, tag detail load | Pinia stores |
| `web/src/audio/` | Web Audio player, pitch pipe voices, bake-first pitch/speed, Opus WASM decode | UI strings; Pinia |
| `web/src/download/` | Fetch bytes, transform, encode, zip | Pinia; Vue components |
| `web/src/components/` | Presentational UI (chips, player, sheets) | Publish paths; S3 |
| `web/src/views/` | Route composition | Heavy DSP |
| `web/src/lib/mediaUrl` | Single media / tag detail base URL | — |

## Performance practices in use

1. **Lazy heavy deps** — pitch/speed DSP (`@audio/stretch-wsola`, `@audio/shift-formant`) via worker; `wasm-media-encoders` / Mediabunny AAC via dynamic `import()` only when encode is needed; never on first paint.
2. **Small eager shell** — Vue/router/pinia + app; production main JS aims well under 200 KB gzip (Opus WASM decoder is deferred and excluded from Workbox precache where oversized).
3. **Gzip indexes once** — `core.json.gz` / `lyrics.json.gz`; client builds inverted title/field/lyric postings in memory. Catalog refresh **reattaches** lyrics onto a rebuilt engine so FTS keeps working.
4. **Debounced search** — 320ms dwell on free text; filter chips apply immediately and share URL state with the DSL.
5. **Pre-rasterized sheets** — WebP at publish time; no pdf.js on primary view; **not DjVu** ([decisions/sheets-format.md](decisions/sheets-format.md)).
6. **Self-contained deploy** — fonts via `@fontsource`, DSP + encoder WASM as Vite assets (no CDN).
7. **Favorites offline** — IndexedDB for favorites + audio; sheets prefer the offline library pack. Bulk packs via Settings → Offline ([decisions/offline-library.md](decisions/offline-library.md)). Audio bytes follow tiered publish + lazy cache ([decisions/audio-storage-cache.md](decisions/audio-storage-cache.md)): online playback @ 64 kbps Opus (WASM fallback when native decode fails), download → Original + cache upgrade, ultra-low mono solos for offline reconstruction.
8. **PWA** — `vite-plugin-pwa` precaches the app shell; indexes SWR; tag metadata CacheFirst; media packs via Cache API. Update toast always hard-reloads after activating the waiting SW.
9. **Browse virtualization** — `@tanstack/vue-virtual` window virtualizer over the full filtered result set (not paged “Load more”).
10. **Pitch/speed** — decode once → bake non-identity transforms in a worker (WSOLA + formant) → play `AudioBufferSourceNode` at rate 1; live balance/solo gains. See [pitch-speed-bake](decisions/pitch-speed-bake.md).
11. **Pitch pipe voice** — configurable oscillator blend (`singtags.pitchPipeVoice.v1`); Labs lab + optional user default ([pitch-pipe-voice](decisions/pitch-pipe-voice.md)).
12. **Tag return scroll** — capture list scroll + opened tag id; restore via virtualizer pin (Sing ✕ arms scroll before query teardown).

## Testing pyramid

- Unit: normalize, query DSL, chip filters, expansions, transform/encode/zip helpers, pitch mapping, media URLs, channel solo, pitch-pipe voice parse/active library
- Stores: catalog (incl. lyrics reattach), favorites, queue, practice, recent (IndexedDB via fake-indexeddb)
- Composables: `useOnline`, `useObjectUrls`, `useTagDetail`
- Component/view smoke: SearchChips, SheetViewer, FilterSheet, TagPlayer, App, Home/Tag/Favorites/Queue/PitchPipe/Labs
- Perf: synthetic ~7k-tag title search + FTS inverted-index budget tests
- Manual: Lighthouse for Home + Tag; device check Safari Opus WASM path

Coverage gate (vitest thresholds): ≥55% statements/lines, ≥45% branches/functions.

## Decisions

See [decisions/](decisions/README.md) for accepted ADRs.

## Risks / follow-ups

- **Search by Vibe** (planned): Cloudflare Worker + offline embeddings — [vibe-search](plans/vibe-search.md)
- Full media sync remains an ops workflow ([publish.md](publish.md))
- `MediaElementSource` is one-shot per element; player dispose/recreate is required after graph teardown
- Transformed / quality MP4 downloads re-encode stereo AAC on device (Mediabunny); WAV only if AAC encode fails
- PWA: uncached learning-track media still needs network unless the tag was favorited with media or packs are installed
