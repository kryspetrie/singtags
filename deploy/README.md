# Deploy

Independent S3 pushes from this machine (Lambda can replace the library sync later).

| Command | What it uploads |
|---|---|
| `./deploy/website_s3.sh` | SPA + indexes + slim `/tags/{id}/metadata.json` — **never** `library/` |
| `./deploy/library_s3.sh` | `library/` → `s3://$S3_BUCKET/$S3_LIBRARY_PREFIX/` |
| `./deploy/publish.sh website\|library\|all` | Dispatcher |

```bash
# Website only
S3_BUCKET=my-bucket ./deploy/website_s3.sh

# Library only (resumable)
S3_BUCKET=my-bucket ./deploy/library_s3.sh

# Dry run
DRY_RUN=1 S3_BUCKET=my-bucket ./deploy/library_s3.sh
```

Env file: repo-root `.env.deploy` (see `.env.deploy.example` if present).
