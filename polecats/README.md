# Barber Pole Cat Program (“Polecats”)

Working media tree for BHS **Barber Pole Cat** arrangements — not barbershoptags.com
tags. Layout mirrors `../library/` so the same crop / Opus / preview tools apply.

These will feed a future **Classics / Polecats** page. They stay out of the main
tag catalog until that ships.

## Layout

```
polecats/
  SOUNDCLOUD_NAMES.md          # real (SoundCloud) vs common names
  README.md                    # this file
  {title} ({key}) - {arranger} - {90001–90012}/
    metadata.json
    … - Sheet.pdf
    … - Sheet Preview.webp     # after sheets/build_sheet_previews.py
    … - {Lead|Tenor|Bari|Bass|Mix}.mp3
    … - {part} - Playback.opus # after audio/encode_audio_tiers.py
    … - {part} - Solo.opus / Ultra / Downmix as layout dictates
```

- **IDs:** `90001`–`90012` (reserved range; does not collide with current tag ids ≤7568)
- **`collection`:** `polecats`
- **`classic`:** booklet order `1`–`12` (SoundCloud set order)
- **`title`:** SoundCloud / BHS real name · **`common_name` / `alt_title`:** singer shorthand
- **`cache_group`:** `polecats` (separate offline pack — see below)
- **Audio:** real 4-part learning tracks + Mix imported from
  `/media/kpetrie/extradrive1/Barbershop/other` (not the SoundCloud playlist
  uploads, which were duplicate full mixes). Layout/Opus tiers via the usual
  `analyze_audio_layouts` + `encode_audio_tiers` pipeline.

Name mapping: [`SOUNDCLOUD_NAMES.md`](SOUNDCLOUD_NAMES.md).

## Pitch stacks from learning tracks

```bash
python3 polecats/extract_pitch_stacks.py --force
python3 polecats/stacks_to_tag_studio.py
```

1. Writes `pitch_stacks.json` + `pitch_studio.json` **into each polecat folder** (via `sync/audio/extract_pitch_stacks.py`).
2. Copies the **Coach gold set** (Irish Rose, Sweet And Lovely, Sweetheart, Story of the Rose) into [`web/public/tag-studio/polecat-pitch-reviews/`](../web/public/tag-studio/polecat-pitch-reviews/) for Tag Studio auto-seed. Use `--all` only if you intentionally want every polecat seeded.

## Process (from `sync/` with venv)

```bash
source ./sync/.venv/bin/activate
cd sync

python sheets/crop_library_pdfs.py --source ../polecats
python sheets/build_sheet_previews.py --source ../polecats
python audio/analyze_audio_layouts.py --source ../polecats --force
python audio/encode_audio_tiers.py --source ../polecats --force-layout
```

Re-import from raw downloads only via `polecats/to_library.py` (destructive to
pre-library folder names).

## Offline cache group (planned)

Same protocol as tags, **separate Cache API / OPFS namespaces** so Polecats do
not share eviction or “download all sheets/audio” with the 7k-tag library:

| Kind | Planned cache name | Manifest (TBD) |
| --- | --- | --- |
| Sheets (WebP + detail JSON) | `singtags-polecats-sheets-v1` | `indexes/offline-polecats-sheets.json.gz` |
| Ultra-low audio pack | `singtags-polecats-audio-v1` | `indexes/offline-polecats-audio.json.gz` |

Resolve order should match tags: starred/local blob → polecats pack → network.
Media URLs will be library-relative under `/polecats/…` (or a published alias)
when the Classics page lands — **not** mixed into `singtags-sheets-v1` /
`singtags-audio-v1`.

Until indexes/publish wire this up, treat this tree as prepared media + metadata only.
