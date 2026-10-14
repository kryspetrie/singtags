# Import tag audio → Tag Studio

**Status:** Precompute + client import (2026-10-08)  
**Entry:** Tag page → **Import into Tag Studio**

## Precompute (preferred)

Batch YIN extract writes **into each tag folder** (next to `metadata.json`):

| File | Role |
| --- | --- |
| `pitch_stacks.json` | Timeline + nature guesses |
| `pitch_studio.json` | SingTags Tag Studio project JSON |
| `pitch_summary.txt` | Human-readable progression |

`metadata.json` gains `pitch_extract` + `parts.pitch_studio` / `parts.pitch_stacks`.  
`build/build_indexes.py` publishes `pitch_studio` (library-relative URL) on slim tag metadata.

```bash
cd sync && source .venv/bin/activate
python audio/extract_pitch_stacks.py --source ../polecats --force
python audio/extract_pitch_stacks.py --id 31 --force   # library sample
# then rebuild indexes so SPA metadata includes pitch_studio
python ../build/build_indexes.py
```

## Client behavior

1. If `detail.pitch_studio` is set → fetch JSON → import (fast).
2. Else live browser YIN on ultra_solo / stems (fallback).

## Code

| Piece | Path |
| --- | --- |
| Sync extract | `sync/lib/pitch_extract.py`, `sync/audio/extract_pitch_stacks.py` |
| Studio JSON builder | `sync/lib/pitch_studio_project.py` |
| Index emit | `build/build_indexes.py` → `pitch_studio` |
| Live YIN fallback | `web/src/lib/tagRoll/pitchExtract/*` |
| Use-case | `web/src/application/tagRoll/importTagAudioToStudio.ts` |
| UI | `TagView.vue` |

## Limits

- Guide-track octaves ≠ engraved TTBB; user should edit.
- Mix-only tags unsupported.
- Full-library extract is a long batch — run incrementally (`--id` / `--limit`).
