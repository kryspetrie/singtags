# Weekly Lambda (legacy infra notes)

**Target architecture:** Lambda works **directly against `singtags-prod`** with ephemeral `/tmp` scratch only — see [`WEEKLY_PROD_SYNC.md`](WEEKLY_PROD_SYNC.md). No second bucket, no EFS, no persistent library disk.

**This file** keeps notes on the older `sync/infra/` sketch (separate private bucket + CloudFront). Do not deploy that stack for www.singtags.com.

## What to reuse from the sketch

| Piece | Reuse? |
| --- | --- |
| Container image (OCR + `small.en` ASR + ffmpeg) | Yes — same runtime |
| Step Functions origin-down Wait loop | Yes — wrap the S3-native handler |
| EventBridge weekly schedule | Yes |
| Private mirror S3 + CloudFront OAC SPA | **No** |
| `MIRROR_ROOT=/tmp/mirror` as library of record | **No** — scratch per tag only |
| `sync_site.sh` → Terraform bucket | **No** |

## Env shape (target)

```
S3_BUCKET=singtags-prod          # prod only
S3_LIBRARY_PREFIX=library
S3_STATE_KEY=library/_state/sync_state.json
# /tmp used only for in-flight tag folders
```

Entrypoint today: [`mirror/lambda_sync.py`](../mirror/lambda_sync.py) (still local-tree oriented — needs S3 adapter work). Infra templates: [`../infra/`](../infra/) (retarget or replace).

## Interim

[`../../deploy/weekly_prod.sh`](../../deploy/weekly_prod.sh) on a workstation until the S3-native Lambda path exists.
