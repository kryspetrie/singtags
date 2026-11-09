/**
 * Architecture guard: prevent new god modules and freeze growth of known oversized files.
 *
 * Soft product limit for *new* application modules. Existing offenders are
 * grandfathered at their recorded line count and may only shrink.
 *
 * @vitest-environment node
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import { fileURLToPath } from 'node:url'

const SRC_ROOT = fileURLToPath(new URL('..', import.meta.url))

/** Max lines for modules that are not on the grandfather list. */
export const ARCH_MAX_LINES_NEW = 800

/**
 * Known oversized modules (path relative to `web/src`). Values are the
 * maximum allowed lines — ratchet down when you extract, never up without an
 * explicit plan note.
 *
 * 2026-11-06: ceilings reset to the measured line count of files still over
 * 800. Modules that were extracted under the cap left this list. Do not raise
 * a number; shrink it when you extract.
 */
export const ARCH_GOD_FILE_BUDGET: Readonly<Record<string, number>> = {
  'views/SingTogetherView.vue': 4812,
  'views/HomeView.vue': 3506,
  'views/TagRollEditorView.vue': 3437,
  'components/tagRoll/TagRollChordsPanel.vue': 2691,
  'components/SheetViewer.vue': 2666,
  'views/OpticalTransferView.vue': 2337,
  'components/TagPlayer.vue': 2226,
  'views/LocalLibraryView.vue': 2209,
  'views/SettingsView.vue': 2170,
  'views/TagView.vue': 2147,
  'components/tagRoll/TagRollViewport.vue': 1868,
  'App.vue': 1714,
  'views/FavoritesView.vue': 1681,
  'components/arranging/useArrangingCoachDock.ts': 1679,
  'views/PitchPipeView.vue': 1595,
  'views/RecorderSessionView.vue': 1533,
  'domain/arranging/strongRootPriors.generated.ts': 1514,
  'components/tagRoll/TagRollMediaBar.vue': 1474,
  'views/LocalDocView.vue': 1439,
  'components/tagRoll/TagRollSheetViewport.vue': 1322,
  'components/tagRoll/TagRollToolbar.vue': 1274,
  'components/tagRoll/TagRollDeclaredLane.vue': 1181,
  'components/tagRoll/TagRollSheetFormatPanel.vue': 1178,
  'components/arranging/ArrangingCoachDock.vue': 1141,
  'views/WirelessTransferView.vue': 1131,
  'views/LocalPlaylistView.vue': 1115,
  'components/tagRoll/TagRollExpressionLane.vue': 969,
  'views/RecorderTakeEditView.vue': 965,
  'components/SheetPianoDock.vue': 931,
  'components/arranging/ArrangingPathOptimize.vue': 889,
  'views/RecorderView.vue': 843,
}

const SKIP_DIR = new Set([
  'node_modules',
  'test',
  'assets',
  'vendor',
])

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name.startsWith('.')) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      if (SKIP_DIR.has(name)) continue
      walk(full, out)
      continue
    }
    if (!/\.(ts|vue)$/.test(name)) continue
    if (/\.(test|spec)\.ts$/.test(name)) continue
    if (name.endsWith('.d.ts')) continue
    out.push(full)
  }
  return out
}

function countLines(path: string): number {
  const text = readFileSync(path, 'utf8')
  if (!text) return 0
  // Match `wc -l` for newline-terminated files.
  return text.endsWith('\n') ? text.split('\n').length - 1 : text.split('\n').length
}

describe('architecture: no god modules', () => {
  const files = walk(SRC_ROOT).map((abs) => ({
    abs,
    rel: relative(SRC_ROOT, abs).replace(/\\/g, '/'),
    lines: countLines(abs),
  }))

  it('lists every src module', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it('grandfather budgets only shrink (entries exist on disk)', () => {
    for (const rel of Object.keys(ARCH_GOD_FILE_BUDGET)) {
      const hit = files.find((f) => f.rel === rel)
      expect(hit, `missing grandfathered file ${rel}`).toBeTruthy()
    }
  })

  it('grandfathered god files do not grow past budget', () => {
    const offenders: string[] = []
    for (const f of files) {
      const budget = ARCH_GOD_FILE_BUDGET[f.rel]
      if (budget == null) continue
      if (f.lines > budget) {
        offenders.push(`${f.rel}: ${f.lines} > budget ${budget}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it(`non-grandfathered modules stay ≤ ${ARCH_MAX_LINES_NEW} lines`, () => {
    const offenders: string[] = []
    for (const f of files) {
      if (ARCH_GOD_FILE_BUDGET[f.rel] != null) continue
      // Generated / large data tables occasionally sit under lib — still count.
      if (f.lines > ARCH_MAX_LINES_NEW) {
        offenders.push(`${f.rel}: ${f.lines} lines (limit ${ARCH_MAX_LINES_NEW})`)
      }
    }
    expect(offenders).toEqual([])
  })
})
