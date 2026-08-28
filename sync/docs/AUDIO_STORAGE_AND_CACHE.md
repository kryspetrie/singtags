# Audio storage, publish tiers, and client cache

**Status:** Accepted plan (publish + client behavior to implement)  
**Date:** 2026-08-25  
**Related:** [`lib/config.py`](../lib/config.py) (bitrate constants), [`lib/audio_layout.py`](../lib/audio_layout.py) (`audio_layout_summary`), SingTags ADR `barbershop-website/docs/decisions/audio-storage-cache.md`

---

## Summary

Host **three publish tiers** on S3 (plus originals). The browser **never** streams full-quality files for routine playback. Originals are fetched only for explicit download or when upgrading a per-track device cache. Offline packs use **mono solo** assets to reconstruct part-left learning tracks in the browser; mix-only tags use a single low-bitrate stereo mix.

Egress dominates cost; extra S3 storage for Opus tiers is negligible (~$0.06/mo for the full library at current scale).

---

## S3 publish tiers

Each learning part (Lead, Tenor, Bari, Bass, Mix) may exist independently per tag. Publish paths are TBD; logical tiers:

| Tier | ID | Encoding | Typical use |
| --- | --- | --- | --- |
| **Original** | `original` | Source MP3/AAC as mirrored from barbershoptags.com | User download; cache upgrade |
| **Playback** | `playback` | **64 kbps Opus** (mono or stereo per source) | Default **online** in-tag playback |
| **Ultra-low solo** | `ultra_solo` | **16 kbps Opus mono** — solo channel only | Offline cache + part-left reconstruction |
| **Ultra-low mix** | `ultra_mix` | **32 kbps Opus stereo** | Tags that have **Mix only** (no voice parts) |

Constants in `lib/config.py`:

```python
AUDIO_ULTRA_LOW_MONO_KBPS = 16      # mono solo channel
AUDIO_STEREO_GOOD_KBPS = 32           # mix-only / stereo fallback
AUDIO_STEREO_PREFERRED_KBPS = 48      # optional higher stereo tier (not in v1 cache plan)
AUDIO_PLAYBACK_KBPS = 64              # online playback tier (to add)
```

### Which ultra-low assets to publish

Use `metadata.json` → `audio_layout_summary.ultra_low`:

| `ultra_low` | Publish for offline |
| --- | --- |
| `mono_solos` | 16 kbps **mono solo** per voice part (extract solo channel from part-left/right stereo) |
| `mono_downmix` | No per-part solos; optional downmixed mono per part or stereo fallback |
| `stereo_fallback` | 32 kbps stereo per needed part, or mix-only rule below |

**Mix-only tags** (no Lead/Tenor/Bari/Bass files): publish one **32 kbps stereo** `ultra_mix` only — do not generate four solo stubs.

**Mix disjoint from voice parts** (`audio_layout_summary.mix_disjoint: true`): some tags ship a mix track that is **not** the sum of the learning parts (different recording, wrong files, etc.). When mono downmix cross-correlation between mix and all voice parts is below **0.25**, publish **32 kbps `ultra_mix`** for the mix and include it in the offline pack instead of reconstructing mix from mono solos.

**Parts not recombinable** (`audio_layout_summary.parts_recombinable: false`): voice stems are not safe to mono-solo extract or client-reconstruct (untrusted accompaniment alignment, piano/full-stereo files, etc.). Force `ultra_low: stereo_fallback`, publish **32 kbps `ultra_stereo`** per voice part (+ hosted `ultra_mix` when a mix file exists). See SingTags `docs/NON_RECOMBINABLE_TRACKS_PLAN.md`.

`audio_align_summary.status`:
- `ok` — enough non-Lead voices trusted
- `skewed` — trusted with baked ≥50 ms offsets
- `untrusted` — fewer than 2 non-Lead voices trusted (when ≥2 non-Lead files exist)
- `skipped` — not applicable

### Storage math (full ~7.1k library, approximate)

| Contents | Size | S3 ~$/mo |
| --- | --- | --- |
| Originals (mix + parts) | ~5.5 GB | ~$0.13 |
| Playback @ 64 kbps (all parts) | ~2.5 GB | ~$0.06 |
| Ultra-low solos @ 16 kbps + mix-only @ 32 kbps | ~0.8 GB | ~$0.02 |
| **Total** | **~8.8 GB** | **~$0.21** |

First full-library egress: originals ~$0.50 vs playback-only ~$0.22 — another reason to default playback to 64 kbps.

---

## Client behavior (SingTags PWA)

### 1. Online tag page — playback vs download

| Action | Source tier | Side effects |
| --- | --- | --- |
| **Play** (single part, mix, or custom) | **Playback (64 kbps Opus)** from network, or **Original** if already in device cache | On first play of a part: fetch playback tier only; **do not** prefetch other parts |
| **Download** (per-part or tag zip) | **Original** | Save original bytes to the user; **upgrade device cache** for that part to Original (playback no longer needed for that part) |

**Original-quality playback** is only available when Original is already in the device cache (after download or a prior online session that fetched Original for that part). There is no automatic Original fetch on play.

### 2. Lazy per-track fetch (no tag-wide prefetch)

When the user opens a tag online, **do not** download all parts. Fetch audio **on first playback** of each part only. Visiting a tag again may upgrade cached parts if Original was obtained earlier (download or explicit upgrade path).

