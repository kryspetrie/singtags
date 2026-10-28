# Mixed polecat verification checklist

Ground-truth charts: MusicXML under `polecats/mixed-musicxml/`, seeded as **Polecat mixed · …** in Tag Studio.

PDFs for visual compare: `polecats/mixed-musicxml/pdfs/`.

## Verified good (chord gold)

Two artifacts:

| Artifact | Location | Role |
|---|---|---|
| **Seed** | `web/public/tag-studio/polecat-mixed-seeds/{id}.json` | Authoritative TTBB notes |
| **Gold** | `web/src/domain/arranging/mixedChartGold/fixtures/{id}.json` | Per-Lead-onset chord labels |

A chart is **Verified good** when `verified: true` on the gold file (≥95% of stack onsets `locked`).

### Publish / regenerate auto-gold

```bash
cd web
npm run publish:polecat-mixed          # MusicXML → seeds (if sources changed)
npm run publish:mixed-chart-gold       # seeds → gold fixtures + ambiguity reports
```

Ambiguity reports: `mixedChartGold/fixtures/ambiguity/{id}.json`  
Human overrides: `polecats/mixed-musicxml/gold-overrides/{id}.json`

### Lock procedure (manual Alt / PDF)

1. Open ambiguity report for a pilot (`90001`, `90006`, `90011`).
2. For each unlocked onset, compare PDF / Detected Alt; pick the chart-correct `(rootPc, natureId)`.
3. Append to overrides:

```json
{
  "tagId": 90001,
  "overrides": [
    { "startTick": 1, "rootPc": 10, "natureId": "seventh", "labelSource": "pdf" }
  ]
}
```

4. Re-run `npm run publish:mixed-chart-gold` — overrides mark those onsets `locked`.
5. When `lockCoverage ≥ 0.95`, `verified` flips true (Phase 1+ CI floors can go hard).

Auto-lock already covers high-confidence stacks whose alts only differ by highway family (e.g. V7 vs V7(9)).

## Automated (CI / local)

```bash
cd web
npx vitest run src/lib/tagRoll/publishPolecatMixedSeeds.test.ts
npx vitest run src/lib/tagRoll/polecatMixedVerify.test.ts
npx vitest run src/lib/tagRoll/musicxmlImport.test.ts
npx vitest run src/domain/arranging/mixedChartGold/
```

Covers: TTBB explode import, smoke Detected/Fill, gold builder + fixture publish.

## Manual — three pilots

Use: **My Wild Irish Rose**, **Let Me Call You Sweetheart**, **Down By The Old Mill Stream**.

For each:

1. Open seed · play full mix — Tenor/Lead/Bari/Bass assigned; melody is Lead.
2. Clear Sketch · compare **Detected** to PDF for first 8–16 bars (Alt where ambiguous) → feed overrides.
3. Lock a selection → Sketch matches labels.
4. Delete Bari+Tenor for a phrase · **Fill parts** → empties filled; Bass/Lead unchanged; Results sensible.
5. Melody-only phrase copy · Fill → Sketch only, no invented stacks.
6. Chords **Suggest** on a held SMN — gold-ish chord appears.
7. Coach Potential issues on complete stacks — no OOV flood.
8. Realize with sparse Bass present — Bass preserved.

| Song | Gold lock | Detected | Fill sparse | Fill melody-only | Suggest | Coach | Realize |
|---|---|---|---|---|---|---|---|
| Irish Rose | | | | | | | |
| Sweetheart | | | | | | | |
| Mill Stream | | | | | | | |
