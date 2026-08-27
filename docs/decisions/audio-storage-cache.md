# ADR: Tiered audio — S3 publish + lazy client cache

**Status:** Accepted — **implemented** (client resolver + lazy fetch + published tiers)  
**Date:** 2026-08-25  
**Context:** Full-quality MP3/AAC learning tracks (~5.5 GB library) dominate egress and offline size. Opus tiers and mono-solo reconstruction reduce bandwidth while preserving original downloads.

Related: [TIERED_AUDIO_FOLLOWUP.md](../TIERED_AUDIO_FOLLOWUP.md), [offline-library.md](decisions/offline-library.md), [ARCHITECTURE.md](../ARCHITECTURE.md), mirror repo `Barbershop/tags/docs/AUDIO_STORAGE_AND_CACHE.md`.

---

## Decision

### S3 hosts four logical tiers per part

| Tier | Bitrate | Role |
| --- | --- | --- |
| **Original** | Source (~128 kbps AAC/MP3) | User **download** only (+ cache upgrade) |
| **Playback** | **64 kbps Opus** | Default **online** in-tag playback |
| **Ultra solo** | **16 kbps Opus mono** (solo channel) | Offline pack; reconstruct part-left stereo |
| **Ultra mix** | **32 kbps Opus stereo** | Mix-only tags (no voice parts) |

Publish encoding rules and layout classification live in the mirror repo (`audio_layout_summary.ultra_low`: `mono_solos` | `mono_downmix` | `stereo_fallback`). For `mono_solos`, the mirror also estimates accompaniment-channel timing vs Lead and **bakes trusted offsets ≥50 ms into Opus Solo/Playback files** so client reconstruction can assume a shared t=0.

### Online tag page

1. **Play** uses **Playback (64 kbps)** unless **Original** is already in device cache.
2. **Download** always fetches **Original**, saves it for the user, and **upgrades cache** for that part to Original.
3. **Original-quality playback** only when Original is cached — never auto-fetch Original on play.
4. **No tag-wide prefetch** — fetch a part on **first playback** of that part only.
5. When the user returns online to a tag, use upgraded Original parts where present; still fetch 64 kbps for parts not yet upgraded.

### Custom combine track

Fetch **only the parts currently selected** for combine. Do not download all voice tracks when opening Custom.

Online combine continues to use `buildSoloMixObjectUrl` (solo channel extract + user pan). Offline ultra-low uses the fixed barbershop mix weights (below).

### Offline ultra-low cache

Pack contents:

- **`mono_solos` tags:** 16 kbps mono solo per voice part (not full stereo parts).
- **Mix-only tags:** single 32 kbps stereo mix file.
- **Reconstruct** part-left stereo and standard mix in-browser from mono solos:

| Part | Pan |
| --- | --- |
| Tenor | 50% L |
| Lead | 25% L |
| Bass | 25% R |
| Bari | 50% R |

**Partial upgrade:** If some parts are cached as Original after download, **keep ultra-low solo blobs** for parts not yet upgraded so reconstruction still works offline.

### Per-part cache quality ladder

```
none → ultra_low → playback → original
```

Playback resolution (`resolveMedia` extension):

1. Original blob (star / pack / IndexedDB) if present  
2. Else online: fetch Playback tier  
3. Else offline: reconstruct from ultra_low mono solos (or ultra_mix for mix-only)

---

## Relationship to existing offline tiers

[offline-library.md](offline-library.md) Tier 3–4 and starred audio remain valid for **which tags** are cached. This ADR defines **which bytes** are stored per part:

| Old mental model | New model |
| --- | --- |
| Re-encode hosted MP4 on device (Standard/Compact/Lo-fi) | Prefer **pre-published Opus tiers** from S3 |
| Starred “Original” keeps hosted file | Star/download stores **Original** tier |
| Full audio pack = all hosted MP4s | Full audio pack = ultra-low solos + optional playback; originals only when user downloaded |

On-device re-encode (`compactAudio.ts`) may remain as fallback for legacy sample-data without tier URLs until publish pipeline ships.

---

## Storage / egress (mirror estimates)

| | Size | Egress (full library once) |
| --- | --- | --- |
| Originals only | ~5.5 GB | ~$0.50 |
| Playback @ 64k all parts | ~2.5 GB | ~$0.22 |
| Ultra-low pack | ~0.8 GB | ~$0.07 |

Extra S3 storage for Playback + Ultra vs Original-only: **~$0.08/mo** — negligible vs egress savings when users play rather than download everything.

---

## Code map (implementation targets)

| Area | Path | Change |
| --- | --- | --- |
| Tier URLs | `lib/mediaUrl.ts`, `types/tag.ts` | Part paths per tier |
| Playback default | `composables/useTagDetail`, `audio/player.ts` | 64k when online, no original |
| Download upgrade | `components/TagDownloads.vue`, `download/` | Original fetch + cache write |
| Lazy fetch | `TagPlayer.vue`, `resolveMedia.ts` | Per-part on first play |
| Custom combine | `TagPlayer.vue`, `multiPartMix.ts` | Selected parts only |
| Ultra-low pack | `offline/libraryPack.ts`, `build_offline_manifest.py` | Mono solos + mix formula |
| Reconstruction | new `audio/partLeftReconstruct.ts` (TBD) | Pan matrix from mono solos |
| Layout gating | `lib/audioLayout.ts` | `ultra_low`, mix-only detection |

---

## Manual test checklist (when implemented)

1. Online: play Lead — only Lead playback URL fetched; Bass not fetched until played.
2. Online: download Lead — Original saved; replay Lead uses Original; Bass still 64k.
3. Offline pack: tag with `mono_solos` — only mono solos + no stereo parts; part-left reconstruct sounds correct.
4. Mix-only tag — single 32k stereo; no solo stubs.
5. Custom: select Lead + Bari — only those two fetched; combine works.
6. Partial upgrade: download Lead only; offline custom still rebuilds Bass/Tenor/Bari from ultra solos.
7. Explicit download always Original file extension/quality, not 64k Opus.

---

## Out of scope (v1)

- Pre-fetch entire tag on page load
- Automatic Original fetch on play
- Server-side on-the-fly transcoding (all tiers pre-published)
- Replacing sheet offline tiers (unchanged)
