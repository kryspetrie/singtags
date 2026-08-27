# SingTags publish & deploy runbook

**First time?** No domain or hosting yet → follow [SETUP.md](SETUP.md) (Namecheap + Cloudflare Pages), then return here for routine publishes.

## Local sample (dev)

```bash
# From repo root — expand/rebuild sample from finalized library
python3 scripts/seed_sample.py --limit 250 --force
# Or refresh existing sample tags in place (keeps AAC remuxes; recopies Opus tiers):
# python3 scripts/seed_sample.py --refresh
python3 scripts/rasterize_sheets.py --force   # uses tags mirror venv if TAGS_MIRROR/venv exists
python3 scripts/build_indexes.py
python3 scripts/build_offline_manifest.py

cd web && npm install && npm run dev
```

Default library path: `/media/kpetrie/extradrive1/Barbershop/tags/Barbershop_Tags_Library`.

## Full-library publish

Point the same scripts at the full mirror (do not scrape origin):

```bash
LIB=/media/kpetrie/extradrive1/Barbershop/tags/Barbershop_Tags_Library
OUT=/path/to/publish-root

python3 scripts/seed_sample.py --library "$LIB" --dest "$OUT" --limit 8000 --force
/media/kpetrie/extradrive1/Barbershop/tags/venv/bin/python scripts/rasterize_sheets.py --sample "$OUT" --force
python3 scripts/build_indexes.py --sample "$OUT" --out web/public/indexes
python3 scripts/build_offline_manifest.py --sample "$OUT" --out web/public/indexes
```

`offline-sheets.json.gz` / `offline-audio.json.gz` drive the progressive Offline library packs in the PWA (see [decisions/offline-library.md](decisions/offline-library.md)). Audio tier layout (Original, 64k playback, 16k mono solos) is defined in [decisions/audio-storage-cache.md](decisions/audio-storage-cache.md) and the mirror `Barbershop/tags/docs/AUDIO_STORAGE_AND_CACHE.md`.

## Deploy targets

Copy `.env.deploy.example` → `.env.deploy` and fill in credentials. Or export vars inline.

```bash
./scripts/publish.sh s3       # Amazon S3 (+ optional CloudFront)
./scripts/publish.sh pages    # Cloudflare Pages
./scripts/publish.sh r2       # Cloudflare R2
```

Each target builds `web/` (unless `SKIP_BUILD=1`) and uploads with sensible Cache-Control headers.

### Amazon S3 + CloudFront

```bash
export S3_BUCKET=your-bucket
# optional folder inside the bucket (also sets Vite base automatically):
# export S3_PREFIX=singtags
export CLOUDFRONT_DISTRIBUTION_ID=EXXXXX   # optional invalidation
export SYNC_MEDIA=1                        # optional media sync
./scripts/deploy_s3.sh
```

Requires [AWS CLI](https://aws.amazon.com/cli/) and credentials (`aws configure` or `AWS_PROFILE`).

### Cloudflare Pages

```bash
npx wrangler login
npx wrangler pages project create singtags   # once
export CF_PAGES_PROJECT=singtags
./scripts/deploy_cloudflare_pages.sh
```

SPA fallback is provided by `web/public/_redirects`. Prefer hosting large media on R2 and setting `VITE_MEDIA_BASE` so Pages uploads stay small.

### Cloudflare R2

```bash
export R2_BUCKET=singtags
export R2_ACCOUNT_ID=your_account_id
export AWS_ACCESS_KEY_ID=…       # R2 API token
export AWS_SECRET_ACCESS_KEY=…
export SYNC_MEDIA=1
./scripts/deploy_r2.sh

# Media-only refresh later:
MEDIA_ONLY=1 SYNC_MEDIA=1 ./scripts/deploy_r2.sh
```

Uses the S3-compatible API (`aws --endpoint-url https://$R2_ACCOUNT_ID.r2.cloudflarestorage.com`). Attach a custom domain (or `*.r2.dev`) in the R2 dashboard for public reads.

### Split: Pages shell + R2 media

```bash
export VITE_MEDIA_BASE=https://media.example.com/sample-data
export CF_PAGES_PROJECT=singtags
./scripts/deploy_cloudflare_pages.sh          # SYNC_MEDIA unset

export R2_BUCKET=singtags-media
export R2_ACCOUNT_ID=…
MEDIA_ONLY=1 SYNC_MEDIA=1 SAMPLE_DATA=./sample-data ./scripts/deploy_r2.sh
```

### Cache headers (S3 / R2 scripts)

| Prefix | Cache-Control |
| --- | --- |
| `index.html` / shell | `max-age=300` |
| `assets/*` (hashed) | `max-age=31536000,immutable` |
| `indexes/*` | `max-age=3600` |
| `sample-data/*` media | `max-age=86400` |

### CloudFront (one-time)

1. Distribution origin = S3 bucket via **OAC**
2. ACM certificate in **us-east-1** for HTTPS custom domain
3. Custom error responses: 403/404 → `/index.html` (or `/$S3_PREFIX/index.html`) with HTTP 200 for Vue Router
4. No special COOP/COEP headers required. Browser encodes use `wasm-media-encoders` (LAME/Vorbis WASM hashed into `assets/`).

## Widget book (Storybook)

```bash
cd web && npm run storybook
```

Opens on http://localhost:6006 — stories under `SingTags/*` for EmptyState, SheetViewer, TagPlayer.

## Search by Vibe (planned)

Semantic “vibe” search via Cloudflare Workers AI is specified in [VIBE_SEARCH.md](VIBE_SEARCH.md). When implemented, the publish pipeline gains two offline steps before `build_indexes.py`:

```bash
python3 scripts/enrich_vibe.py      # sentiment + embeddings (local CF API token)
python3 scripts/build_vibe_index.py # → web/public/indexes/vibe.bin
```

Runtime AI calls use a Worker at `api.singtags.com` (not S3). See the spec for full setup.
