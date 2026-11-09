/**
 * Cold-load Browse chrome flash harness.
 *
 * Installs tracing before any app script, samples every rAF from first paint,
 * and records stack traces for non-top window.scrollTo calls.
 *
 * Usage:
 *   node scripts/verifyBrowseSearchTopFlash.mjs [url] [--reload]
 */
import { chromium, devices } from 'playwright'

const url = process.argv[2] || 'https://www.singtags.com/'
const doReload = process.argv.includes('--reload')
const sampleMs = Number(process.env.SAMPLE_MS || 4000)

/** @param {import('playwright').Page} page */
async function installTrace(page) {
  await page.addInitScript((durationMs) => {
    const w = window
    const state = {
      startedAt: Date.now(),
      scrolls: [],
      samples: [],
      maxY: 0,
      flashCount: 0,
      firstFlash: null,
      sampling: true,
    }
    w.__browseFlashTrace = state

    const headerBottom = () => {
      const header =
        document.querySelector('header') ||
        document.querySelector('.app-header') ||
        document.querySelector('[data-app-header]')
      return header ? header.getBoundingClientRect().bottom : 56
    }

    const sampleOnce = () => {
      const search = document.querySelector('.home .search-toolbar')
      const rail = document.querySelector('.home .jump-rail')
      const home = document.querySelector('.home')
      const searchRect = search?.getBoundingClientRect()
      const railRect = rail?.getBoundingClientRect()
      const hb = headerBottom()
      const searchStyle = search ? getComputedStyle(search) : null
      const railStyle = rail ? getComputedStyle(rail) : null
      const y = Math.round(w.scrollY || 0)
      if (y > state.maxY) state.maxY = y
      const searchVisible =
        !!search &&
        searchStyle?.visibility !== 'hidden' &&
        searchStyle?.display !== 'none' &&
        !!searchRect &&
        searchRect.bottom > hb + 2 &&
        searchRect.top < w.innerHeight
      const railVisible =
        !!rail &&
        railStyle?.visibility !== 'hidden' &&
        railStyle?.display !== 'none' &&
        !!railRect &&
        railRect.bottom > hb + 2 &&
        railRect.top < w.innerHeight
      // User-visible mid chrome: rail stuck under header, search not in view.
      const midChromeFlash =
        railVisible && !searchVisible && !!railRect && railRect.top <= hb + 8 && y > 8
      const row = {
        t: Date.now() - state.startedAt,
        y,
        searchVisible,
        railVisible,
        midChromeFlash,
        searchTop: searchRect ? Math.round(searchRect.top) : null,
        railTop: railRect ? Math.round(railRect.top) : null,
        headerBottom: Math.round(hb),
        pending: !!home?.classList.contains('search-top-pending'),
        midRestore: !!home?.classList.contains('mid-restore-pending'),
        browseReady: !!document.querySelector('.browse-body.ready'),
        hasAt: new URL(location.href).searchParams.has('at'),
      }
      state.samples.push(row)
      if (midChromeFlash) {
        state.flashCount += 1
        if (!state.firstFlash) state.firstFlash = row
      }
    }

    const pushScroll = (source, top) => {
      const yBefore = Math.round(w.scrollY || 0)
      let stack = ''
      try {
        stack = new Error().stack || ''
      } catch {
        /* ignore */
      }
      // Keep app frames only (drop this hook).
      const frames = stack
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => /HomeView|browse|virtual|router|scroll/i.test(l))
        .slice(0, 8)
      state.scrolls.push({
        t: Date.now() - state.startedAt,
        source,
        top: Math.round(Number(top) || 0),
        yBefore,
        frames,
      })
    }

    const origScrollTo = w.scrollTo.bind(w)
    w.scrollTo = (...args) => {
      let top = 0
      if (typeof args[0] === 'number') top = args[1]
      else if (args[0] && typeof args[0] === 'object') top = args[0].top ?? 0
      pushScroll('window.scrollTo', top)
      const ret = origScrollTo(...args)
      sampleOnce()
      return ret
    }
    const origScroll = w.scroll.bind(w)
    w.scroll = (...args) => {
      let top = 0
      if (typeof args[0] === 'number') top = args[1]
      else if (args[0] && typeof args[0] === 'object') top = args[0].top ?? 0
      pushScroll('window.scroll', top)
      const ret = origScroll(...args)
      sampleOnce()
      return ret
    }

    const loop = () => {
      if (!state.sampling) return
      sampleOnce()
      if (Date.now() - state.startedAt < durationMs) requestAnimationFrame(loop)
      else state.sampling = false
    }
    requestAnimationFrame(loop)
  }, sampleMs)
}

