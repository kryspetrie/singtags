# SingTags documentation

Static Vue SPA on **public S3** (website hosting). **Cloudflare** provides DNS + HTTPS (and later an optional Worker for vibe search) — not Pages.

**Live:** [https://www.singtags.com](https://www.singtags.com)

## Start here

| Doc | Purpose |
| --- | --- |
| [../CONTRIBUTING.md](../CONTRIBUTING.md) | Tooling + pipeline + origin care |
| [setup.md](setup.md) | Domain + DNS + S3 from zero |
| [publish.md](publish.md) | **Deploy SSOT** — indexes, manifests, website vs library |
| [status.md](status.md) | What’s shipped vs open work |
| [architecture.md](architecture.md) | App boundaries and performance practices |
| [../sync/README.md](../sync/README.md) | Library mirror / OCR / Opus tiers |
| [../web/README.md](../web/README.md) | SPA package README |
| [../build/README.md](../build/README.md) | Index + offline manifest builders |

## Decisions (ADRs)

Accepted product/tech choices that should not be re-litigated without new evidence:

→ [decisions/](decisions/README.md)

## Plans (not yet / residual)

| Doc | Status |
| --- | --- |
| [plans/vibe-search.md](plans/vibe-search.md) | Planned — Workers AI |
| [plans/tag-roulette.md](plans/tag-roulette.md) | Proposed |
| [plans/virtual-piano.md](plans/virtual-piano.md) | Proposed (pitch pipe + sound lab already ship) |
| [plans/non-recombinable-tracks.md](plans/non-recombinable-tracks.md) | Mostly implemented — residual spot-listen |
| [plans/local-library-transfer.md](plans/local-library-transfer.md) | Optical shipped; Phase C deferred |

Implemented plans (history only — phase tables are not open backlog): [sing-session-ux](plans/sing-session-ux.md), [sing-session-hardening](plans/sing-session-hardening.md), [product-honesty](plans/product-honesty.md), [local-library-hardening](plans/local-library-hardening.md), [sheet-qr-transfer](plans/sheet-qr-transfer.md) (catalog buttons demoted).

## Naming

- **kebab-case** file names (`setup.md`, `vibe-search.md`)
- **Runbooks** at `docs/` root
- **ADRs** under `docs/decisions/`
- **Feature / residual plans** under `docs/plans/`
