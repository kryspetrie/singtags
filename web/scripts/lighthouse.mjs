#!/usr/bin/env node
/**
 * Lightweight Lighthouse smoke against a running preview server.
 * Usage: npm run build && npm run preview &; npm run lighthouse
 */
import { spawn } from 'node:child_process'
import { createServer } from 'node:net'

async function waitForPort(port, ms = 30000) {
  const start = Date.now()
  while (Date.now() - start < ms) {
    const ok = await new Promise((resolve) => {
      const s = createServer()
      s.once('error', () => resolve(false))
      s.once('listening', () => {
        s.close()
        resolve(true)
      })
      s.listen(port, '127.0.0.1')
    })
    if (!ok) return
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Port ${port} never became busy`)
}

const port = 4173
const preview = spawn('npm', ['run', 'preview', '--', '--host', '127.0.0.1', '--port', String(port)], {
  stdio: 'inherit',
  shell: true,
})

try {
  // Wait until something is listening
  const start = Date.now()
  while (Date.now() - start < 45000) {
    const free = await new Promise((resolve) => {
      const s = createServer()
      s.once('error', () => resolve(false))
      s.once('listening', () => {
        s.close(() => resolve(true))
      })
      s.listen(port, '127.0.0.1')
    })
    if (!free) break
    await new Promise((r) => setTimeout(r, 250))
  }

  const urls = [`http://127.0.0.1:${port}/`, `http://127.0.0.1:${port}/tag/4011`]
  for (const url of urls) {
    console.log(`\n=== Lighthouse ${url} ===`)
    await new Promise((resolve, reject) => {
      const lh = spawn(
        'npx',
        [
          '--yes',
          'lighthouse',
          url,
          '--quiet',
          '--chrome-flags=--headless --no-sandbox',
          '--only-categories=performance,accessibility,best-practices',
          '--output=json',
          '--output-path=stdout',
        ],
        { shell: true },
      )
      let out = ''
      lh.stdout.on('data', (d) => {
        out += d
      })
      lh.stderr.on('data', (d) => process.stderr.write(d))
      lh.on('close', (code) => {
        if (code !== 0) return reject(new Error(`lighthouse exit ${code}`))
        try {
          const report = JSON.parse(out)
          const cats = report.categories
          for (const [k, v] of Object.entries(cats)) {
            console.log(`${k}: ${Math.round(v.score * 100)}`)
          }
          resolve()
        } catch (e) {
          reject(e)
        }
      })
    })
  }
} finally {
  preview.kill('SIGTERM')
}
