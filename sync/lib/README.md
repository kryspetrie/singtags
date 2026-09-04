# `lib/` — shared runtime (not a runnable tool)

Used by `mirror/`, `lyrics/`, `audio/`, and `sheets/`. When you split packages, carve modules with each consumer.

Paths: `config.py` sets `SITE_ROOT` = website repo root, `ROOT_DOWNLOAD_DIR` = `SITE_ROOT/library`, `STATE_DIR` = `library/_state`.

| Module | Used by | Role |
| --- | --- | --- |
| `config.py` | all | Paths, URLs, audio/OCR constants |
| `state.py` | all | `metadata.json`, `_state/`, folder index |
| `complete.py` | mirror, lyrics, audio, sheets | Sheet/audio presence, lyric trust checks |
| `http.py` | mirror, sheets | Downloads, backoff, hashing |
| `names.py` | mirror | Folder/file naming |
| `api.py` | mirror | Bulk `api.php` export |
| `identity.py` | mirror | `identity_key` matching |
| `parse_tag_page.py` | mirror | URL helpers (`download_file_url`, `tag_page_url`) |
| `lyric_choose.py` | lyrics (+ mirror finalize) | Review queue + pick/finalize |
| `lyric_proposals.py` | lyrics / ASR helpers | Normalization |
| `lyric_postprocess.py` | OCR | Cleanup (wired from extract_text) |
| `audio_layout.py` | mirror, audio | Stereo layout classify |
| `audio_align.py` | mirror, audio | ≥50 ms skew for mono_solos |
| `audio_tiers.py` | mirror, audio | Opus encode |
| `sheet_export.py` | mirror, sheets | Preview WebP + PDF crop |
| `catalog_fields.py` | mirror | Catalog row shaping |
| `lambda_runtime.py` | mirror Lambda | Deadline / ASR / retry env |
| `data/english_first_names.txt` | lyric scoring | Name prior |

OCR/ASR entrypoints live under `mirror/extract_*.py`, not here.
