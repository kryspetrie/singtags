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
 */
export const ARCH_GOD_FILE_BUDGET: Readonly<Record<string, number>> = {
  'views/SingTogetherView.vue': 4810,
  'components/SheetViewer.vue': 2666,
  'views/HomeView.vue': 3450,
  'views/OpticalTransferView.vue': 2400,
  'components/TagPlayer.vue': 2300,
  'views/LocalLibraryView.vue': 2250,
  'views/TagView.vue': 2130,
  'stores/preferences.ts': 2260, // + Detected interest + scoring Tweaks JSON
  'views/SettingsView.vue': 1750,
  'views/FavoritesView.vue': 1750,
  'App.vue': 1700,
  'views/RecorderSessionView.vue': 1600,
  'views/PitchPipeView.vue': 1590,
  'views/LocalDocView.vue': 1500,
  'views/TagRollEditorView.vue': 3290, // + Fill parts fixes
  'stores/tagRoll.ts': 2860, // + page view zoom + chord mark style
  'components/arranging/useArrangingCoachDock.ts': 1690, // Open Choose seed match + filter reset
  'components/arranging/ArrangingCoachDock.vue': 1170, // Keychange panel on Polish (K6)
  'components/arranging/ArrangingCoachSuggestPanel.vue': 810,
  'components/arranging/ArrangingPathOptimize.vue': 890,
  'domain/arranging/harmonize/candidateRanker.ts': 880,
  'domain/arranging/pathOptimize/optimize.ts': 870,
  'domain/arranging/strongRootPriors.generated.ts': 1520,
  'lib/tagRoll/harmonySketch.ts': 1050, // + trySketchQualityFromNature
  'stores/arrangement.ts': 960, // soft Suggest context (Sketch/Detected fallback)
  'components/tagRoll/TagRollViewport.vue': 1600, // multi-part same-pitch color bands + z-order
  'views/WirelessTransferView.vue': 1200,
  'views/LocalPlaylistView.vue': 1150,
  'offline/resolveMedia.ts': 1050,
  'stores/localLibrary.ts': 1050,
  'views/RecorderTakeEditView.vue': 1000,
  'lib/rouletteDraw.ts': 950,
  'audio/pitchPlayer.ts': 950,
  'stores/offlineLibrary.ts': 950,
  'components/tagRoll/TagRollExpressionLane.vue': 970, // bottom-lane shell + shared time grid
  'components/tagRoll/TagRollMediaBar.vue': 1230, // lane toggles beside W/H + major/minor key optgroups
  'components/tagRoll/TagRollChordsPanel.vue': 2690, // + Split + home+melody passing labels
  'components/tagRoll/TagRollDeclaredLane.vue': 1180, // Sketch-lane typeahead + Chords edit emit
  'composables/useTagDetail.ts': 900,
  'views/RecorderView.vue': 900,
  'audio/player.ts': 850,
  'components/SearchChips.vue': 850,
  'components/SheetPianoDock.vue': 940, // min zoom fills viewport width
  'components/ScrubRail.vue': 800,
  'views/PitchPipeSoundLabView.vue': 800,
  'stores/catalog.ts': 830, // first-paint slice + deferred SearchEngine on hydrate
  'components/RouletteModeEditor.vue': 700,
  'offline/cacheManage.ts': 700,
  'components/tagRoll/TagRollToolbar.vue': 1220, // + page zoom controls
  // Sheet metadata/layout branch — grandfathered until carved into smaller modules.
  'components/tagRoll/TagRollSheetFormatPanel.vue': 1250, // + chord mark style Off/Span/Boxed
  'components/tagRoll/TagRollSheetViewport.vue': 1290, // + dpi×zoom re-engrave cache
  'lib/tagRoll/sheetScore/renderVexScore.ts': 1110,
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
