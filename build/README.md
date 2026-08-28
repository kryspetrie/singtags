# Build

Derive SPA catalog artifacts from `library/` (no media copy/remux).

Tags with **no sheet and no learning-track audio** are treated as effectively
deleted on barbershoptags.com and are omitted from indexes / per-tag JSON.
To quarantine those library folders:

```bash
python3 sync/mirror/quarantine_unavailable.py
```

```bash
# From repo root — requires ./library populated
python3 build/build_indexes.py

# Explicit paths
python3 build/build_indexes.py \
  --library ./library \
  --out web/public/indexes \
  --tags-out web/public/tags
```

Writes:

- `web/public/indexes/core.json.gz`, `lyrics.json.gz`, `expansions.json`
- `web/public/tags/{id}/metadata.json` (slim SPA shape; media paths are library-relative)
