# `infra/scripts/` — AWS deploy helpers (parked)

**Not used for SingTags production.** Weekly refresh is the workstation script [`../../../deploy/weekly_prod.sh`](../../../deploy/weekly_prod.sh) against **one** public bucket — [`docs/WEEKLY_PROD_SYNC.md`](../../docs/WEEKLY_PROD_SYNC.md).

These scripts build/publish the **old** Terraform stack (separate private mirror bucket + Lambda). See [`docs/WEEKLY_LAMBDA_SYNC.md`](../../docs/WEEKLY_LAMBDA_SYNC.md).

## Scripts (sketch only)

| Script | Purpose |
| --- | --- |
| `_common.sh` | Shared env (sourced; not run directly) |
| `deploy.sh` | Full Terraform + image path |
| `infra_apply.sh` | Terraform apply |
| `lambda_build_push.sh` | `docker build` + ECR push |
| `lambda_publish.sh` | Build/push + update Lambda |
| `sync_site.sh` | Sync `_state` to the Terraform mirror bucket |

```bash
# Prefer instead:
./deploy/weekly_prod.sh
```
