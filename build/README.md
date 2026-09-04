# Build

Derive SPA catalog artifacts from `library/` (no media copy/remux). Scripts import helpers from `sync/lib/` (activate any Python 3 env that can import that tree; typically run from repo root after `sync/` install).

Full when-to-run rules: [`../docs/publish.md`](../docs/publish.md).

## Scripts

| Script | Writes | When |
| --- | --- | --- |
| `build_indexes.py` | `web/public/indexes/core.json.gz`, `lyrics.json.gz`, `expansions.json`; `web/public/tags/{id}/metadata.json` | Catalog-facing `library/` changes (new tags, metadata, lyrics, media presence) |
| `build_offline_manifest.py` | `web/public/indexes/offline-sheets.json.gz`, `offline-audio.json.gz` | After indexes, when offline pack membership/sizes should refresh |

**Order:** indexes first (creates `tags/`), then offline manifests.  
**Website deploy does not run these** — it only uploads whatever is already under `web/public/` → `dist/`.

Tags with **no sheet and no learning-track audio** are omitted from indexes / per-tag JSON. Quarantine empty folders:

```bash
python3 sync/mirror/quarantine_unavailable.py
```

## Commands

```bash
# From repo root — requires ./library populated (via sync/ or copy)
python3 build/build_indexes.py
python3 build/build_offline_manifest.py

# Explicit paths
python3 build/build_indexes.py \
  --library ./library \
  --out web/public/indexes \
  --tags-out web/public/tags
```

## Outputs & git

| Path | Role | Git |
| --- | --- | --- |
| `web/public/indexes/*.json.gz` (+ `expansions.json`) | Browse/search + offline pack lists | Usually **committed** (cold start) |
| `web/public/tags/{id}/metadata.json` | Slim per-tag detail for the SPA | **Gitignored** — rebuild locally |

Media paths inside artifacts are library-relative so the SPA can fetch from `VITE_MEDIA_BASE` (dev default `/library`).
