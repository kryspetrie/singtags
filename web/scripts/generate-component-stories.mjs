/**
 * Ensure every src Vue SFC has a colocated *.stories.ts for Storybook.
 * Skips files that already have a story (hand-curated stories are preserved).
 *
 * Usage: node scripts/generate-component-stories.mjs [--force]
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const webRoot = path.resolve(__dirname, '..')
const srcRoot = path.join(webRoot, 'src')
const force = process.argv.includes('--force')

/** Sensible Default args keyed by component basename (no .vue). */
const CURATED_ARGS = {
  ConfirmDialog: {
    open: true,
    title: 'Confirm',
    message: 'Are you sure?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
  },
  AboutDialog: { open: true },
  BrowseWelcomeDialog: { open: true },
  EmptyState: {
    title: 'Nothing here',
    message: 'Try another search or clear filters.',
    tone: 'muted',
  },
  ArrangingPathOptimize: {
    status: null,
    canRun: true,
    lastReport: null,
    hasSelection: false,
    hasCurrentMoment: false,
  },
  ArrangingReviewPolish: {},
  ArrangingCandidateWhy: {
    why: { summary: 'Sample why text for Storybook.', details: [] },
  },
  InfoTips: { tipId: 'storybook' },
  LabelPillsInput: { modelValue: ['demo'], placeholder: 'Add label' },
  ConfidenceStars: { value: 3 },
  PartConfidenceRate: { part: 'lead', value: 2 },
  ScrubRail: { value: 0.35, max: 1 },
  TagMyRating: { tagId: 1, rating: 3 },
  WaveformView: {
    peaks: Array.from({ length: 64 }, (_, i) => Math.sin(i / 6) * 0.5 + 0.5),
  },
}

function walkVueFiles(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, name.name)
    if (name.isDirectory()) walkVueFiles(full, out)
    else if (name.isFile() && name.name.endsWith('.vue')) out.push(full)
  }
  return out
}

function storyTitle(vueAbs) {
  const rel = path.relative(srcRoot, vueAbs).replace(/\\/g, '/')
  const noExt = rel.replace(/\.vue$/, '')
  if (noExt.startsWith('components/')) {
    return `Components/${noExt.slice('components/'.length)}`
  }
  if (noExt.startsWith('views/')) {
    return `Views/${noExt.slice('views/'.length)}`
  }
  return `App/${noExt}`
}

function defaultArgs(basename) {
  if (CURATED_ARGS[basename]) return CURATED_ARGS[basename]
  if (/(Dialog|Modal|Sheet|Overlay|Popover|Hud)$/.test(basename)) {
    return { open: true }
  }
  return {}
}

function formatArgs(args) {
  const json = JSON.stringify(args, null, 2)
  if (json === '{}') return '{}'
  return json.replace(/"([^"]+)":/g, '$1:').replace(/"/g, "'")
}

function storySource(vueAbs) {
  const basename = path.basename(vueAbs, '.vue')
  const title = storyTitle(vueAbs)
  const argsLiteral = formatArgs(defaultArgs(basename))
  return `import type { Meta, StoryObj } from '@storybook/vue3-vite'
import ${basename} from './${basename}.vue'

/**
 * Auto-generated visual smoke story. Prefer hand-curating args when this
 * component becomes a design surface; regenerate with --force only when
 * intentional.
 */
const meta = {
  title: '${title}',
  component: ${basename},
  tags: ['autodocs'],
  args: ${argsLiteral},
} satisfies Meta<typeof ${basename}>

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {}
`
}

const vueFiles = walkVueFiles(srcRoot).sort()
let written = 0
let skipped = 0

for (const vueAbs of vueFiles) {
  const storyAbs = vueAbs.replace(/\.vue$/, '.stories.ts')
  if (!force && fs.existsSync(storyAbs)) {
    skipped += 1
    continue
  }
  fs.writeFileSync(storyAbs, storySource(vueAbs), 'utf8')
  written += 1
}

console.log(
  `generate-component-stories: wrote ${written}, skipped existing ${skipped}, total vue ${vueFiles.length}`,
)
