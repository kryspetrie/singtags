# `sync/` — barbershop tags mirror

Local mirror and repair pipeline for [barbershoptags.com](https://barbershoptags.com). Writes the working media tree used by SingTags.

| Piece | Role |
| --- | --- |
| This folder (`sync/`) | Enrich / download / OCR / ASR / Opus tiers / sheet previews |
| `../library/` | **Data** (gitignored) — tag folders + `_state/` |
| `../build/` | SPA indexes from `library/` (no remux) |
| `../deploy/` | Publish SPA + media to **SingTags** S3 (`singtags-prod`) |
| `../web/` | Vue SPA — [www.singtags.com](https://www.singtags.com) |

Site hosting runbooks: [`../docs/setup.md`](../docs/setup.md), [`../docs/publish.md`](../docs/publish.md).  
Optional weekly Lambda: [`docs/WEEKLY_LAMBDA_SYNC.md`](docs/WEEKLY_LAMBDA_SYNC.md).

## Layout

Each top-level folder is an **independent tool** you can split out later. Shared code stays in `lib/` until that split.

| Directory | What it is | When | Requirements |
| --- | --- | --- | --- |
| [`mirror/`](mirror/README.md) | Sync / repair / Lambda / OCR / ASR | Day-to-day (+ optional weekly Lambda) | `mirror/requirements*.txt` |
| [`lyrics/`](lyrics/README.md) | Flagged lyric review GUI + batch | Human review | Shared venv; `lyrics/requirements.txt` |
| [`audio/`](audio/README.md) | Library-wide layout + Opus tier backfill | On demand | Shared venv; `audio/requirements.txt` |
| [`sheets/`](sheets/README.md) | Sheet preview + PDF crop batch | On demand | Shared venv; `sheets/requirements.txt` |
| [`infra/`](infra/scripts/README.md) | Terraform + Lambda deploy scripts | When changing AWS sync | AWS CLI, Terraform, Docker |
| [`lib/`](lib/README.md) | Shared Python modules | — | Pulled in by tools above |
| [`docs/`](docs/) | Design notes (audio tiers, weekly Lambda) | Reference | — |

---

## Setup

From this directory (`sync/`):

```bash
./install.sh                 # creates sync/.venv, installs mirror/requirements.txt
source ./.venv/bin/activate
# Library data: ../library (gitignored) — see lib/config.py → SITE_ROOT/library
```

From the website repo root:

```bash
./sync/install.sh
source ./sync/.venv/bin/activate
cd sync
```

System tools: `ffmpeg` (audio tiers / ASR), `tesseract` (OCR fallback; optional micromamba).

Optional ASR:

```bash
pip install -r mirror/requirements-asr.txt       # local GPU
# or
pip install -r mirror/requirements-asr-cpu.txt   # CPU / matches Lambda
```

---

## Theory of operation

### Origin care

The origin DB has **no indexes**. Hitting thousands of per-tag HTML pages can take the site offline.

| Traffic | Allowed? |
| --- | --- |
| **One** `api.php?n=50000` metadata export | Yes — preferred |
| Sheet / MP3 downloads (`dbaction.php`) | Yes |
| Per-tag `dbpage.php?pg=view&id=…` scrapes | **No** |

Tag `id` values are **pseudo-keys** and may change. Local folders correlate by `identity_key` (title + arranger + key + version + alt title + posted date).

### What a “tag” is locally

```
../library/{name} ({key}) - {arranger} - {tag_id}/
  metadata.json
  … - Sheet.pdf|.png
  … - {Bass|Bari|Lead|Tenor|Mix}.mp3
  … - *.playback.opus / *.ultra.opus / …
  … - Sheet.preview.webp
```

Cross-library state: `../library/_state/` (bulk XML cache, sync cursor, catalog, **lyric review queue**, orphans, logs). Never delete lyric-review progress there.

### Data flow

```
api.php (ONE bulk export)
        │
        ▼
  enrich / --bulk-meta ──► metadata.json
        │
        ▼
  assets (dbaction) ──► missing Sheet / MP3s
        │
        ▼
  normalize ──► folder + file names
        │
        ├──► OCR / ASR ──► lyrics / part_lyrics (never overwrite manual)
        ├──► audio_layout + audio_align
        └──► audio_tiers ──► Opus publish files
                │
                ▼
  build_catalog ──► ../library/_state/catalog.jsonl
                │
                ▼
  ../build/build_indexes.py ──► SPA indexes (core/lyrics gzip)
  ../build/build_offline_manifest.py ──► offline pack manifests
  ../deploy/publish.sh         ──► SingTags prod S3 (website and/or library)
```

---

## Day-to-day commands

```bash
cd sync && source ./.venv/bin/activate

python mirror/sync.py --bulk-meta
python mirror/sync.py --frontier --miss-limit 200
python mirror/sync.py --repair
python mirror/run_full_mirror.py
```

### Inventory / quarantine / arranger repair

```bash
python mirror/inventory.py --delete-guidelines
python mirror/quarantine_unavailable.py    # empty / unavailable folders
python mirror/repair_arrangers.py          # then rebuild SPA indexes
```

After library changes that affect the SPA catalog (see [`../docs/publish.md`](../docs/publish.md)):

```bash
# from website repo root
python3 build/build_indexes.py
python3 build/build_offline_manifest.py
./deploy/publish.sh library
./deploy/publish.sh website
```

Website deploy does **not** rebuild indexes.
### Lyric review (resume flagged queue)

Progress is in `../library/_state/lyric_review_queue.json` (not in `lyrics/`). Continue with:

```bash
python lyrics/review_queue_gui.py
```

Full workflow: [`lyrics/README.md`](lyrics/README.md).

### Audio / sheets backfill

Same logic runs incrementally inside `mirror/sync.py`. These are library-wide jobs:

```bash
python audio/analyze_audio_layouts.py
python audio/encode_audio_tiers.py
python sheets/build_sheet_previews.py
python sheets/crop_library_pdfs.py
```

Design: [`docs/AUDIO_STORAGE_AND_CACHE.md`](docs/AUDIO_STORAGE_AND_CACHE.md) (client ADR: [`../docs/decisions/audio-storage-cache.md`](../docs/decisions/audio-storage-cache.md)).

### AWS / weekly production refresh

**Target:** Lambda talks only to **`singtags-prod`** (ephemeral `/tmp` scratch per tag — no EFS, no second bucket). Design: [`docs/WEEKLY_PROD_SYNC.md`](docs/WEEKLY_PROD_SYNC.md).

**Interim (this machine):**

```bash
# from website repo root
./deploy/weekly_prod.sh
```

Legacy Terraform notes: [`docs/WEEKLY_LAMBDA_SYNC.md`](docs/WEEKLY_LAMBDA_SYNC.md).

---

## Sync jobs (`mirror/`)

### A. `python mirror/sync.py --bulk-meta`

ONE `api.php?n=50000` → refresh every `metadata.json`. No sheet/MP3/OCR/ASR.

### B. `python mirror/sync.py --repair` / `--frontier` / `--ids`

Per tag: skip-if-complete → fetch missing assets → normalize → audio layout/align → Opus tiers → primary lyrics (never overwrite `lyrics_source=manual`).

### C. Local backfills

```bash
python mirror/sync.py --ocr-backfill
python mirror/sync.py --asr-backfill
```

### D. Weekly Lambda

`mirror/lambda_sync.py` via Step Functions. Deploy: `infra/scripts/`.

---

## Naming

- **Folder:** `{name} ({key}) - {arranger} - {tag_id}` (omit unknown arranger/key — never `Unknown`)
- **Files:** `{name} ({key}) - {arranger} - {Bass|Bari|Lead|Tenor|Mix|Sheet}.{ext}`
- Apostrophes stripped; ♭/♯ → `b`/`#`
- **Identity:** `identity_key` / `identity_hash` in `metadata.json`
