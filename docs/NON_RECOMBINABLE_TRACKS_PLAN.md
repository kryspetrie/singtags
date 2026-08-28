# Non-recombinable learning tracks — implementation plan

> **Status:** in progress (Phase 0–2 underway; library re-analyze running)  
> **Created:** 2026-08-28  
> **Updated:** 2026-08-28  
> **Goal:** Detect tags whose voice parts and/or mix cannot be reliably time-aligned or solo/accomp-split for reconstruction, then **cache and play hosted Opus stereo/mono** instead of mono-solo extract + client rebuild.  
> **Exemplar:** Tag **3068** (*All Alone Too*) — demoted to `stereo_fallback` / `parts_recombinable: false` (`align_untrusted`); seeded into `sample-data/`.  
> **Related:** [audio-storage-cache ADR](decisions/audio-storage-cache.md), mirror `Barbershop/tags/docs/AUDIO_STORAGE_AND_CACHE.md`, `lib/audio_layout.py`, `lib/audio_align.py`, SingTags `web/src/lib/audioTiers.ts`, `web/src/offline/resolveMedia.ts`.

---

## Problem

Most barbershop learning tracks are **homophonic** and share a common accompaniment (or hard L/R solo vs trio) timeline. That is why we:

1. Classify `part_left` / `part_right` → `ultra_low: mono_solos`
2. Extract 16 kbps mono solos
3. Cross-correlate accompaniment vs Lead and bake ≥50 ms offsets
4. Reconstruct part-left stereo and mix in the browser offline

A minority of tags break that assumption: piano renders, unrelated mix files, misaligned stems, or stereo that is not a true solo/accomp split. Reconstructing those sounds wrong. Users should hear the **published playback / ultra stereo (or mono) files as-is**.

**Estimate:** ~5–10% of tags may need this treatment. A partial mirror scan found ~2.8% of `mono_solos` tags with mostly untrusted non-Lead aligns; `mix_correlation` has only been written for **1** tag so far (3068), so library-wide rates are still unknown until a force re-analyze.

---

## What already exists

| Piece | Location | Behavior |
| --- | --- | --- |
| Mix vs voice mono xcorr | Mirror `analyze_mix_match` | Best corr &lt; **0.25** → `mix_disjoint` + `mix_cache: hosted` + publish `ultra_mix` |
| Accomp-channel align | Mirror `audio_align.py` | Peak corr ≥ **0.5** → `trusted`; bake `applied_ms` if \|offset\| ≥ 50 ms |
| Client mix gate | `mixIsDisjoint()` / `tryReconstructMix` | Skip reconstruct; prefer hosted `ultra_mix` |
| Offline pack mix path | `build_offline_manifest.py` | For `mono_solos` + `mix_disjoint`, include `ultra_mix` |

**Gaps:**

1. No policy demotion for **voice parts** when alignment fails (3068 stays `mono_solos`).
2. `audio_align_summary.status` stays **`ok`** whenever Lead is trusted (always), even if every other part is untrusted.
3. `mix_correlation` / `mix_disjoint` not populated for almost the entire library (need force re-analyze).
4. Client never reads align trust / a “parts not recombinable” flag to choose `ultra_stereo` / playback over solo reconstruct.

---

## Product rules

1. **Prefer hosted audio when reconstruction is unreliable** — never silently rebuild a wrong mix or part-left image.
2. **Online play** stays Playback (64k) or cached Original — unchanged.
3. **Offline pack** for non-recombinable tags stores **hosted ultra stereo (32k) per needed part** (and hosted mix), not mono solos meant for rebuild.
4. **Custom combine** on non-recombinable tags: either disable / warn, or sum **full hosted stems** (no solo-channel extract). Prefer **disable Custom** in v1 if stems are not true learning tracks.
5. **Downloads** remain Original — unchanged.
6. **False negatives** (miss a bad tag) are worse than **false positives** (treat a good tag as stereo_fallback) — slightly larger offline pack is acceptable.

---

## Proposed metadata

Extend mirror `audio_layout_summary` / `audio_tiers_summary` (seeded into SingTags catalog as today):

| Field | Type | Meaning |
| --- | --- | --- |
| `parts_recombinable` | `boolean` | `false` → do **not** mono-solo extract or client-reconstruct parts/mix from solos |
| `recombine_reason` | `string` (optional) | Short code for debugging: `mix_disjoint` \| `align_untrusted` \| `stereo_not_split` \| `homophony_fail` \| `manual` |
| `mix_disjoint` / `mix_cache` / `mix_correlation` | existing | Unchanged semantics |
| `ultra_low` | existing enum | When `parts_recombinable === false`, force **`stereo_fallback`** (unless mix-only → keep mix-only `ultra_mix` rule) |

Align summary fix:

