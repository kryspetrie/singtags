# `lyrics/` — flagged lyric review

Human review for tags where automatic lyric picking is uncertain. **Not part of live sync.**

Manual lyrics (`lyrics_source=manual` / `lyrics_finalized`) are never overwritten by bulk-meta, OCR, or ASR.

## Progress (do not delete)

State lives under the working library, not in this folder:

| File | Purpose |
| --- | --- |
| `../library/_state/lyric_review_queue.json` | Flagged queue + cursor + resolved count |
| `../library/_state/lyric_suggestions.jsonl` | Confident picks for batch accept |
| `../library/_state/lyric_batch_cursor.json` | Batch paging resume |
| `../library/_state/lyric_suggestions_summary.json` | Last analyze stats |

(Paths relative to `sync/`. Absolute: website-repo `library/_state/`.)

Per-tag edits are written into each folder’s `metadata.json`.

## Requirements

Uses the shared `sync/.venv` (same as mirror):

```bash
cd sync && source ./.venv/bin/activate
# Pillow already in mirror/requirements.txt; tkinter is system Python
```

See [`requirements.txt`](requirements.txt) for the explicit deps this tool needs if split out.

## Workflow

```bash
cd sync && source ./.venv/bin/activate

# 1) Analyze / rebuild suggestions + flag queue
python lyrics/review_lyric_batch.py --analyze

# 2) Optional: batch-accept confident suggestions
python lyrics/review_lyric_batch.py
python lyrics/review_lyric_batch.py --from-cache

# 3) GUI for flagged tags (progress resumes from queue cursor)
python lyrics/review_queue_gui.py
# or: python lyrics/review_lyric_batch.py --review --gui
```

**GUI keys:** Enter save · Esc skip · Ctrl+Q quit · Page Up/Down pan sheet · Ctrl+A select lyrics

TTY review (no sheet window):

```bash
python lyrics/review_lyric_batch.py --review
```

## Scripts

| Script | Purpose |
| --- | --- |
| `review_lyric_batch.py` | Analyze, batch-accept, queue management |
| `review_queue_gui.py` | Tk GUI with sheet + editable lyrics |

## Library code (shared, under `lib/`)

| Module | Role |
| --- | --- |
| `lib/lyric_choose.py` | Source scoring, review queue, finalize |
| `lib/lyric_proposals.py` | ASR/OCR normalization helpers |
| `lib/lyric_postprocess.py` | OCR cleanup helpers |
