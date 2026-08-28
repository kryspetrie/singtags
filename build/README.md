# Build

Derive SPA catalog artifacts from `library/` (no media copy/remux).

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
