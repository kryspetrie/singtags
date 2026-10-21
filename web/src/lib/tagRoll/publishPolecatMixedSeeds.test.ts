/**
 * @vitest-environment happy-dom
 *
 * Publish + smoke: MusicXML → public/tag-studio/polecat-mixed-seeds/
 * Run: npx vitest run src/lib/tagRoll/publishPolecatMixedSeeds.test.ts
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { parseTagRollMusicXml } from './musicxmlImport'
import type { TagRollProject } from './types'

const __dirname = dirname(fileURLToPath(import.meta.url))
const WEB_ROOT = resolve(__dirname, '../../..')
const SRC_DIR = resolve(WEB_ROOT, '../polecats/mixed-musicxml')
/** Hand-corrected Tag Studio charts. When present, they replace the MusicXML import. */
const OVERRIDE_DIR = resolve(SRC_DIR, 'tagroll-overrides')
const OUT_DIR = resolve(WEB_ROOT, 'public/tag-studio/polecat-mixed-seeds')

const CATALOG = [
  { tagId: 90001, file: 'MY WILD IRISH ROSE.musicxml.xml', title: 'My Wild Irish Rose' },
  {
    tagId: 90002,
    file: 'WAIT TILL THE SUN SHINES, NELLIE.musicxml.xml',
    title: 'Wait Till The Sun Shines, Nellie',
  },
  {
    tagId: 90003,
    file: 'SWEET AND LOVELY (THAT_S WHAT YOU ARE TO ME).musicxml.xml',
    title: "Sweet And Lovely (That's What You Are To Me)",
  },
  { tagId: 90004, file: 'DOWN OUR WAY.musicxml.xml', title: 'Down Our Way' },
  {
    tagId: 90005,
    file: 'HONEY LITTLE _LIZE MEDLEY.musicxml.xml',
    title: "Honey / Little 'Lize Medley",
  },
  {
    tagId: 90006,
    file: 'LET ME CALL YOU SWEETHEART.musicxml.xml',
    title: 'Let Me Call You Sweetheart',
  },
  {
    tagId: 90007,
    file: 'SWEET, SWEET ROSES OF MORN.musicxml.xml',
    title: 'Sweet, Sweet Roses Of Morn',
  },
  { tagId: 90008, file: 'SHINE ON ME.musicxml.xml', title: 'Shine On Me' },
  {
    tagId: 90009,
    file: 'THE STORY OF THE ROSE (HEART OF MY HEART).musicxml.xml',
    title: 'The Story Of The Rose',
  },
  {
    tagId: 90010,
    file: 'YOU_RE THE FLOWER OF MY HEART, SWEET ADELINE.musicxml.xml',
    title: "You're The Flower Of My Heart, Sweet Adeline",
  },
  {
    tagId: 90011,
    file: 'DOWN BY THE OLD MILL STREAM.musicxml.xml',
    title: 'Down By The Old Mill Stream',
  },
  {
    tagId: 90012,
    file: 'YOU TELL ME YOUR DREAM.musicxml.xml',
    title: 'You Tell Me Your Dream',
  },
] as const

describe('publishPolecatMixedSeeds', () => {
  it('converts all mixed MusicXML into Tag Studio seeds with TTBB parts', () => {
    mkdirSync(OUT_DIR, { recursive: true })
    const present = new Set(readdirSync(SRC_DIR))
    const index: {
      projects: Array<{
        id: string
        tagId: number
        title: string
        file: string
        notes: number
        parts: string[]
      }>
      count: number
    } = { projects: [], count: 0 }

    for (const entry of CATALOG) {
      expect(present.has(entry.file), `missing ${entry.file}`).toBe(true)
      const seedId = `seed-polecat-mixed-${entry.tagId}`
      const overridePath = join(OVERRIDE_DIR, `${entry.tagId}.json`)
      let project: TagRollProject
      if (existsSync(overridePath)) {
        project = {
          ...(JSON.parse(readFileSync(overridePath, 'utf8')) as TagRollProject),
          id: seedId,
          title: `Polecat mixed · ${entry.title}`,
          localEntryId: null,
        }
      } else {
        const xml = readFileSync(join(SRC_DIR, entry.file), 'utf8')
        const result = parseTagRollMusicXml(xml)
        expect(result.ok, `${entry.file} parse`).toBe(true)
        if (!result.ok) continue
        project = {
          ...result.project,
          id: seedId,
          title: `Polecat mixed · ${entry.title}`,
          localEntryId: null,
        }
      }

      const partNames = project.parts.map((p) => p.name)
      expect(partNames.slice(0, 4)).toEqual(['Tenor', 'Lead', 'Bari', 'Bass'])
      expect(project.notes.length).toBeGreaterThan(40)
      const outName = `${entry.tagId}.json`
      writeFileSync(join(OUT_DIR, outName), `${JSON.stringify(project, null, 2)}\n`)
      index.projects.push({
        id: seedId,
        tagId: entry.tagId,
        title: project.title,
        file: outName,
        notes: project.notes.length,
        parts: partNames,
      })
    }

    index.count = index.projects.length
    writeFileSync(join(OUT_DIR, 'index.json'), `${JSON.stringify(index, null, 2)}\n`)
    expect(index.count).toBe(12)
  })
})
