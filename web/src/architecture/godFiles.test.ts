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
  'components/SheetViewer.vue': 2665,
  'views/HomeView.vue': 2650,
  'views/OpticalTransferView.vue': 2400,
  'components/TagPlayer.vue': 2300,
  'views/LocalLibraryView.vue': 2250,
  'views/TagView.vue': 2050,
  'stores/preferences.ts': 1917, // exclusive Mods/Coach bottom lane opener
  'views/SettingsView.vue': 1800,
  'views/FavoritesView.vue': 1750,
  'App.vue': 1700,
  'views/RecorderSessionView.vue': 1600,
  'views/PitchPipeView.vue': 1550,
  'views/LocalDocView.vue': 1500,
  'views/TagRollEditorView.vue': 1580, // detached coach transport intent bridge
  'components/arranging/useArrangingCoachDock.ts': 1071, // skip status + auto-propose after lock
  'components/arranging/ArrangingCoachDock.vue': 1172, // pillars panel extracted
  'stores/arrangement.ts': 892, // skipped home-root spans session registry
  'components/tagRoll/TagRollViewport.vue': 1411, // melody-pass dashed lines
  'stores/tagRoll.ts': 1326, // melodyPasses prune on delete
  'views/WirelessTransferView.vue': 1200,
  'views/LocalPlaylistView.vue': 1150,
  'offline/resolveMedia.ts': 1050,
  'stores/localLibrary.ts': 1050,
  'views/RecorderTakeEditView.vue': 1000,
  'lib/rouletteDraw.ts': 950,
  'audio/pitchPlayer.ts': 950,
  'stores/offlineLibrary.ts': 950,
  'components/tagRoll/TagRollExpressionLane.vue': 946, // exclusive lane; collapsed via rail
  'components/tagRoll/TagRollMediaBar.vue': 1068, // major/minor key optgroups
  'composables/useTagDetail.ts': 900,
  'views/RecorderView.vue': 900,
  'audio/player.ts': 850,
  'components/SearchChips.vue': 850,
  'components/SheetPianoDock.vue': 898, // min zoom fills viewport width
  'components/ScrubRail.vue': 800,
  'views/PitchPipeSoundLabView.vue': 800,
  'views/OsShareTransferView.vue': 750,
  'stores/catalog.ts': 750,
  'components/RouletteModeEditor.vue': 700,
  'offline/cacheManage.ts': 700,
  'components/tagRoll/TagRollToolbar.vue': 848, // major/minor key optgroups
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
