/**
 * Keep document.title / primary description meta in sync for the active route.
 * Crawler link previews still need the prerendered /tag/{id} HTML shells —
 * Discordbot does not run this client code.
 */
import { onUnmounted, watch, type Ref } from 'vue'

function ensureMeta(selector: string, attr: 'name' | 'property', key: string): HTMLMetaElement {
  const existing = document.head.querySelector(selector)
  if (existing instanceof HTMLMetaElement) return existing
  const el = document.createElement('meta')
  el.setAttribute(attr, key)
  document.head.appendChild(el)
  return el
}

export function useDocumentMeta(opts: {
  title: Ref<string>
  description?: Ref<string | null | undefined>
}): void {
  const previousTitle = document.title

  watch(
    opts.title,
    (title) => {
      const t = title.trim()
      if (t) document.title = t
    },
    { immediate: true },
  )

  if (opts.description) {
    const descMeta = ensureMeta('meta[name="description"]', 'name', 'description')
    const ogDesc = ensureMeta('meta[property="og:description"]', 'property', 'og:description')
    const previousDesc = descMeta.getAttribute('content')
    const previousOg = ogDesc.getAttribute('content')
    watch(
      opts.description,
      (description) => {
        const d = (description ?? '').trim()
        if (!d) return
        descMeta.setAttribute('content', d)
        ogDesc.setAttribute('content', d)
      },
      { immediate: true },
    )
    onUnmounted(() => {
      document.title = previousTitle
      if (previousDesc != null) descMeta.setAttribute('content', previousDesc)
      if (previousOg != null) ogDesc.setAttribute('content', previousOg)
    })
    return
  }

  onUnmounted(() => {
    document.title = previousTitle
  })
}
