export async function waitForStageImages(stage: HTMLElement | null): Promise<void> {
  if (!stage) return
  const imgs = [...stage.querySelectorAll('img')]
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) {
            resolve()
            return
          }
          const done = () => resolve()
          img.addEventListener('load', done, { once: true })
          img.addEventListener('error', done, { once: true })
          // Happy-dom / offline: never hang layout on a stuck decode.
          setTimeout(done, 50)
        }),
    ),
  )
}
