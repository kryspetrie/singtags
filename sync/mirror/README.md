# `mirror/` — live sync / repair pipeline

**This is the core product.** Day-to-day CLI and weekly Lambda all live here.

Shared library code is in [`../lib/`](../lib/) (not duplicated yet — split later with this package).

## Requirements

| File | When |
|------|------|
| [`requirements.txt`](requirements.txt) | Always — OCR, HTTP, PDF, sheets |
| [`requirements-asr-cpu.txt`](requirements-asr-cpu.txt) | Whisper on CPU (Lambda image) |
| [`requirements-asr.txt`](requirements-asr.txt) | Local ASR with CUDA wheels |

```bash
# from repo root
./install.sh                          # → mirror/install.sh, venv at repo root
source ./venv/bin/activate
pip install -r mirror/requirements-asr.txt   # optional, local GPU ASR
```

System tools: `ffmpeg` (audio tiers / ASR), `tesseract` (OCR fallback).

## Entrypoints (all live)

| Script | Role |
|--------|------|
| `sync.py` | Primary CLI: `--bulk-meta`, `--frontier`, `--repair`, `--ids`, OCR/ASR backfill |
| `run_full_mirror.py` | Local end-to-end orchestration |
| `lambda_sync.py` | Weekly AWS Lambda handler |
| `enrich.py` | Bulk API → `metadata.json` |
| `assets.py` | Sheet/MP3 download via `dbaction` |
| `normalize.py` | Rename folders/files |
| `inventory.py` | Scan library; guidelines PDFs; missing IDs |
| `extract_text.py` | PDF text + OCR lyrics |
| `extract_audio_lyrics.py` | Whisper ASR → `part_lyrics` |
| `build_catalog.py` | Emit `_state/catalog.jsonl` |

```bash
python mirror/sync.py --bulk-meta
python mirror/sync.py --frontier --miss-limit 200
python mirror/run_full_mirror.py
python mirror/lambda_sync.py --local --limit 5
```

## Lambda image

[`Dockerfile.lambda`](Dockerfile.lambda) — built/pushed by [`../infra/scripts/`](../infra/scripts/).

## Obsolete / do not use

- **Per-tag HTML scrape** for metadata — origin DB has no indexes. Use `--bulk-meta` only.
- `lib/parse_tag_page.parse_tag_page()` — leftover HTML parser; unused. URL helpers (`download_file_url`, `tag_page_url`) are still used.
