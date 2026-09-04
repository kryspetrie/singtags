# SingTags documentation

Static Vue SPA hosted on **S3** (public website). **Cloudflare** is for DNS + HTTPS (and later an optional Worker for vibe search) — not Pages.

## Start here

| Doc | Purpose |
| --- | --- |
| [setup.md](setup.md) | Domain + DNS + S3 from zero |
| [publish.md](publish.md) | Routine index build and S3 deploy |
| [status.md](status.md) | What’s shipped vs open work |
| [architecture.md](architecture.md) | App boundaries and performance practices |

## Decisions (ADRs)

Accepted product/tech choices that should not be re-litigated without new evidence:

→ [decisions/](decisions/README.md)

## Plans (not yet / residual work)

| Doc | Status |
| --- | --- |
| [plans/vibe-search.md](plans/vibe-search.md) | Planned — Workers AI |
| [plans/tag-roulette.md](plans/tag-roulette.md) | Proposed |
| [plans/virtual-piano.md](plans/virtual-piano.md) | Proposed |
| [plans/non-recombinable-tracks.md](plans/non-recombinable-tracks.md) | Mostly implemented — residual ops |

## Naming

- **kebab-case** file names (`setup.md`, `vibe-search.md`)
- **Runbooks** at `docs/` root
- **ADRs** under `docs/decisions/`
- **Feature / residual plans** under `docs/plans/`
