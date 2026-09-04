# Weekly production refresh (single bucket)

**Decision:** SingTags uses **one** public S3 bucket (`singtags-prod`). Weekly work adds media under `library/`, rebuilds SPA indexes, and publishes website + library. There is **no** second “mirror” bucket in the product path.

**Why not the Terraform Lambda + private bucket?** Local `library/` is ~11 GB. Lambda `/tmp` cannot hold it, and `mirror/lambda_sync.py` today only writes a local tree — it never uploads to SingTags prod. Keep `sync/infra/` as a parked sketch; do not deploy it for www.singtags.com.

## Where data lives

| Location | Role |
| --- | --- |
| Workstation `library/` | Source of truth for media + `_state/` (sync cursors, lyric queue) |
| `s3://singtags-prod/library/` | Same tree, public for the PWA |
| `s3://singtags-prod/` (site root) | SPA, `indexes/`, `tags/{id}/metadata.json` |

Cloudflare points at this bucket’s website endpoint (see [docs/setup.md](../../docs/setup.md)).

## Weekly job (what actually runs)

Orchestrator: [`../../deploy/weekly_prod.sh`](../../deploy/weekly_prod.sh)

```
1. sync/  — bulk-meta + frontier (new/missing assets, Opus tiers, light OCR/ASR)
2. build/ — build_indexes.py + build_offline_manifest.py
3. deploy/ — publish.sh library, then publish.sh website  →  same S3_BUCKET
```

Typical unattended run (cron / systemd timer on the machine that already has `library/`):

```bash
cd /path/to/singtags
./deploy/weekly_prod.sh
```

Useful flags / env:

| Flag / env | Meaning |
| --- | --- |
| `--skip-sync` | Only rebuild indexes + publish (library already updated) |
| `--sync-only` | Mirror only; no indexes / no S3 |
| `--miss-limit N` | Frontier miss streak (default `200`) |
| `DRY_RUN=1` | Pass through to `aws s3 sync --dryrun` |
| `SKIP_BUILD=1` | Reuse existing `web/dist` on website publish |
| `.env.deploy` | `S3_BUCKET=singtags-prod` (required for publish steps) |

Manual equivalent (same order as [docs/publish.md](../../docs/publish.md)):

```bash
cd sync && source .venv/bin/activate
python mirror/sync.py --bulk-meta
python mirror/sync.py --frontier --miss-limit 200

cd ..
python3 build/build_indexes.py
python3 build/build_offline_manifest.py
./deploy/publish.sh library
./deploy/publish.sh website
```

## Origin care (unchanged)

- Metadata: **one** `api.php?n=50000` bulk export (`--bulk-meta`)
- Assets: `dbaction` sheet/MP3 downloads — OK
- Never scrape per-tag HTML pages

## If you later want cloud-scheduled (still one bucket)

| Option | Fits? | Notes |
| --- | --- | --- |
| **This workstation + cron** | **Yes — preferred** | Already has the 11 GB tree; script above |
| EC2 / Lightsail + EBS holding `library/` | Yes | Run the same script; IAM → `singtags-prod` only |
| ECS/Fargate + EFS | Yes | Same pipeline; costlier |
| Lambda container alone | **No** | Cannot host full library; index build walks local folders |

Do **not** invent a second bucket “for sync state.” Put `_state/` under `library/_state/` (already synced by `library_s3.sh`).

## Related

- Deploy SSOT: [docs/publish.md](../../docs/publish.md)
- Mirror CLI: [../README.md](../README.md)
- Parked Lambda sketch: [WEEKLY_LAMBDA_SYNC.md](WEEKLY_LAMBDA_SYNC.md) (not used for prod)