| `audio_align_summary.status` | Rule |
| --- | --- |
| `ok` | All present voice parts trusted, no baked skew |
| `skewed` | Trusted parts with \|applied_ms\| ≥ 50 |
| `untrusted` | Fewer than **2** non-Lead voice parts trusted (or zero non-Lead trusted when ≥2 non-Lead files exist) |
| `skipped` | Not `mono_solos` / insufficient parts |

Keep per-part `audio_align.trusted` / `corr` as today.

---

## Detection heuristics (mirror)

Run inside existing `ensure_audio_layouts` / encode pipeline. Order matters: cheaper checks first; optional homophony last.

### H1 — Mix disjoint (existing)

- Mono-downmix xcorr mix ↔ each voice part.
- `best < AUDIO_MIX_DISJOINT_CORR` (0.25) → `mix_disjoint`, `mix_cache: hosted`.
- **Also** set `parts_recombinable: false` if we cannot trust that the mix is a sum of the learning parts *and* voice aligns are weak (see H2). Mix-disjoint alone does **not** always mean parts are bad (wrong mix file, good stems) — so split:

  - **Mix only bad:** `mix_disjoint: true`, parts still recombinable if H2 passes.
  - **Parts bad:** `parts_recombinable: false` → `ultra_low: stereo_fallback`.

### H2 — Inter-part accompaniment trust (existing, fix summary)

- For tags that would be `mono_solos`, use accomp-channel xcorr vs Lead.
- Let `T` = number of trusted non-Lead voice parts; `N` = number of non-Lead voice files present.
- Fail recombinability when:
  - `N >= 2` and `T < 2`, **or**
  - mean peak corr of non-Lead parts &lt; **0.25** (same ballpark as mix threshold).
- Pass when `T >= 2` (or `N < 2`).

### H3 — Not a real solo/accomp split (new, cheap)

Learning tracks that are truly part-left/right have **low** L/R correlation and clear solo side. Piano / full stereo often has **high** mid correlation while still getting majority-voted `part_left`.

For voice parts with `audio_layout`:

- Count voices with `correlation > 0.55` (or `kind` in `near_mono` / `stereo_other` / high `side_mid` inverted — tune on fixtures).
- If ≥ **3** voice parts look “full stereo / not hard-split” **and** H2 is weak → `parts_recombinable: false`.

Use H3 as **supporting evidence**, not the sole gate, to avoid demoting soft part-left masters.

### H4 — Homophonic pulse / onset coherence (optional Phase 2)

Barbershop hypothesis: aligned stems maximize **distinct summed onset/energy pulses**.

Sketch:

1. Per voice: compute short-window RMS or spectral-flux onset envelope (e.g. 10–20 ms hop).
2. Search small lag window (±200 ms) aligning each part to Lead (or use H2 lags).
3. Score = peakiness of sum of aligned envelopes (e.g. crest factor, or ratio of peak sum energy to mean).
4. Compare to score at random lags / unaligned. Low ratio → non-homophonic / misaligned.

**Phase 1:** do **not** block on H4; log scores on a sample for calibration. **Phase 2:** add as confirmatory fail if H2 is borderline.

### Manual override

Support `parts_recombinable: false` / `true` and `recombine_reason: manual` in metadata for curator fixes without waiting for heuristic retune.

---

## Publish / encode consequences (mirror)

When `parts_recombinable === false`:

| Asset | Action |
| --- | --- |
| `ultra_low` | Set **`stereo_fallback`** |
| Voice `ultra_solo` | **Do not** require for offline pack (optional keep for debug; pack ignores) |
| Voice `ultra_stereo` | **Publish** 32 kbps stereo (or mono if source mono) per voice part present |
| Mix | Always publish **`ultra_mix`** when a mix file exists (whether or not `mix_disjoint`) |
| Playback / Original | Unchanged |
| Align bake into solos | N/A (no solo reconstruct path) |

When only `mix_disjoint` and parts **are** recombinable:

- Keep `mono_solos` for voices.
- Host `ultra_mix` for mix (already implemented).

---

## Client consequences (SingTags)

### Resolver (`audioTiers.ts` / `resolveMedia.ts`)

