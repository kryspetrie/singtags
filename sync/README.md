# Barbershop Tags Mirror

Local mirror and repair pipeline for [barbershoptags.com](https://barbershoptags.com).

## Where everything lives

Each top-level folder is an **independent tool** you can split out later. Shared code stays in `lib/` until that split.

| Directory | What it is | Live? | Requirements |
|-----------|------------|-------|--------------|
| [`mirror/`](mirror/README.md) | Sync / repair / Lambda / OCR / ASR | **Yes** — day-to-day + weekly Lambda | `mirror/requirements*.txt` |
| [`lyrics/`](lyrics/README.md) | Flagged lyric review GUI + batch | Human tool | Shared venv; see `lyrics/requirements.txt` |
| [`audio/`](audio/README.md) | Library-wide layout + Opus tier backfill | On demand | Shared venv; see `audio/requirements.txt` |
| [`sheets/`](sheets/README.md) | Sheet preview + PDF crop batch | On demand | Shared venv; see `sheets/requirements.txt` |
| [`infra/`](infra/scripts/README.md) | Terraform + deploy/publish shell scripts | When changing AWS | AWS CLI, Terraform, Docker |
| [`lib/`](lib/README.md) | Shared Python modules | — | (pulled in by tools above) |
| [`docs/`](docs/) | Design notes | Reference | — |
| `library/ (repo root)` | **Data** (tags + `_state/`) | — | — |

**Nothing at the repo root is a sync script anymore** — only `install.sh` (wrapper), `README.md`, `venv/`, and the folders above.

### Obsolete

| Thing | Status |
|-------|--------|
| Per-tag HTML metadata scrape | **Do not use** — crashes origin (no DB indexes). Use `mirror/sync.py --bulk-meta` |
| `lib/parse_tag_page.parse_tag_page()` | Unused leftover; URL helpers still live |
| Old root `scripts/` / `tools/` layout | Merged into the folders above |

---

## Setup

```bash
./install.sh                 # creates ./sync/.venv, installs mirror/requirements.txt
source ./.venv/bin/activate  # from sync/
# Library data: ../library (gitignored)
```

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
|---------|----------|
| **One** `api.php?n=50000` metadata export | Yes — preferred |
| Sheet / MP3 downloads (`dbaction.php`) | Yes |
| Per-tag `dbpage.php?pg=view&id=…` scrapes | **No** |

Tag `id` values are **pseudo-keys** and may change. Local folders correlate by `identity_key` (title + arranger + key + version + alt title + posted date).

### What a “tag” is locally

```
library/ (repo root){name} ({key}) - {arranger} - {tag_id}/
  metadata.json
  … - Sheet.pdf|.png
  … - {Bass|Bari|Lead|Tenor|Mix}.mp3
  … - *.playback.opus / *.ultra.opus / …
  … - Sheet.preview.webp
```

Cross-library state: `library/ (repo root)_state/` (bulk XML cache, sync cursor, catalog, **lyric review queue**, orphans, logs).

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
  build_catalog ──► _state/catalog.jsonl
```

---

## Day-to-day commands

```bash
source ./venv/bin/activate

python mirror/sync.py --bulk-meta
python mirror/sync.py --frontier --miss-limit 200
python mirror/sync.py --repair
python mirror/run_full_mirror.py
```

### Lyric review (resume your flagged queue)

Progress is in `_state/lyric_review_queue.json` (not in `lyrics/`). Continue with:

```bash
python lyrics/review_queue_gui.py
```

Full workflow: [`lyrics/README.md`](lyrics/README.md).

### Audio / sheets backfill

```bash
python audio/analyze_audio_layouts.py
python audio/encode_audio_tiers.py
python sheets/build_sheet_previews.py
python sheets/crop_library_pdfs.py
```

### AWS

```bash
export AWS_PROFILE=your-profile
cp infra/terraform.tfvars.example infra/terraform.tfvars
./infra/scripts/deploy.sh -y
./infra/scripts/lambda_publish.sh
```

Details: [`docs/AWS_STATIC_MIRROR_SITE.md`](docs/AWS_STATIC_MIRROR_SITE.md), [`infra/scripts/README.md`](infra/scripts/README.md).

---

## Sync jobs (mirror)

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
