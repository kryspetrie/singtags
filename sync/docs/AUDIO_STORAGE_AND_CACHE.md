# Audio storage, publish tiers, and client cache

**Status:** Accepted — **implemented** (mirror encode + SingTags client resolver/cache)  
**Date:** 2026-08-25 (client catch-up through 2026-09)  
**Related:** [`lib/config.py`](../lib/config.py), [`lib/audio_layout.py`](../lib/audio_layout.py), website ADR [`docs/decisions/audio-storage-cache.md`](../../docs/decisions/audio-storage-cache.md)

This doc is the **mirror-side** design (bit rates, layout rules, encoder pipeline). Browser behavior is summarized here for context; the website ADR is authoritative for SingTags PWA details (including Opus WASM decode on older Safari).

---

## Summary

Host **publish tiers** on S3 (plus originals). The browser **never** streams full-quality files for routine playback. Originals are fetched only for explicit download or when upgrading a per-track device cache. Offline packs use **mono solo** assets to reconstruct part-left learning tracks; mix-only / non-recombinable tags use stereo ultra tiers.

Egress dominates cost; extra S3 storage for Opus tiers is negligible (~$0.06/mo for the full library at current scale).

---

## S3 publish tiers

Each learning part (Lead, Tenor, Bari, Bass, Mix) may exist independently per tag.

| Tier | ID | Encoding | Typical use |
| --- | --- | --- | --- |
| **Original** | `original` | Source MP3/AAC as mirrored from barbershoptags.com | User download; cache upgrade |
| **Playback** | `playback` | **64 kbps Opus** (mono or stereo per source) | Default **online** in-tag playback |
| **Ultra-low solo** | `ultra_solo` | **16 kbps Opus mono** — solo channel only | Offline cache + part-left reconstruction |
| **Ultra-low mix** | `ultra_mix` | **32 kbps Opus stereo** | Tags that have **Mix only** (no voice parts) |
| **Ultra stereo** | `ultra_stereo` | **32 kbps Opus stereo** | `stereo_fallback` / non-recombinable parts |

Constants in `lib/config.py`:

```python
AUDIO_ULTRA_LOW_MONO_KBPS = 16      # mono solo channel
AUDIO_STEREO_GOOD_KBPS = 32           # mix-only / stereo fallback
AUDIO_STEREO_PREFERRED_KBPS = 48      # optional higher stereo tier (not in v1 cache plan)
AUDIO_PLAYBACK_KBPS = 64              # online playback tier
```

### Which ultra-low assets to publish

Use `metadata.json` → `audio_layout_summary.ultra_low`:

| `ultra_low` | Publish for offline |
| --- | --- |
| `mono_solos` | 16 kbps **mono solo** per voice part (extract solo channel from part-left/right stereo) |
| `mono_downmix` | No per-part solos; optional downmixed mono per part or stereo fallback |
| `stereo_fallback` | 32 kbps stereo per needed part, or mix-only rule below |

**Mix-only tags** (no Lead/Tenor/Bari/Bass files): publish one **32 kbps stereo** `ultra_mix` only — do not generate four solo stubs.

**Mix disjoint from voice parts** (`audio_layout_summary.mix_disjoint: true`): when mono downmix cross-correlation between mix and all voice parts is below **0.25**, publish **32 kbps `ultra_mix`** for the mix and include it in the offline pack instead of reconstructing mix from mono solos.

**Parts not recombinable** (`audio_layout_summary.parts_recombinable: false`): force `ultra_low: stereo_fallback`, publish **32 kbps `ultra_stereo`** per voice part (+ hosted `ultra_mix` when a mix file exists). See website [`docs/plans/non-recombinable-tracks.md`](../../docs/plans/non-recombinable-tracks.md).

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

---

## Client behavior (SingTags PWA)

Authoritative detail: website [`docs/decisions/audio-storage-cache.md`](../../docs/decisions/audio-storage-cache.md).