- Add `partsAreRecombinable(detail)` — true unless `parts_recombinable === false` or `ultra_low === 'stereo_fallback'` (and not mix-only).
- Offline voice play: if not recombinable → resolve **`ultra_stereo` → playback → original`**, never solo reconstruct / part-left rebuild.
- Offline mix: if not recombinable **or** `mixIsDisjoint` → hosted `ultra_mix` only (no `buildUltraMixObjectUrl`).
- Online Custom: if not recombinable → hide Custom tab or show disabled reason (“Tracks on this tag aren’t aligned for combining”).
- `supportsCustomSoloMix`: return false when not recombinable.

### Offline manifest (`build_offline_manifest.py`)

- For `stereo_fallback` / `parts_recombinable: false`: include `ultra_stereo` (voices) + `ultra_mix` (if present), not `ultra_solo`.
- Keep existing `mono_solos` + `mix_disjoint` mix hosting.

### Seed / indexes

- Pass through `parts_recombinable`, `recombine_reason`, and existing mix/align fields (already mostly wired in `seed_sample.py`).

### UX

- No banner required for v1.
- Optional Advanced hint later: “Playing hosted tracks (not rebuilt from solos).”

---

## Calibration & measurement

Before locking thresholds, run a **force layout+align analyze** on the full mirror (or a 500-tag stratified sample) and report:

| Metric | Target / watch |
| --- | --- |
| `% mix_disjoint` | Informational |
| `% parts_recombinable false` | Aim **~5–10%**; if &gt;15%, tighten H2/H3 |
| Precision on hand-labeled set | Include 3068, 2–3 known-good part-left tags, 2–3 known piano/bad |
| Offline pack size delta | Expect modest increase for demoted tags (32k stereo × parts vs 16k mono) |

Hand-label checklist (10–20 tags): listen whether solo extract + sum matches the hosted mix; if not, expect `parts_recombinable: false`.

---

## Implementation phases

### Phase 0 — Docs & contract (½ day)

- [x] Land this plan; update mirror `AUDIO_STORAGE_AND_CACHE.md` + SingTags ADR with `parts_recombinable` / demotion rules.
- [x] Fix align `status` contract in docs (`untrusted` when &lt;2 non-Lead trusted).

### Phase 1 — Mirror detection + encode (1–2 days)

- [x] Fix `summarize_align` status logic.
- [x] Compute `parts_recombinable` + `recombine_reason` from H1–H3; force `ultra_low: stereo_fallback` when false.
- [x] Ensure encode path publishes `ultra_stereo` for those tags; pack manifest includes them.
- [x] Force re-analyze started on the mirror library (`analyze_audio_layouts.py --force`).
- [x] Fixtures: 3068 demoted + encoded; 1929 remains `mono_solos`.

### Phase 2 — Client + seed into this repo (1 day)

- [x] `partsAreRecombinable` + resolver / Custom / manifest behavior.
- [x] Seed `--ids 3068,1929` into `sample-data/`.
- [x] Tests: `audioTiers.test.ts`, `audioLayout.test.ts`.

### Phase 3 — Library roll-out + calibrate (½–1 day + overnight job)

- [x] Finish force-analyze on mirror (7129 folders: 3619 updated, 3509 skipped).
  - Rates (tags with `parts_recombinable`): **50.6%** false — mostly pre-existing `stereo_not_split` (1632); **200** true demotions via `align_untrusted`; 581 `mix_disjoint`.
  - `ultra_low`: stereo_fallback 1832 · mono_solos 1178 · mono_downmix 609.
- [x] Encode demoted tags (`encode_audio_tiers.py`, no `--force`): 3619 updated · 3509 skipped · 1 no-meta.
- [ ] Publish rates; spot-listen 10 demotions + 10 retained `mono_solos` (fixtures 3068 demoted / 1929 mono_solos verified on disk).
- [x] Re-seed sample-data for 3068 + 1929 after encode.
- [ ] Adjust thresholds if needed; optional H4 logging.

### Phase 4 — Optional homophony heuristic (later)

- [ ] Implement H4 scoring; compare to H2 failures; promote to gate only if it improves precision/recall on the labeled set.

---

## Acceptance criteria

1. Tag **3068**: offline pack contains hosted mix + stereo (or mono) voice ultras; **no** client mix/part reconstruct from solos; play matches hosted Playback character.
2. A known-good part-left tag (e.g. sample **1929**): still `mono_solos`, reconstruct works, pack still solo-based.
3. Mix-disjoint-only tags (good stems, wrong mix): mix hosted; voices still reconstruct if H2 passes.
4. Align summary for 3068-class tags: **`untrusted`** (not `ok` with only Lead trusted).
5. Custom combine hidden/disabled when `parts_recombinable === false`.
6. Catalog/seed exposes the new fields; no regression to online 64k playback or Original download.

---

## Out of scope (v1)

- Auto time-stretch / warping stems to force alignment.
- Replacing pitch/speed bake pipeline.
- UI for manual curator flagging (metadata override is enough).
- Re-encoding the entire library’s Playback tier.

---

## Open questions

1. **Custom on stereo_fallback tags:** disable entirely (recommended v1) vs allow summing full stereo stems?
2. **Keep generating `ultra_solo` files** for demoted tags (waste/storage) or skip encode?
3. **Threshold ownership:** keep constants in mirror `lib/config.py` only; SingTags trusts published flags (no client-side re-detect).
4. Should `parts_recombinable: false` appear on browse cards, or stay invisible except player behavior?

---

## Suggested decision defaults

| Question | Default |
| --- | --- |
| Custom combine | **Disable** when not recombinable |
| Ultra solo encode on demoted tags | **Skip** (save space) |
| Detection | Mirror-only; client trusts metadata |
| Browse UI | No badge in v1 |
| H4 homophony | Phase 4 only |
