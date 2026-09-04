# Weekly Lambda mirror sync (parked)

**Status:** Not used for SingTags production. Prefer the **single-bucket workstation job**: [`WEEKLY_PROD_SYNC.md`](WEEKLY_PROD_SYNC.md) + [`../../deploy/weekly_prod.sh`](../../deploy/weekly_prod.sh).

This document describes the older Terraform + container Lambda sketch under `sync/infra/`. That design assumed a **separate** private S3/CloudFront mirror and a `/tmp` library tree. It does not match www.singtags.com (public `singtags-prod`, ~11 GB `library/`). Keep the code for reference; do not deploy it expecting it to refresh production.

---

Optional AWS job that runs the same frontier / enrich / assets / OCR / light ASR pipeline as local `mirror/sync.py`, on a schedule — **if** you later attach a large persistent volume (EC2/EFS) and point it at the **same** prod bucket. Until then, use the workstation script.

## Defaults (sketch)

| Choice | Value |
| --- | --- |
| Auth | `AWS_PROFILE` / standard AWS env credentials |
| Schedule | EventBridge → **Step Functions** → container Lambda |
| Origin down | Lambda exits fast with `retry_origin`; SFN **Wait**s 1h, up to 24 attempts |
| Packaging | ECR **container image** (Tesseract/RapidOCR + faster-whisper `small.en`) |
| Region | `us-east-1` |

No long sleeps inside Lambda (15‑minute cap).

## Why this is parked for SingTags

1. Prod media already lives on **public** `singtags-prod` / `library/` — a second mirror bucket adds confusion, not value.
2. Full `library/` is multi‑GB; Lambda ephemeral storage cannot be the source of truth.
3. `lambda_sync.py` does not upload into the SingTags website layout (`library/` + `indexes/` + `tags/`).
4. Index rebuild (`build/build_indexes.py`) walks the local library tree; that belongs on the machine (or disk) that holds `library/`.

## If revisiting AWS later

- Run [`weekly_prod.sh`](../../deploy/weekly_prod.sh) on **EC2/Lightsail** with an EBS volume for `library/`.
- IAM: write only to `singtags-prod` (same prefixes as `deploy/`).
- Optional: still use Step Functions for origin-down retries around a thin wrapper — not a second bucket.

Entrypoint sketch: [`mirror/lambda_sync.py`](../mirror/lambda_sync.py). Infra: [`../infra/`](../infra/).