### 3. Custom (multi-part combine) track

Only fetch the **selected** voice parts required for the current combine selection. Do not download unselected parts. Combine uses cached or network-resolved URLs per selected part (see SingTags `buildSoloMixObjectUrl` for online custom pan; offline reconstruction uses the mix formula below).

### 4. Offline / ultra-low device cache

**Goal:** smallest pack that still supports part-left learning tracks and a standard barbershop mix.

**Store:**

- **16 kbps mono solo** files for each voice part needed (`ultra_low: mono_solos`), **or**
- **32 kbps stereo mix** when the tag is mix-only.

**Do not** store full stereo voice tracks in the ultra-low pack when `mono_solos` applies.

**Reconstruct part-left stereo in the browser** from mono solos + pan/gain:

| Part | Output pan |
| --- | --- |
| Tenor | 50% left |
| Lead | 25% left |
| Bass | 25% right |
| Bari | 50% right |

**Standard mix** (all four parts): same mono solos combined with the above weights into one stereo buffer (equivalent to hearing all parts with classic part-left panning).

**Partial quality upgrade:** When online, individual parts may upgrade to Original in cache. **Retain ultra-low solo blobs** until **all** voice parts for that tag are upgraded — mixed-quality tags still need 16 kbps solos for parts not yet Original.

### 5. Cache quality ladder (per part)

Each cached part tracks a quality level:

```
none → ultra_low → playback → original
```

| State | Offline play | Online play |
| --- | --- | --- |
| `ultra_low` | Reconstruct from mono solo | Prefer playback fetch; keep ultra_low |
| `playback` | Reconstruct if ultra_low also present; else playback blob | 64 kbps |
| `original` | Original | Original |

Resolve order for playback bytes: **Original (if cached) → Playback (online) → Ultra-low reconstruct (offline)**.

---

## Encoder pipeline (mirror → publish)

1. **Analyze** — `audio/analyze_audio_layouts.py` / `mirror/sync.py` writes `audio_layout` + `audio_layout_summary`, then for `mono_solos` tags estimates per-part timing via accompaniment-channel cross-correlation vs Lead (`audio_align` / `audio_align_summary` in `lib/audio_align.py`).
2. **Encode** — `lib/audio_tiers.py` / `audio/encode_audio_tiers.py` (also runs during `mirror/sync.py`):
   - Original: mirrored MP3 unchanged.
   - Playback: ffmpeg/libopus @ 64 kbps; stereo uses `-mapping_family 255` when uncoupled L/R matters.
   - Ultra solo: extract solo channel (from `solo_side` / layout), encode mono @ 16 kbps.
   - Ultra mix / ultra stereo / ultra downmix: per `audio_layout_summary.ultra_low`.
   - **Alignment bake:** when a trusted part offset has `|applied_ms| ≥ 50`, delay (`adelay`) or trim (`atrim`) that part before Opus encode so Solo/Playback files share Lead’s timeline. Smaller offsets are ignored.
3. **Upload** — sync encoded tiers alongside originals; manifest lists available tiers per part (`build_catalog.py` / offline manifest extensions TBD).

### Inter-part alignment (mono_solos)

Learning tracks may start a few tens/hundreds of ms apart. Reconstruction from mono solos is useless if parts are skewed.

| Field | Meaning |
| --- | --- |
| `parts.{part}.audio_align.offset_ms` | Estimated delay to apply so this part matches Lead (`>0` = pad start, `<0` = trim start) |
| `parts.{part}.audio_align.trusted` | Peak accompaniment corr ≥ 0.5 (and meaningful lag gain when skewed) |
| `parts.{part}.audio_align.applied_ms` | What the encoder bakes (`0` when `\|offset\| < 50` or untrusted) |
| `audio_align_summary.status` | `ok` / `skewed` / `untrusted` / `skipped` |
| `audio_layout_summary.mix_correlation` | Best mono xcorr between mix and any voice part |
| `audio_layout_summary.mix_disjoint` | Mix unrelated to voice parts → host mix in cache |
| `audio_layout_summary.mix_cache` | `hosted` or `reconstruct` |

Lead is always the reference (`applied_ms = 0`).

---

## Implementation checklist

- [x] Add `AUDIO_PLAYBACK_KBPS = 64` to `lib/config.py`
- [x] Batch encoder script + local tier files (`lib/audio_tiers.py`, `audio/encode_audio_tiers.py`; wired into `mirror/sync.py`)
- [x] Inter-part accompaniment alignment + bake offsets ≥50 ms into Opus tiers (`lib/audio_align.py`)
- [ ] Extend catalog / `offline-audio.json.gz` with tier URLs
- [ ] SingTags: playback URL resolver (64k default online)
- [ ] SingTags: download → original + cache upgrade
- [ ] SingTags: lazy per-part fetch on first play
- [ ] SingTags: custom combine — fetch selected parts only
- [ ] SingTags: ultra-low pack using mono solos + mix formula
- [ ] SingTags: retain ultra-low when partial Original upgrade

---

## References

- Opus listening demos: `Barbershop_Tags_Library/_codec_demos_opus/`
- Layout analyzer: `lib/audio_layout.py`
- SingTags offline tiers (sheets/audio packs): website `docs/decisions/offline-library.md`
