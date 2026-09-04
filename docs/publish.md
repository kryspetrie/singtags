# SingTags publish & deploy runbook

**Production:** [https://www.singtags.com](https://www.singtags.com) (Cloudflare → public S3 `singtags-prod`). Prefer www; redirect apex → www if needed.

**First time?** No domain or hosting yet → follow [setup.md](setup.md), then return here.

This is the **deploy SSOT**. Other READMEs point here; do not invent alternate command sequences.

---

## Canonical pipeline

Website deploy **does not** rebuild indexes or offline manifests. After changing `library/`, rebuild artifacts before (or with) website publish.

```
library/  (via sync/ or copy)
    │
    ├─► build/build_indexes.py
    │         → web/public/indexes/{core,lyrics}.json.gz, expansions.json
    │         → web/public/tags/{id}/metadata.json
    │
    ├─► build/build_offline_manifest.py   # requires tags/ from indexes
    │         → web/public/indexes/offline-{sheets,audio}.json.gz
    │
    ├─► ./deploy/publish.sh library       # media → s3://…/library/
    └─► ./deploy/publish.sh website       # SPA + indexes/tags already in web/public
```

| Situation | Run |
| --- | --- |
| App/CSS/PWA only | `./deploy/publish.sh website` |
| New/changed media for tags **already** in the catalog | `./deploy/publish.sh library` (rebuild offline manifests if pack membership changed) |
| New tags, metadata, lyrics, or “has media” changes | indexes → offline manifests → **library** then **website** (or `all`) |
| Local `npm run dev` after library catalog changes | `build_indexes.py` (+ manifests if testing offline packs) |

Typical after a local mirror sync that added tags:

```bash
python3 build/build_indexes.py
python3 build/build_offline_manifest.py
./deploy/publish.sh library
./deploy/publish.sh website
# or: ./deploy/publish.sh all
```

---

## Working library

Media lives in repo-root **`library/`** (gitignored). Populate it with [`../sync/`](../sync/README.md) (preferred) or by copying a workstation mirror — not a special “rsync product.” Lyric-review progress is in `library/_state/` — **never delete it**.

```bash
python3 build/build_indexes.py
python3 build/build_offline_manifest.py   # for Settings → Offline packs
cd web && npm install && npm run dev
```

**Git policy:** `web/public/indexes/*` (including offline manifests) is typically committed for cold start. `web/public/tags/` is **gitignored** — run `build_indexes.py` locally for per-tag detail JSON.

---

## Sync / enrich library

Full mirror docs: [`../sync/README.md`](../sync/README.md).

```bash
cd sync
./install.sh
source .venv/bin/activate   # always sync/.venv — there is no repo-root venv
python mirror/sync.py --bulk-meta
python lyrics/review_queue_gui.py   # continues queue in library/_state/
```

---

## S3: one production bucket

| System | Purpose |
| --- | --- |
| **SingTags production** (`singtags-prod` + Cloudflare) | Only bucket that matters for www — SPA at site root, media under `library/` |

**Weekly refresh** (same bucket): target = Lambda↔S3 only ([WEEKLY_PROD_SYNC](../sync/docs/WEEKLY_PROD_SYNC.md)); interim = [`../deploy/weekly_prod.sh`](../deploy/weekly_prod.sh) on a workstation.

---

## Deploy commands

Copy `deploy/.env.deploy.example` → `.env.deploy` if you use one. Or export vars inline.

```bash
./deploy/publish.sh website   # SPA + whatever indexes/tags are in web/dist
./deploy/publish.sh library   # library/ → s3://bucket/library/
./deploy/publish.sh all
./deploy/weekly_prod.sh       # weekly: sync → indexes → library + website

DRY_RUN=1 S3_BUCKET=your-bucket ./deploy/library_s3.sh
SKIP_BUILD=1 ./deploy/publish.sh website   # reuse existing web/dist
```

| Script | Uploads |
| --- | --- |
| `deploy/website_s3.sh` | `web/dist` (app, indexes, slim tag JSON) — **never** `library/` |
| `deploy/library_s3.sh` | `library/` |

| Env | Meaning |
| --- | --- |
| `S3_BUCKET` | Required |
| `S3_PREFIX` / `S3_LIBRARY_PREFIX` | Optional path prefixes |
| `VITE_BASE` / `VITE_MEDIA_BASE` | App base + public library URL at **build** time |
| `DEPLOY_ENV` | Alternate env file (default: repo-root `.env.deploy`) |
| `SKIP_BUILD=1` | Skip `npm run build`; require existing `web/dist` |
| `DRY_RUN=1` | `aws s3 sync --dryrun` |

Set `VITE_MEDIA_BASE` when media is not under the same-origin `/library` path.

After deploy, Cloudflare may cache assets; purge if a ship looks stale. Website publish uploads **hashed `/assets` first**, then `index.html`.

---

## Notes

Offline packs: [decisions/offline-library.md](decisions/offline-library.md). Audio tiers: [decisions/audio-storage-cache.md](decisions/audio-storage-cache.md) (client) and [`../sync/docs/AUDIO_STORAGE_AND_CACHE.md`](../sync/docs/AUDIO_STORAGE_AND_CACHE.md) (encoder).
