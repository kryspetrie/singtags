# Deploy

Independent S3 pushes for **SingTags production** (one public bucket + Cloudflare). Do not deploy `sync/infra/`’s separate mirror bucket for www — see [`../sync/docs/WEEKLY_PROD_SYNC.md`](../sync/docs/WEEKLY_PROD_SYNC.md).

**SSOT runbook:** [../docs/publish.md](../docs/publish.md) (pipeline, when to rebuild indexes). First-time hosting: [../docs/setup.md](../docs/setup.md).

Website deploy **does not** rebuild indexes. After catalog changes:

```bash
python3 build/build_indexes.py
python3 build/build_offline_manifest.py
./deploy/publish.sh library
./deploy/publish.sh website
```

| Command | What it uploads |
| --- | --- |
| `./deploy/website_s3.sh` | SPA + indexes + slim `/tags/{id}/metadata.json` — **never** `library/` |
| `./deploy/library_s3.sh` | `library/` → `s3://$S3_BUCKET/$S3_LIBRARY_PREFIX/` |
| `./deploy/publish.sh website\|library\|all` | Dispatcher |
| `./deploy/weekly_prod.sh` | Weekly: sync → indexes → library + website (same bucket) |

Website sync uploads **hashed `/assets` first**, then `index.html`.

Weekly single-bucket flow: [`../sync/docs/WEEKLY_PROD_SYNC.md`](../sync/docs/WEEKLY_PROD_SYNC.md).

```bash
S3_BUCKET=my-bucket ./deploy/website_s3.sh
S3_BUCKET=my-bucket ./deploy/library_s3.sh
DRY_RUN=1 S3_BUCKET=my-bucket ./deploy/library_s3.sh
SKIP_BUILD=1 ./deploy/publish.sh website
```

| Env | Meaning |
| --- | --- |
| `S3_BUCKET` | Required |
| `S3_PREFIX` / `S3_LIBRARY_PREFIX` | Optional prefixes |
| `VITE_BASE` / `VITE_MEDIA_BASE` | Baked into the SPA at build time |
| `DEPLOY_ENV` | Env file path (default: repo-root `.env.deploy`) |
| `SKIP_BUILD=1` | Reuse existing `web/dist` |
| `DRY_RUN=1` | Dry-run S3 sync |

Env template: [`./.env.deploy.example`](.env.deploy.example).

Canonical production host: **https://www.singtags.com**.
