# SingTags publish & deploy runbook

**First time?** No domain or hosting yet → follow [SETUP.md](SETUP.md) (Namecheap + Cloudflare Pages), then return here for routine publishes.

## Working library

Media lives in repo-root **`library/`** (gitignored). That tree is the source of truth for local testing and for S3 media sync. Lyric-review progress is in `library/_state/` — never delete it.

```bash
# Rebuild SPA indexes from the full library (no media remux)
python3 build/build_indexes.py

cd web && npm install && npm run dev
```

Optional offline pack manifests (if still used):

```bash
python3 build/build_offline_manifest.py
```

## Sync / enrich library

```bash
cd sync
./install.sh
source .venv/bin/activate
python mirror/sync.py --bulk-meta
python lyrics/review_queue_gui.py   # continues existing queue in library/_state/
```

## Deploy (two independent tracks)

Copy `.env.deploy.example` → `.env.deploy` if you use one. Or export vars inline.

```bash
# Website: SPA + indexes + /tags/{id}/metadata.json  (never uploads library/)
S3_BUCKET=your-bucket ./deploy/website_s3.sh

# Library: aws s3 sync ./library → s3://bucket/library/
S3_BUCKET=your-bucket ./deploy/library_s3.sh

# Either / both
./deploy/publish.sh website
./deploy/publish.sh library
./deploy/publish.sh all

DRY_RUN=1 S3_BUCKET=your-bucket ./deploy/library_s3.sh
```

| Script | Uploads |
|---|---|
| `deploy/website_s3.sh` | `web/dist` (app, indexes, slim tag JSON) |
| `deploy/library_s3.sh` | `library/` |

Set `VITE_MEDIA_BASE` to the public library URL when building the site (defaults to `/library` under the site prefix).

CloudFront invalidation is optional via `CLOUDFRONT_DISTRIBUTION_ID`.

**Later:** Lambda can replace `deploy/library_s3.sh` while keeping the same S3 prefix contract.

## Legacy notes

`scripts/seed_sample.py` and `sample-data/` were the old remux path. Prefer `library/` + `build/build_indexes.py`. Offline pack formats: [decisions/offline-library.md](decisions/offline-library.md). Audio tiers: [decisions/audio-storage-cache.md](decisions/audio-storage-cache.md) and `sync/docs/AUDIO_STORAGE_AND_CACHE.md`.
