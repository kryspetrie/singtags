export function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia !== 'undefined' &&
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function preloadImageUrls(urls: string[]): Promise<void> {
  if (typeof Image === 'undefined') return Promise.resolve()
  // Best-effort decode kickoff — never block the cross-fade on slow/hung loads
  // (happy-dom / blob: placeholders often never fire onload).
  return Promise.race([
    Promise.all(
      urls.map(
        (url) =>
          new Promise<void>((resolve) => {
            const img = new Image()
            img.onload = () => resolve()
            img.onerror = () => resolve()
            img.src = url
          }),
      ),
    ).then(() => undefined),
    new Promise<void>((resolve) => setTimeout(resolve, 80)),
  ])
}
