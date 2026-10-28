# Mixed chart gold (Verified good) — 2026-10

Phase 0 of the Verified-good mixed polecats plan (seed = TTBB notes; gold = locked onset labels).

## What shipped

- Domain module `web/src/domain/arranging/mixedChartGold/`
  - Types (`mixedChartGold.v1`)
  - `buildGoldFromChart` / `labelOnset` / `applyGoldOverrides` / ambiguity list
  - Auto-lock when confidence ≥ 0.55, ≥2 harmony parts, and alts share highway family
- Fixtures for pilots **90001 / 90006 / 90011**
- Override stubs under `polecats/mixed-musicxml/gold-overrides/`
- Ambiguity reports under `fixtures/ambiguity/`

## Next (Phase 1)

`detectedVsGold.test.ts` + `mixedGoldFloor.json` hard floors on **locked** onsets only.

## Non-goals

Do not inject gold pillars into `honestAutoFloor` / Lead-only Coach Auto.
