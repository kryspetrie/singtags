# `audio/` — layout analysis & Opus tier encode (batch)

**Live vs one-off:** The same logic runs **incrementally inside `mirror/sync.py`** whenever a tag is processed. These scripts are for **library-wide backfill** or forced re-analysis.

Design: [`../docs/AUDIO_STORAGE_AND_CACHE.md`](../docs/AUDIO_STORAGE_AND_CACHE.md)  
Client ADR: [`../../docs/decisions/audio-storage-cache.md`](../../docs/decisions/audio-storage-cache.md)

## Requirements

Shared venv (`sync/.venv`; `mirror/requirements.txt` includes `numpy`). System: `ffmpeg`.

See [`requirements.txt`](requirements.txt) for a split-out dep list.

```bash
cd sync && source ./.venv/bin/activate
```

## Scripts

### `extract_pitch_stacks.py`

Precompute TTBB pitch → `pitch_stacks.json` + `pitch_studio.json` in each tag folder
(also updates `metadata.json` → `pitch_extract`). Used by Tag page **Import into Tag Studio**.

```bash
python audio/extract_pitch_stacks.py --source ../polecats --force
python audio/extract_pitch_stacks.py --id 31 --force
python audio/extract_pitch_stacks.py --limit 50 --workers 4
```

Rebuild SPA indexes afterward so slim `tags/{id}/metadata.json` includes `pitch_studio`:

```bash
python ../build/build_indexes.py
```

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
