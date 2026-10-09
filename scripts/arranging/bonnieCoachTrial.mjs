/**
 * Trial: pull "My Bonnie" from Tag Studio IndexedDB, run Classic Path Optimize,
 * write result back as a new Tag Studio project.
 *
 * Usage (Vite on :5173):
 *   node scripts/arranging/bonnieCoachTrial.mjs
 */
import { cpSync, existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SITE = resolve(__dirname, '../..')
const WEB = resolve(SITE, 'web')
const requireFromWeb = createRequire(resolve(WEB, 'package.json'))
const { chromium } = requireFromWeb('playwright')
const WORK = resolve(SITE, 'work/bonnie-coach-trial')
const PROFILE = resolve(WORK, 'pw-profile')
const CHROME_IDB = resolve(
  process.env.HOME,
  '.config/google-chrome/Default/IndexedDB/http_localhost_5173.indexeddb.leveldb',
)
const ORIGIN = 'http://localhost:5173'
const TITLE_MATCH = /My Bonnie Lies Over The Ocean/i

mkdirSync(WORK, { recursive: true })

async function withIdbPage(fn) {
  if (!existsSync(CHROME_IDB)) {
    throw new Error(`Chrome IndexedDB not found: ${CHROME_IDB}`)
  }
  rmSync(PROFILE, { recursive: true, force: true })
  mkdirSync(resolve(PROFILE, 'Default/IndexedDB'), { recursive: true })
  cpSync(
    CHROME_IDB,
    resolve(PROFILE, 'Default/IndexedDB/http_localhost_5173.indexeddb.leveldb'),
    { recursive: true },
  )
  // Minimal preferences so Chromium accepts the profile
  writeFileSync(
    resolve(PROFILE, 'Default/Preferences'),
    JSON.stringify({ profile: { name: 'bonnie-trial' } }),
  )

  const context = await chromium.launchPersistentContext(PROFILE, {
    channel: 'chrome',
    headless: true,
    args: ['--disable-extensions'],
  })
  try {
    const page = await context.newPage()
    await page.goto(`${ORIGIN}/tag-studio`, { waitUntil: 'domcontentloaded', timeout: 60_000 })
    // Give IDB a moment; app may also open the DB
    await page.waitForTimeout(500)
    return await fn(page)
  } finally {
    await context.close()
  }
}

async function listAndGetBonnie(page) {
  return page.evaluate(async (titleReSource) => {
    const titleRe = new RegExp(titleReSource, 'i')
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('singtags-tag-roll', 2)
        req.onerror = () => reject(req.error ?? new Error('idb open failed'))
        req.onsuccess = () => resolve(req.result)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('projects')) {
            db.createObjectStore('projects', { keyPath: 'id' })
          }
        }
      })
    }
    function reqToPromise(req) {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }
    const db = await openDb()
    const all = await reqToPromise(db.transaction('projects').objectStore('projects').getAll())
    const titles = all.map((p) => ({ id: p.id, title: p.title, updatedAt: p.updatedAt }))
    const matches = all
      .filter((p) => titleRe.test(String(p.title || '')))
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    return { titles, match: matches[0] ?? null, matchCount: matches.length }
  }, TITLE_MATCH.source)
}

async function putProject(page, project) {
  return page.evaluate(async (proj) => {
    function openDb() {
      return new Promise((resolve, reject) => {
        const req = indexedDB.open('singtags-tag-roll', 2)
        req.onerror = () => reject(req.error ?? new Error('idb open failed'))
        req.onsuccess = () => resolve(req.result)
      })
    }
    function reqToPromise(req) {
      return new Promise((resolve, reject) => {
        req.onsuccess = () => resolve(req.result)
        req.onerror = () => reject(req.error)
      })
    }
    const db = await openDb()
    await reqToPromise(db.transaction('projects', 'readwrite').objectStore('projects').put(proj))
    return { id: proj.id, title: proj.title }
  }, project)
}

async function extract() {
  return withIdbPage(async (page) => {
    const { titles, match, matchCount } = await listAndGetBonnie(page)
    writeFileSync(resolve(WORK, 'idb-titles.json'), JSON.stringify(titles, null, 2))
    if (!match) {
      throw new Error(`No project matching ${TITLE_MATCH}. Titles: ${titles.map((t) => t.title).join(' | ')}`)
    }
    writeFileSync(resolve(WORK, 'bonnie-source.json'), JSON.stringify(match, null, 2))
    console.log(`Extracted: ${match.title} (${match.id}) among ${matchCount} Bonnie matches`)
    return match
  })
}

