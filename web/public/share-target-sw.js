/**
 * Service worker companion for Android Web Share Target (POST /import-share).
 * Loaded via VitePWA workbox.importScripts — must stay classic-script compatible.
 */
/* eslint-disable no-restricted-globals */
self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'POST') return

  let url
  try {
    url = new URL(request.url)
  } catch {
    return
  }

  // Match /import-share with or without a site base prefix.
  if (!/\/import-share\/?$/.test(url.pathname)) return

  event.respondWith(
    (async () => {
      try {
        const formData = await request.formData()
        const cache = await caches.open('singtags-share-target')
        await cache.keys().then((keys) => Promise.all(keys.map((k) => cache.delete(k))))

        let index = 0
        for (const [key, value] of formData.entries()) {
          if (typeof value === 'string') continue
          const file = value
          const safeName = (file.name || `shared-${index}.bin`).replace(/[^\w.\-()+ ]+/g, '_')
          const headers = new Headers({
            'Content-Type': file.type || 'application/octet-stream',
            'X-SingTags-Filename': safeName,
            'X-SingTags-Field': key,
          })
          await cache.put(
            new Request(`/__share_target_file__/${index}/${encodeURIComponent(safeName)}`),
            new Response(file, { headers }),
          )
          index += 1
        }

        const base = url.pathname.replace(/\/import-share\/?$/, '/') || '/'
        const redirectTo = new URL(`${base}share/rx?share-target=1`, url.origin)
        return Response.redirect(redirectTo.href, 303)
      } catch (err) {
        const message = err && typeof err === 'object' && 'message' in err ? String(err.message) : 'Share import failed'
        return new Response(message, { status: 500, headers: { 'Content-Type': 'text/plain' } })
      }
    })(),
  )
})
