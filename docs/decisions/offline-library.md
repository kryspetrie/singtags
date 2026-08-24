# ADR: Offline library — tiered device cache (not “DjVu for size”)

**Status:** Accepted — **implemented** (tiers 1–4 in app; full-library audio is opt-in)  
**Date:** 2026-08-23 (updated 2026-08-23)  
**Context:** Desire to cache **all or as many tags as possible** on device. Question of whether DjVu would unlock that.

Related: [sheets-format.md](sheets-format.md) (display format), Starred IndexedDB, Settings → Offline (`/settings`).

---

## Decision

1. **Do not** switch sheet format to DjVu to enable full-library offline. Format choice does not fix the size problem ([sheets-format.md](sheets-format.md)).
2. Treat offline as **explicit tiers** with storage estimates before download.
3. Cache **display WebP** for sheets (same bytes as the viewer), not PDF/DjVu, for offline viewing.
4. Keep **Starred** as the “my rehearsal set” path; **Offline** settings for bulk catalog/sheets/(optional) audio.
5. Prefer **Cache API** (with OPFS fallback) for large packs; keep IndexedDB for starred metadata + audio blobs.

---

## Storage math (why tiers)

Extrapolated from the ~250-tag sample (~399 MB total, ~356 MB audio, ~11 MB WebP pages) to ~7.1k tags:

| Tier | Contents | Rough size | Feasible on |
| --- | --- | --- | --- |
| **1 — Catalog** | Indexes + tag metadata | ~15 MB | Phones, always |
| **2 — All sheets** | WebP `sheet_pages` + metadata JSON | ~300 MB | Many phones / tablets |
| **3 — Starred audio** | User-selected tags’ MP4s | Variable | Current starred flow |
| **4 — Full audio** | All learning tracks | **~10 GB** | Desktop / explicit opt-in only |

**Bottleneck = audio**, not sheets.

---

## Implemented behavior

| Mechanism | What it caches |
| --- | --- |
| PWA (`vite-plugin-pwa`) | App shell; indexes SWR; tag `metadata.json` CacheFirst |
| Offline sheet pack | Cache API `singtags-sheets-v1` (+ OPFS fallback) |
| Offline audio pack | Cache API `singtags-audio-v1` |
| Starred + offline media | IndexedDB `starred` — prefer audio; skip sheet blobs when pack has them |
| Manifests | `indexes/offline-sheets.json.gz`, `offline-audio.json.gz` from `scripts/build_offline_manifest.py` |
| UI | `/settings`, first-run sheets toast, Home offline status |

**Resolve order** (`web/src/offline/resolveMedia.ts`): starred blob → pack → network.

### Offline feature matrix

| Feature | Offline after Tier 1 | + Tier 2 | + Tier 3 stars | + Tier 4 |
| --- | --- | --- | --- | --- |
| Install / open app | Yes | Yes | Yes | Yes |
| Browse / search / filters | Yes | Yes | Yes | Yes |
| Open any tag (metadata + WebP) | No* | **Yes** | Yes | Yes |
| Play audio | No | No | **Starred** | **All** |
| Pitch pipe / practice set order | Yes | Yes | Yes | Yes |
| PDF sheet mode | No | No | No | No |
| Zip download queue | No | No | No | No |

\*Tag metadata may open if previously fetched (Workbox CacheFirst) even without Tier 2 pack. If metadata isn’t cached, the tag page still shows **catalog summary from memory** (title, id, arranger, …) with Retry + auto-reload when back online. Starred tags missing audio and **paused** sheet/audio packs also resume caching automatically on reconnect.

---

## Manual / device test checklist

1. Production build: `cd web && npm run build && npm run preview`
2. Load once online; confirm catalog browse works.
3. Offline settings → **Download all sheets**; pause/resume; complete.
4. Airplane mode: open several unstarred tags — WebP sheets render; no audio until starred.
5. Online: star a tag → audio caches; skip duplicate sheets when pack present.
6. Airplane mode: starred tag plays audio + shows sheets.
7. Optional: start Tier 4 audio download; confirm quota warning if space low; pause/clear.
8. Clear sheet pack; confirm limited offline state messaging.
9. iOS Safari + Android Chrome: `persist()` and estimate display.

---

## On-device audio compression (implemented)

Users can choose how audio is stored when **starring**, when downloading the **zip queue**, and when filling the **offline audio pack**:

| Setting | Behavior | Typical size vs original |
| --- | --- | --- |
| **Original** | Keep hosted MP4 AAC bytes (~128 kbps stereo) | 100% |
| **Standard** | Re-encode to **stereo** AAC MP4 (~96 kbps) | ~70–80% |
| **Compact** | Re-encode to **stereo** AAC MP4 (~64 kbps) | ~45–55% |
| **Lo-fi** | Re-encode to **stereo** AAC MP4 (~32 kbps) | ~25–35% |

Implementation: decode with Web Audio → Mediabunny AAC (WebCodecs, with WASM AAC fallback) → MP4. Preference lives in `localStorage` via `usePreferencesStore` and appears on **Offline** settings and the **Downloads** queue.

Zip queue: Format chooses container (`mp4` / `mp3` / `ogg`). Quality applies to all formats — for MP4, **Original** keeps the hosted file; Standard/Compact re-encode stereo AAC. MP3/OGG always re-encode (stereo). **Never mono.**


---

## Code map

| Path | Role |
| --- | --- |
| `web/src/offline/libraryPack.ts` | Cache/OPFS pack store |
| `web/src/offline/downloadQueue.ts` | Concurrent pause/resume downloader |
| `web/src/offline/resolveMedia.ts` | Star → pack → network |
| `web/src/stores/offlineLibrary.ts` | Pinia status + actions |
| `web/src/views/SettingsView.vue` | Offline controls |
| `scripts/build_offline_manifest.py` | Sheet + audio manifests |