async function runCoach(sourcePath) {
  const { createServer } = requireFromWeb('vite')
  const server = await createServer({
    root: WEB,
    server: { middlewareMode: true },
    appType: 'custom',
    configFile: resolve(WEB, 'vite.config.ts'),
  })
  try {
    const mod = async (rel) => server.ssrLoadModule(rel)
    const { normalizeTagRollProject } = await mod('/src/lib/tagRoll/normalize.ts')
    const { tagStudioToArrangement, mergeArrangementIntoTagRoll } = await mod(
      '/src/application/arranging/syncTagRoll.ts',
    )
    const { inferPillars, confirmAllPillars } = await mod('/src/application/arranging/InferPillars.ts')
    const { pathOptimize } = await mod('/src/application/arranging/PathOptimize.ts')
    const { createSequentialIdGenerator } = await mod(
      '/src/adapters/arranging/persistence/systemServices.ts',
    )
    const { newTagRollProjectId } = await mod('/src/lib/tagRoll/ids.ts')

    const raw = JSON.parse(readFileSync(sourcePath, 'utf8'))
    const source = normalizeTagRollProject(raw)
    if (!source) throw new Error('normalizeTagRollProject failed')

    const idGen = createSequentialIdGenerator()
    let arr = tagStudioToArrangement(source, idGen)
    // Melody + key only: clear existing harmony stacks; re-infer pillars from Lead.
    arr = {
      ...arr,
      stacks: [],
      pillars: [],
      title: source.title,
    }
    arr = confirmAllPillars({
      ...arr,
      pillars: inferPillars(arr, { idGen }),
    })

    const { project: optimized, report } = await pathOptimize(
      arr,
      {
        mode: 'full',
        scope: { kind: 'whole' },
        weights: { risk: 0, cadenceBias: 'moderate', taste: 'classic' },
        maxPasses: 12,
        skipProbe: true,
      },
      { idGen },
    )

    const now = Date.now()
    // Stable seed id so Tag Studio auto-import can refresh this trial.
    const outId = 'seed-coach-trial-bonnie-classic'
    const merged = mergeArrangementIntoTagRoll(source, optimized, idGen)
    const result = normalizeTagRollProject({
      ...merged,
      id: outId,
      title: 'My Bonnie — Coach Classic (trial)',
      subtitle: `From “${source.title}” · Path Optimize Classic taste`,
      sheetNote: `Coach trial ${new Date(now).toISOString()}. Changed stacks: ${report.changedCount}. ${report.message}`,
      createdAt: now,
      updatedAt: now,
      localEntryId: null,
    })
    if (!result) throw new Error('normalize result failed')

    writeFileSync(resolve(WORK, 'bonnie-coach-result.json'), JSON.stringify(result, null, 2))
    writeFileSync(
      resolve(WORK, 'bonnie-coach-report.json'),
      JSON.stringify(
        {
          sourceId: source.id,
          sourceTitle: source.title,
          resultId: result.id,
          resultTitle: result.title,
          tonality: result.tonality,
          preferFlats: result.preferFlats,
          melodyNotes: source.notes.filter((n) => {
            const lead =
              source.parts.find((p) => p.id === source.view.melodyPartId) ??
              source.parts.find((p) => p.name === 'Lead')
            return lead && n.partId === lead.id
          }).length,
          pillarCount: optimized.pillars.length,
          stackCount: optimized.stacks.length,
          report,
        },
        null,
        2,
      ),
    )
    console.log(
      `Coach done: pillars=${optimized.pillars.length} stacks=${optimized.stacks.length} ` +
        `changed=${report.changedCount} → ${result.title}`,
    )
    return result
  } finally {
    await server.close()
  }
}

function publishSeed(result) {
  const dir = resolve(WEB, 'public/tag-studio/coach-trials')
  mkdirSync(dir, { recursive: true })
  const file = 'bonnie-coach-classic.json'
  writeFileSync(resolve(dir, file), JSON.stringify(result, null, 2))
  writeFileSync(
    resolve(dir, 'index.json'),
    JSON.stringify(
      {
        projects: [
          {
            id: result.id,
            title: result.title,
            file,
          },
        ],
        count: 1,
      },
      null,
      2,
    ),
  )
  console.log(`Published seed: /tag-studio/coach-trials/${file}`)
}

async function saveToStudio(result) {
  publishSeed(result)
  return withIdbPage(async (page) => {
    const saved = await putProject(page, result)
    console.log(`Wrote into trial profile IDB: ${saved.title} (${saved.id})`)
    return saved
  })
}

async function main() {
  const sourcePath = resolve(WORK, 'bonnie-source.json')
  const source = existsSync(sourcePath)
    ? JSON.parse(readFileSync(sourcePath, 'utf8'))
    : await extract()
  if (!existsSync(sourcePath)) {
    writeFileSync(sourcePath, JSON.stringify(source, null, 2))
  } else {
    console.log(`Reusing extracted source: ${source.title} (${source.id})`)
  }
  const result = await runCoach(sourcePath)
  await saveToStudio(result)
  console.log(`\nReload Tag Studio — look for: “${result.title}”`)
  console.log(`JSON backup: ${resolve(WORK, 'bonnie-coach-result.json')}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
