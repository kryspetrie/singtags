# Weekly production refresh (single bucket)

**Decision:** SingTags uses **one** public S3 bucket (`singtags-prod`). That bucket is the **only durable store** for media, sync state, SPA indexes, and slim tag JSON. There is no second mirror bucket and no EFS / secondary library volume for syncing.

## Source of truth

| Location | Role |
| --- | --- |
| `s3://singtags-prod/library/` | Media + `library/_state/` (sync cursors, lyric queue, catalog) |
| `s3://singtags-prod/` (site root) | SPA, `indexes/`, `tags/{id}/metadata.json` |
| Workstation `library/` | **Interim** convenience copy for manual runs of today’s CLI — not required for the Lambda design |

Cloudflare → this bucket’s website endpoint ([docs/setup.md](../../docs/setup.md)).

## Target: Lambda ↔ prod S3 only

Weekly (or frontier) sync in AWS must:

1. Read/write **`s3://singtags-prod`** only (IAM scoped to that bucket).
2. **Not** mount EFS, not keep a persistent EC2 disk as the library mirror, not use a second S3 bucket.
3. Use Lambda **`/tmp` only as ephemeral scratch** for the tag(s) in flight (download → encode → upload → delete). Scratch is not a filesystem of record.

### Per-run shape

```
EventBridge → Step Functions (origin-down Wait retries)
    → Lambda container
         1. Get library/_state/sync_state.json (+ cached bulk export if present)
         2. ONE api.php bulk-meta (origin care)
         3. Frontier: for each missing/incomplete id
              - scratch /tmp/{tag}/  (only this tag)
              - fetch sheet/MP3 from origin
              - layout / Opus tiers / light OCR·ASR
              - PutObject → library/{folder}/…
              - wipe /tmp/{tag}/
         4. PutObject sync_state.json
         5. Refresh SPA artifacts on the same bucket:
              - Put tags/{id}/metadata.json for touched ids
              - Rebuild or patch indexes/ (core, lyrics, offline manifests)
                 without downloading the full media tree
```

### Index rebuild without a full local library

`build/build_indexes.py` today walks a disk tree. For Lambda, prefer one of:

| Approach | Notes |
| --- | --- |
| **A. Incremental (preferred)** | After each new/updated tag, emit slim `tags/{id}/metadata.json` and patch `indexes/*` from that tag’s metadata (+ known tier keys written during encode). |
| **B. Metadata-only full rebuild** | List/Get every `library/**/metadata.json` on S3 (small JSON only — not Opus/MP3), build indexes in memory /tmp, PutObject `indexes/` + `tags/`. |

Do **not** `aws s3 sync` the entire 11 GB tree into Lambda.

### Origin care (unchanged)

- Metadata: **one** `api.php?n=50000` export
- Assets: `dbaction` downloads — OK
- Never scrape per-tag HTML

### Gaps vs today’s code (implementation backlog)

| Today | Needed for S3-native Lambda |
| --- | --- |
| `sync/` assumes `ROOT_DOWNLOAD_DIR` on disk | Storage adapter: head/list/get/put under `s3://…/library/` |
| `lambda_sync.py` writes only local `/tmp/mirror` | Upload each completed tag to prod prefixes; load/save `_state` from S3 |
| `build_indexes.py` disk walk | Incremental or metadata-only S3 rebuild (above) |
| `sync/infra/` separate private bucket | Point at `singtags-prod`; drop mirror bucket / CloudFront SPA sketch |

Until that lands, use the **interim workstation bridge** below.

---

## Interim: workstation bridge (`weekly_prod.sh`)

Still valid for now: machine with a local `library/` runs sync CLI, then pushes into the **same** prod bucket.

```bash
./deploy/weekly_prod.sh
```

```
1. sync/  — bulk-meta + frontier (local disk)
2. build/ — indexes + offline manifests (local)
3. deploy/ — publish library + website → singtags-prod
```

| Flag / env | Meaning |
| --- | --- |
| `--skip-sync` | Indexes + publish only |
| `--sync-only` | Mirror only |
| `--miss-limit N` | Frontier miss streak (default `200`) |
| `DRY_RUN=1` / `SKIP_BUILD=1` / `.env.deploy` | Same as [docs/publish.md](../../docs/publish.md) |

Manual equivalent: [docs/publish.md](../../docs/publish.md).

This path **copies** local → S3; it does not change the rule that **prod S3 is authoritative** once Lambda is S3-native. After Lambda ships, workstation sync is optional (lyric GUI, heavy ASR backfill, debugging).

## Related

- Deploy SSOT: [docs/publish.md](../../docs/publish.md)
- Mirror CLI: [../README.md](../README.md)
- Legacy Terraform notes: [WEEKLY_LAMBDA_SYNC.md](WEEKLY_LAMBDA_SYNC.md)