/** @param {import('playwright').Page} page */
async function readTrace(page) {
  // Wait for sampling window to finish.
  await page.waitForTimeout(sampleMs + 250)
  return page.evaluate(() => {
    const s = window.__browseFlashTrace
    return {
      href: location.href,
      maxY: s.maxY,
      flashCount: s.flashCount,
      firstFlash: s.firstFlash,
      sampleCount: s.samples.length,
      scrolls: s.scrolls,
      // Compact sample trail around interesting moments.
      samples: s.samples.filter(
        (row, i, arr) =>
          row.midChromeFlash ||
          row.y > 8 ||
          (i > 0 && arr[i - 1].y > 8 && row.y <= 8) ||
          row.pending ||
          row.midRestore ||
          (row.searchVisible && i < 5),
      ),
      finalY: Math.round(window.scrollY || 0),
    }
  })
}

function summarize(label, result) {
  console.log(`\n=== ${label} ===`)
  console.log(`url: ${result.href}`)
  console.log(`samples: ${result.sampleCount}; maxY: ${result.maxY}; finalY: ${result.finalY}`)
  console.log(`mid-chrome flash frames: ${result.flashCount}`)
  if (result.firstFlash) console.log('first flash:', JSON.stringify(result.firstFlash))
  if (result.samples?.length) {
    console.log('interesting samples:', JSON.stringify(result.samples.slice(0, 20)))
  }
  const midScrolls = result.scrolls.filter((s) => s.top > 24)
  console.log(`scrollTo top>24 count: ${midScrolls.length}`)
  for (const s of midScrolls.slice(0, 6)) {
    console.log(
      `  t=${s.t} top=${s.top} yBefore=${s.yBefore} frames=${JSON.stringify(s.frames)}`,
    )
  }
  // Group unique stack signatures.
  const sigs = new Map()
  for (const s of midScrolls) {
    const key = (s.frames || []).join(' | ') || '(no app frames)'
    sigs.set(key, (sigs.get(key) || 0) + 1)
  }
  if (sigs.size) {
    console.log('mid-scroll stack signatures:')
    for (const [k, n] of [...sigs.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`  ${n}x ${k}`)
    }
  }
  return {
    flash: result.flashCount > 0,
    maxY: result.maxY,
    midScrolls: midScrolls.length,
  }
}

async function runOnce(browser, label, targetUrl, reload) {
  const context = await browser.newContext({ ...devices['Pixel 7'] })
  const page = await context.newPage()
  // addInitScript runs on every document in this context (cold + reload).
  await installTrace(page)
  await page.goto(targetUrl, { waitUntil: 'commit', timeout: 60_000 })
  let result = await readTrace(page)
  let summary = summarize(`${label} cold`, result)
  if (reload) {
    await page.reload({ waitUntil: 'commit', timeout: 60_000 })
    result = await readTrace(page)
    summary = summarize(`${label} reload`, result)
  }
  await context.close()
  return summary
}

const browser = await chromium.launch({ headless: true })
try {
  const label =
    url.includes('127.0.0.1') || url.includes('localhost') ? 'local' : 'remote'
  const summary = await runOnce(browser, label, url, doReload)
  if (summary.flash) {
    console.log('\nRESULT: FAIL — mid-list chrome flash detected')
    process.exitCode = 2
  } else if (summary.maxY > 80 || summary.midScrolls > 0) {
    console.log(
      '\nRESULT: WARN — no lasting flash in this harness, but mid-list scrollTo activity occurred',
    )
    process.exitCode = 1
  } else {
    console.log('\nRESULT: PASS — no mid-chrome flash; no mid-list scrollTo')
  }
} finally {
  await browser.close()
}
