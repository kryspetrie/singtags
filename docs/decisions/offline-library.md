# ADR: Offline library — tiered device cache (not “DjVu for size”)

**Status:** Accepted — **implemented** (tiers 1–4 in app; full-library audio is opt-in)  
**Date:** 2026-08-23 (updated 2026-09-03)  
**Context:** Desire to cache **all or as many tags as possible** on device. Question of whether DjVu would unlock that.

Related: [sheets-format.md](sheets-format.md), [audio-storage-cache.md](audio-storage-cache.md) (which audio bytes per part), Settings → Offline (`/settings`).

---

## Decision

1. **Do not** switch sheet format to DjVu to enable full-library offline ([sheets-format.md](sheets-format.md)).
2. Treat offline as **explicit tiers** with storage estimates before download.
3. Cache **display WebP** for sheets (same bytes as the viewer), not PDF/DjVu.
4. Keep **Favorites/Starred** as the rehearsal-set path; **Offline** settings for bulk catalog/sheets/(optional) audio.
5. Prefer **Cache API** (OPFS fallback) for large packs; IndexedDB for starred metadata + audio blobs.

---

## Storage math (why tiers)

Extrapolated from an early ~250-tag sample to ~7.1k tags (order-of-magnitude):

| Tier | Contents | Rough size | Feasible on |
| --- | --- | --- | --- |
| **1 — Catalog** | Indexes + tag metadata | ~15 MB | Phones, always |
| **2 — All sheets** | WebP `sheet_pages` + metadata JSON | ~300 MB | Many phones / tablets |
| **3 — Starred audio** | User-selected tags’ learning tracks (Opus tiers / Original per prefs) | Variable | Current favorites flow |
| **4 — Full audio** | Ultra-low pack across the library | Large (GB) | Desktop / explicit opt-in |

**Bottleneck = audio**, not sheets. Exact ultra/playback sizes: [audio-storage-cache.md](audio-storage-cache.md).

---

## Implemented behavior

| Mechanism | What it caches |
| --- | --- |
| PWA (`vite-plugin-pwa`) | App shell; indexes SWR; tag `metadata.json` CacheFirst |
| Offline sheet pack | Cache API `singtags-sheets-v1` (+ OPFS fallback) |
| Offline audio pack | Cache API `singtags-audio-v1` |
| Starred + offline media | IndexedDB — prefer audio; skip sheet blobs when pack has them |
| Manifests | `indexes/offline-sheets.json.gz`, `offline-audio.json.gz` from `build/build_offline_manifest.py` |
| UI | `/settings`, first-run sheets toast, Home offline status |

**Resolve order** (`web/src/offline/resolveMedia.ts`): starred blob → pack → network.

### Offline feature matrix

| Feature | Offline after Tier 1 | + Tier 2 | + Tier 3 stars | + Tier 4 |
| --- | --- | --- | --- | --- |
| Install / open app | Yes | Yes | Yes | Yes |
| Browse / search / filters | Yes | Yes | Yes | Yes |
| Open any tag (metadata + WebP) | No* | **Yes** | Yes | Yes |
| Play audio | No | No | **Starred** | **All** (pack) |
| Pitch pipe | Yes | Yes | Yes | Yes |
| PDF sheet mode | No | No | No | No |
| Zip download queue | Queue yes* | Queue yes* | Queue yes* | Queue yes* |

\*Zip export still needs network for original files. Tag metadata may open from Workbox CacheFirst without Tier 2; otherwise catalog summary + Retry.

---

## Audio bytes per tier (current)

| Use | Tier | Notes |
| --- | --- | --- |
| Online play (Opus-capable) | 64 kbps Opus | Lazy fetch on first play per part |
| Online play (Safari / no native Opus) | **Opus** + WASM / session WAV | Original only if WASM failed to load |
| User download | Original | Upgrades device cache to Original |
| Offline pack | 16 kbps mono solos + mix formula (or ultra stereo / mix for demoted tags) | **Opus as published**; Safari plays via **WASM** + optional session Opus→WAV |
| Favorites / starred | Published Opus as-is (or on-device encode **to** Opus when tiers missing) | Same Safari path |
| Original playback offline | Original in cache only | After download or prior fetch |

Full client/encoder rules: [audio-storage-cache.md](audio-storage-cache.md).

### On-device compression (legacy fallback)

When metadata has **no** `audio_tiers`, starring may still re-encode hosted originals **to Opus** on device for size. When publish tiers exist (current catalog), the client stores published Opus paths as-is (`compactAudio.ts`) — it does **not** convert Opus → AAC for Safari storage. Offline Safari therefore relies on `opusWasmDecode` / `decodeLock` / session `opusPlayable` Opus→WAV for pack and favorites Opus blobs — **WebAssembly is supported in Safari**; Original downloads are not required for offline play.

**Cull quality upgrades** (Settings → Advanced → Storage): clears PDF rasters and warmed HQ blobs while keeping WebP + ultra packs (`cacheManage.ts`).

---

## Code map

| Path | Role |
| --- | --- |
| `web/src/offline/libraryPack.ts` | Cache/OPFS pack store |
| `web/src/offline/downloadQueue.ts` | Concurrent pause/resume downloader |
| `web/src/offline/resolveMedia.ts` | Star → pack → network |
| `web/src/stores/offlineLibrary.ts` | Pinia status + actions |
| `web/src/views/SettingsView.vue` | Offline controls |
| `build/build_offline_manifest.py` | Sheet + audio manifests |
