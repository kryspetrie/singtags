# `infra/scripts/` — AWS helpers (legacy sketch)

**Target:** weekly Lambda uses **`singtags-prod` only** — see [`docs/WEEKLY_PROD_SYNC.md`](../../docs/WEEKLY_PROD_SYNC.md). No second bucket, no EFS.

These scripts still assume the older Terraform private-mirror stack. Retarget or replace when implementing S3-native sync. Interim: [`../../../deploy/weekly_prod.sh`](../../../deploy/weekly_prod.sh).

| Script | Legacy purpose |
| --- | --- |
| `deploy.sh` / `infra_apply.sh` | Terraform apply |
| `lambda_build_push.sh` / `lambda_publish.sh` | ECR image + Lambda code |
| `sync_site.sh` | Push state to Terraform mirror bucket — **do not use for prod** |