| Action | Source tier |
| --- | --- |
| **Play** (online) | Playback 64 kbps Opus (or Original if already cached); WASM decode when native Opus fails |
| **Download** | Original; upgrades device cache for that part |
| **Offline pack** | Ultra solos / ultra mix / ultra stereo per layout summary |
| **Lazy fetch** | First play of a part only — no tag-wide prefetch |

Part-left reconstruction weights (Tenor 50% L, Lead 25% L, Bass 25% R, Bari 50% R) and the quality ladder `none → ultra_low → playback → original` are unchanged from the original plan.

---

## Encoder pipeline (mirror → publish)

1. **Analyze** — `audio/analyze_audio_layouts.py` / `mirror/sync.py` writes `audio_layout` + `audio_layout_summary`, then for `mono_solos` tags estimates per-part timing via accompaniment-channel cross-correlation vs Lead (`lib/audio_align.py`).
2. **Encode** — `lib/audio_tiers.py` / `audio/encode_audio_tiers.py` (also runs during `mirror/sync.py`):
   - Original: mirrored MP3 unchanged.
   - Playback: ffmpeg/libopus @ 64 kbps; stereo uses `-mapping_family 255` when uncoupled L/R matters.
   - Ultra solo: extract solo channel (from `solo_side` / layout), encode mono @ 16 kbps.
   - Ultra mix / ultra stereo / ultra downmix: per `audio_layout_summary.ultra_low`.
   - **Alignment bake:** when a trusted part offset has `|applied_ms| ≥ 50`, delay (`adelay`) or trim (`atrim`) that part before Opus encode so Solo/Playback files share Lead’s timeline.
3. **Upload** — website `deploy/library_s3.sh` syncs `library/` (including Opus siblings) to the SingTags media prefix. Catalog/indexes via `build/build_indexes.py` + website publish.

### Inter-part alignment (`mono_solos`)

| Field | Meaning |
| --- | --- |
| `parts.{part}.audio_align.offset_ms` | Estimated delay so this part matches Lead (`>0` = pad start, `<0` = trim start) |
| `parts.{part}.audio_align.trusted` | Peak accompaniment corr ≥ 0.5 |
| `parts.{part}.audio_align.applied_ms` | What the encoder bakes (`0` when `|offset| < 50` or untrusted) |
| `audio_align_summary.status` | `ok` / `skewed` / `untrusted` / `skipped` |
| `audio_layout_summary.mix_correlation` | Best mono xcorr between mix and any voice part |
| `audio_layout_summary.mix_disjoint` | Mix unrelated to voice parts → host mix in cache |
| `audio_layout_summary.mix_cache` | `hosted` or `reconstruct` |

Lead is always the reference (`applied_ms = 0`).

---

## Implementation checklist

### Mirror

- [x] `AUDIO_PLAYBACK_KBPS = 64` in `lib/config.py`
- [x] Batch encoder + wire into `mirror/sync.py` (`lib/audio_tiers.py`, `audio/encode_audio_tiers.py`)
- [x] Inter-part alignment + bake offsets ≥50 ms (`lib/audio_align.py`)
- [x] Non-recombinable → `stereo_fallback` / hosted ultra stereo (residual spot-listen ops on website side)

### SingTags client (see website ADR)

- [x] Playback URL resolver (64k default online)
- [x] Download → original + cache upgrade
- [x] Lazy per-part fetch on first play
- [x] Custom combine — fetch selected parts only
- [x] Ultra-low pack using mono solos + mix formula
- [x] Retain ultra-low when partial Original upgrade
- [x] WASM Ogg Opus decode when native decode fails

Residual: spot-listen calibration for demotion rates ([non-recombinable-tracks](../../docs/plans/non-recombinable-tracks.md)).

---

## References

- Layout analyzer: `lib/audio_layout.py`
- Batch scripts: [`../audio/README.md`](../audio/README.md)
- SingTags offline tiers: [`../../docs/decisions/offline-library.md`](../../docs/decisions/offline-library.md)
- Codec demos (if present): `library/_codec_demos_opus/`
