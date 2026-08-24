import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/** Site root path, e.g. `/` or `/singtags/`. Set via VITE_BASE when deploying under a prefix. */
function viteBase(): string {
  const raw = process.env.VITE_BASE?.trim() || '/'
  if (raw === '/') return '/'
  return `/${raw.replace(/^\/+|\/+$/g, '')}/`
}

// https://vite.dev/config/
export default defineConfig({
  base: viteBase(),
  plugins: [
    vue(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'SingTags',
        short_name: 'SingTags',
        description: 'Search and practice barbershop tags offline-friendly.',
        theme_color: '#0f6b5c',
        background_color: '#f7f5f1',
        display: 'standalone',
        start_url: '/',
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
