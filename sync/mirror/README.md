# `mirror/` — live sync / repair pipeline

**This is the core product.** Day-to-day CLI and optional weekly Lambda live here.

Shared library code is in [`../lib/`](../lib/). Parent overview: [`../README.md`](../README.md).

## Requirements

| File | When |
| --- | --- |
| [`requirements.txt`](requirements.txt) | Always — OCR, HTTP, PDF, sheets |
| [`requirements-asr-cpu.txt`](requirements-asr-cpu.txt) | Whisper on CPU (Lambda image) |
| [`requirements-asr.txt`](requirements-asr.txt) | Local ASR with CUDA wheels |

```bash
# from sync/
./install.sh                          # → mirror/install.sh; venv at sync/.venv
source ./.venv/bin/activate
pip install -r mirror/requirements-asr.txt   # optional, local GPU ASR
```

System tools: `ffmpeg` (audio tiers / ASR), `tesseract` (OCR fallback).

Working library: `../../library/` (`SITE_ROOT/library` via `lib/config.py`).

## Entrypoints

| Script | Role |
| --- | --- |
| `sync.py` | Primary CLI: `--bulk-meta`, `--frontier`, `--repair`, `--ids`, OCR/ASR backfill |
| `run_full_mirror.py` | Local end-to-end orchestration |
| `lambda_sync.py` | Weekly AWS Lambda handler |
| `enrich.py` | Bulk API → `metadata.json` |
| `assets.py` | Sheet/MP3 download via `dbaction` |
| `normalize.py` | Rename folders/files |
| `inventory.py` | Scan library; guidelines PDFs; missing IDs |
| `extract_text.py` | PDF text + OCR lyrics |
| `extract_audio_lyrics.py` | Whisper ASR → `part_lyrics` |
| `build_catalog.py` | Emit `library/_state/catalog.jsonl` |
| `quarantine_unavailable.py` | Move unavailable tags under `_state/quarantine/` |
| `repair_arrangers.py` | Arranger repair helpers |

```bash
python mirror/sync.py --bulk-meta
python mirror/sync.py --frontier --miss-limit 200
python mirror/run_full_mirror.py
python mirror/lambda_sync.py --local --limit 5
```

## Lambda image

[`Dockerfile.lambda`](Dockerfile.lambda) — built/pushed by [`../infra/scripts/`](../infra/scripts/). See [`../docs/WEEKLY_LAMBDA_SYNC.md`](../docs/WEEKLY_LAMBDA_SYNC.md).
