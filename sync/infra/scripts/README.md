# `infra/scripts/` — AWS deploy helpers (mirror Lambda)

**Live sync runtime** is the Lambda image built from [`mirror/`](../../mirror/) (`lambda_sync.py`, `sync.py`, …). These shell scripts only **build, publish, and apply infra**. Terraform lives in [`infra/`](../) (parent of this folder).

Full walkthrough: [`docs/WEEKLY_LAMBDA_SYNC.md`](../../docs/WEEKLY_LAMBDA_SYNC.md).

**SingTags website/media publish** uses [`../../../deploy/`](../../../deploy/) — see [`../../../docs/publish.md`](../../../docs/publish.md).

## Scripts

| Script | Purpose |
| --- | --- |
| `_common.sh` | Shared env (sourced; not run directly) |
| `deploy.sh` | First-time or full deploy (bootstrap → build → apply → publish) |
| `infra_apply.sh` | Terraform apply (`--bootstrap` = ECR/S3/CF without Lambda) |
| `lambda_build_push.sh` | `docker build` + ECR push (bakes Whisper `small.en`) |
| `lambda_publish.sh` | Build/push + `update-function-code` + version + `live` alias |
| `sync_site.sh` | Sync `library/_state` (and optional media) to the **mirror** Terraform bucket |

## Typical flow

```bash
cd sync
export AWS_PROFILE=your-profile
cp infra/terraform.tfvars.example infra/terraform.tfvars

./infra/scripts/deploy.sh -y          # full path
# or piecemeal:
./infra/scripts/infra_apply.sh --bootstrap -y
./infra/scripts/lambda_build_push.sh
./infra/scripts/infra_apply.sh -y
./infra/scripts/lambda_publish.sh

./infra/scripts/sync_site.sh          # push state/catalog to the mirror bucket
```

Code-only update after infra exists:

```bash
./infra/scripts/deploy.sh --publish-only
# or
./infra/scripts/lambda_publish.sh
```
