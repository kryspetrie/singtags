# `sheets/` — sheet preview & PDF crop (batch)

**Live vs one-off:** Sync downloads sheets and can build a preview when assets are fetched. Scripts here are **batch maintenance**.

Client sheet format: [`../../docs/decisions/sheets-format.md`](../../docs/decisions/sheets-format.md).

## Requirements

Shared venv (`sync/.venv`; `mirror/requirements.txt`). See [`requirements.txt`](requirements.txt).

```bash
cd sync && source ./.venv/bin/activate
```

## Scripts

### `build_sheet_previews.py`

```bash
python sheets/build_sheet_previews.py
python sheets/build_sheet_previews.py --force --limit 100
```

### `crop_library_pdfs.py`

```bash
python sheets/crop_library_pdfs.py
python sheets/crop_library_pdfs.py --force --dry-run
```

## Library code (shared)

`lib/sheet_export.py` (also used by `mirror/assets.py`)
