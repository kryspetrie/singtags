# `audio/` — layout analysis & Opus tier encode (batch)

**Live vs one-off:** The same logic runs **incrementally inside `mirror/sync.py`** whenever a tag is processed. These scripts are for **library-wide backfill** or forced re-analysis.

Design: [`../docs/AUDIO_STORAGE_AND_CACHE.md`](../docs/AUDIO_STORAGE_AND_CACHE.md).

## Requirements

Shared venv (`mirror/requirements.txt` includes `numpy`). System: `ffmpeg`.

See [`requirements.txt`](requirements.txt) for a split-out dep list.

## Scripts

### `analyze_audio_layouts.py`

```bash
python audio/analyze_audio_layouts.py
python audio/analyze_audio_layouts.py --force --workers 8
python audio/analyze_audio_layouts.py --id 4785
```

### `encode_audio_tiers.py`

```bash
python audio/encode_audio_tiers.py
python audio/encode_audio_tiers.py --force-layout
python audio/encode_audio_tiers.py --id 4785 --force
```

## Library code (shared)

`lib/audio_layout.py`, `lib/audio_align.py`, `lib/audio_tiers.py`
