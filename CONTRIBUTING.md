# Contributing

SingTags is a static Vue SPA plus a Python mirror of [barbershoptags.com](https://barbershoptags.com). Production: [www.singtags.com](https://www.singtags.com).

## Tooling

| Need | Notes |
| --- | --- |
| Node.js + npm | `web/` — see `web/package.json` |
| Python 3 + venv | `cd sync && ./install.sh` → **`sync/.venv` only** (no repo-root venv) |
| `ffmpeg` | Audio tiers / ASR |
| `tesseract` (optional) | OCR fallback |
| AWS CLI | Deploy to S3 |

## Pipeline (short)

1. Populate **`library/`** with [`sync/`](sync/README.md) (origin care: **one** bulk `api.php` metadata export — never scrape per-tag HTML).
2. Rebuild SPA artifacts: `python3 build/build_indexes.py` then `python3 build/build_offline_manifest.py`.
3. Publish: `./deploy/publish.sh library` and/or `website` — or weekly `./deploy/weekly_prod.sh` (sync + indexes + both).

**Website deploy does not rebuild indexes.** Full rules: [docs/publish.md](docs/publish.md). Weekly single-bucket: [sync/docs/WEEKLY_PROD_SYNC.md](sync/docs/WEEKLY_PROD_SYNC.md).

## Local app

```bash
python3 build/build_indexes.py   # web/public/tags/ is gitignored
cd web && npm install && npm run dev
npm test                         # from web/
```

## Do not

- Delete `library/_state/` (lyric review queue and sync cursors live there)
- Hit barbershoptags.com with thousands of per-tag HTML page requests
- Deploy `sync/infra/`’s second mirror bucket — Lambda must use **prod S3 only** ([WEEKLY_PROD_SYNC](sync/docs/WEEKLY_PROD_SYNC.md))

## Docs map

| Doc | Use |
| --- | --- |
| [docs/publish.md](docs/publish.md) | Deploy SSOT |
| [sync/README.md](sync/README.md) | Mirror / OCR / Opus |
| [web/README.md](web/README.md) | SPA layout & commands |
| [docs/architecture.md](docs/architecture.md) | Module boundaries |
| [docs/status.md](docs/status.md) | Shipped vs open |
