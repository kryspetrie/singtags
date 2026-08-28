# Legacy `scripts/` folder

Site tooling now lives at the repo root by job:

| Folder | Purpose |
|---|---|
| [`sync/`](../sync/) | Mirror / enrich `library/` (audio, sheets, lyrics, …) |
| [`build/`](../build/) | Build SPA indexes from `library/` |
| [`deploy/`](../deploy/) | Push website and/or library to S3 |

This directory is kept temporarily so old docs/commands still resolve; prefer the new roots.
