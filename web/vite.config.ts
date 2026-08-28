import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { defineConfig, type Plugin } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const rootDir = path.dirname(fileURLToPath(import.meta.url))
const libraryDir = path.resolve(rootDir, '..', 'library')

type NextFn = (err?: unknown) => void
type ConnectMw = (req: IncomingMessage, res: ServerResponse, next: NextFn) => void

/** Site root path, e.g. `/` or `/singtags/`. Set via VITE_BASE when deploying under a prefix. */
function viteBase(): string {
  const raw = process.env.VITE_BASE?.trim() || '/'
  if (raw === '/') return '/'
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`
}

const LIBRARY_MIME: Record<string, string> = {
  '.opus': 'audio/ogg',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.wav': 'audio/wav',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
}

/**
 * Serve repo `library/` at `/library` during vite dev/preview.
 *
 * Do not use sirv here: it mishandles `#` in filenames (common in keys like "F# Major")
 * after decoding `%23`, so those tracks 404 even when the file exists.
 * Missing files must 404 (not SPA HTML) so offline packs never cache index.html as audio.
 */
function serveLibraryPlugin(): Plugin {
  const root = path.resolve(libraryDir)

  const middleware: ConnectMw = (req, res, _next) => {
    try {
      const raw = req.url || '/'
      const q = raw.indexOf('?')
      const pathname = q >= 0 ? raw.slice(0, q) : raw
      let decoded: string
      try {
        decoded = decodeURIComponent(pathname)
      } catch {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Bad path')
        return
      }
      const rel = decoded.replace(/^\/+/, '')
      if (!rel || rel.split(/[/\\]/).some((p) => p === '..')) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Bad path')
        return
      }
      const abs = path.resolve(root, rel)
      if (abs !== root && !abs.startsWith(root + path.sep)) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Forbidden')
        return
      }
      let st: fs.Stats
      try {
        st = fs.statSync(abs)
      } catch {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Not found')
        return
      }
      if (!st.isFile()) {
        res.statusCode = 404
        res.setHeader('Content-Type', 'text/plain; charset=utf-8')
        res.end('Not found')
        return
      }
      const ext = path.extname(abs).toLowerCase()
      res.statusCode = 200
      res.setHeader('Content-Type', LIBRARY_MIME[ext] || 'application/octet-stream')
      res.setHeader('Content-Length', String(st.size))
      res.setHeader('Cache-Control', 'public, max-age=0')
      fs.createReadStream(abs).pipe(res)
    } catch (err) {
      res.statusCode = 500
      res.setHeader('Content-Type', 'text/plain; charset=utf-8')
      res.end(err instanceof Error ? err.message : 'Error')
    }
  }

  return {
    name: 'serve-library',
    configureServer(server) {
      server.middlewares.use('/library', middleware)
    },
    configurePreviewServer(server) {
      server.middlewares.use('/library', middleware)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: viteBase(),
  server: {
    fs: { allow: [rootDir, libraryDir] },
  },
  plugins: [
    serveLibraryPlugin(),
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'SingTags',
        short_name: 'SingTags',
        description: 'Search and practice barbershop tags offline-friendly.',
        theme_color: '#0f6b5c',
        background_color: '#f7f5f1',
        display: 'standalone',
        start_url: viteBase(),
        icons: [
          {
            src: 'icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Never serve the SPA shell for media/library URLs (would poison offline audio cache).
        navigateFallbackDenylist: [/^\/library\//, /^\/api\//],
        globPatterns: ['**/*.{js,css,html,ico,svg,woff2,wasm}'],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => {
              const p = url.pathname
              return (
                p.includes('/indexes/') &&
                (p.endsWith('.json') ||
                  p.endsWith('.json.gz') ||
                  p.endsWith('.bin') ||
                  p.includes('offline-'))
              )
            },
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'singtags-indexes',
              expiration: { maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
          {
            // Tag detail JSON — CacheFirst so airplane mode can open tags after one visit
            urlPattern: ({ url }) => /\/tags\/\d+\/metadata\.json$/.test(url.pathname),
            handler: 'CacheFirst',
            options: {
              cacheName: 'singtags-tag-meta',
              expiration: { maxEntries: 8000, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  assetsInclude: ['**/*.wasm'],
  optimizeDeps: {
    exclude: ['wasm-media-encoders', 'mediabunny', '@mediabunny/aac-encoder'],
  },
})
