# ADR: Tiered audio — S3 publish + lazy client cache

**Status:** Accepted — **implemented** (client resolver + lazy fetch + published Opus tiers)  
**Date:** 2026-08-25 (doc refresh 2026-09-03)  
**Context:** Full-quality MP3/AAC learning tracks (~5.5 GB library) dominate egress and offline size. Opus tiers and mono-solo reconstruction reduce bandwidth while preserving original downloads.

**Encoder / layout detail (SSOT for bitrates & bake):** [`../../sync/docs/AUDIO_STORAGE_AND_CACHE.md`](../../sync/docs/AUDIO_STORAGE_AND_CACHE.md).  
Related: [offline-library.md](offline-library.md), [architecture.md](../architecture.md), [non-recombinable-tracks](../plans/non-recombinable-tracks.md).

---

## Decision (client)

### Logical tiers per part

| Tier | Bitrate | Role |
| --- | --- | --- |
| **Original** | Source (~128 kbps AAC/MP3) | User **download** only (+ cache upgrade) |
| **Playback** | **64 kbps Opus** | Default **online** in-tag playback |
| **Ultra solo** | **16 kbps Opus mono** | Offline pack; reconstruct part-left stereo |
| **Ultra mix / stereo** | **32 kbps Opus** | Mix-only or `stereo_fallback` / non-recombinable |

Encoding and `audio_layout_summary` live under `sync/` (`sync/lib/audio_layout.py`, `audio_align.py`, `audio_tiers.py`). For `mono_solos`, trusted ≥50 ms offsets are baked into Opus Solo/Playback files. When `parts_recombinable: false`, publish uses `stereo_fallback` — see [non-recombinable-tracks](../plans/non-recombinable-tracks.md).

### Online tag page

1. **Play** uses Playback (64 kbps) unless Original is already in device cache.
2. **Download** always fetches Original and upgrades cache for that part.
3. No automatic Original fetch on play; no tag-wide prefetch — first play of a part only.
4. Decode prefers native Opus; otherwise deferred **WASM Ogg Opus** (`web/src/audio/opusWasmDecode.ts`).

### Custom combine

Fetch only selected parts. Online: solo-channel extract + pan. Offline ultra-low: fixed barbershop mix weights (below). Non-recombinable tags: no solo reconstruct (disable Custom / use hosted stems per client rules).

### Offline ultra-low

- `mono_solos`: 16 kbps mono solos; reconstruct part-left (Tenor 50% L, Lead 25% L, Bass 25% R, Bari 50% R).
- Mix-only / hosted mix: 32 kbps stereo.
- Partial Original upgrade: keep ultra-low solos for parts not yet upgraded.

### Cache ladder

```
none → ultra_low → playback → original
```

Resolve (`web/src/offline/resolveMedia.ts`): Original blob → Playback blob → online Playback fetch → offline ultra reconstruct.

---

## Relationship to offline tiers

[offline-library.md](offline-library.md) decides **which tags** are cached. This ADR decides **which bytes** per part. Prefer pre-published Opus over on-device re-encode; `compactAudio.ts` remains a fallback when tier URLs are missing.

---

## Code map

| Area | Path |
| --- | --- |
| Tier URLs / helpers | `web/src/lib/mediaUrl.ts`, `web/src/lib/audioTiers.ts`, `web/src/lib/audioLayout.ts` |
| Playback default | `web/src/composables/useTagDetail.ts`, `web/src/audio/` |
| Download upgrade | `web/src/components/TagDownloads.vue`, `web/src/download/` |
| Lazy resolve | `web/src/offline/resolveMedia.ts`, `TagPlayer.vue` |
| Ultra pack | `web/src/offline/libraryPack.ts`, `build/build_offline_manifest.py` |
| Reconstruction | `web/src/audio/partLeftReconstruct.ts` |
| Encode (mirror) | `sync/lib/audio_tiers.py`, `sync/audio/encode_audio_tiers.py` |

---

## Manual checks

1. Online: play Lead — only Lead playback fetched.
2. Download Lead — Original saved; other parts still 64k until played.
3. Offline `mono_solos` pack — solos only; part-left reconstruct OK.
4. Mix-only / non-recombinable — hosted ultra stereo/mix; no false solo rebuild.
5. Custom: selected parts only.
6. Safari without native Opus — WASM path plays.

---

## Out of scope

- Prefetch entire tag on load; automatic Original on play; server-side live transcoding
