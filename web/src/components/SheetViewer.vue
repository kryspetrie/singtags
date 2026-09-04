<script setup lang="ts">
/**
 * Sheet music viewer: image sets and PDFs with zoom/pan, fullscreen, optional pay-the-key,
 * and offline PDF raster cache integration.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { mediaUrl } from '../lib/mediaUrl'
import type { SheetImageSet, SheetPdfFile } from '../lib/sheetAssets'
import { cropImageUrl } from '../lib/contentCrop'
import { renderPdfToPageUrls } from '../lib/pdfRender'
import {
  loadPdfRasterObjectUrls,
  pdfRasterCacheKey,
  pdfRasterMemoryHit,
  putPdfRasterFromObjectUrls,
} from '../offline/pdfRasterCache'
import {
  chooseSheetFitMode,
  clampSheetPan,
  fitSheetZoomPan,
  identitySheetZoomPan,
  panSheet,
  preserveSheetCenter,
  sheetZoomMinScale,
  sheetZoomPanCss,
  sheetZoomPansNearlyEqual,
  wheelZoomFactor,
  zoomSheetAt,
  SHEET_ZOOM_MAX,
  type SheetFitMode,
  type SheetZoomPan,
} from '../lib/sheetZoomPan'
import { KEY_SHIFT_LABEL_SIZE_SAMPLE } from '../audio/pitchPlayer'
import { acquireWakeLock, releaseWakeLock } from '../lib/wakeLock'
import { OverlayHistorySentinel, setScrollLock, setShellInert } from '../lib/overlayShell'
import { usePreferencesStore, type SheetFsPageMode } from '../stores/preferences'

export type SheetDisplayMode = 'images' | 'pdf'

const props = withDefaults(
  defineProps<{
    /** @deprecated Prefer imageSets — kept for simple callers/tests. */
    pages?: string[]
    /** @deprecated Prefer pdfs — single PDF path. */
    pdf?: string | null
    imageSets?: SheetImageSet[]
    pdfs?: SheetPdfFile[]
    /** Show Images|PDF only when uploads of both kinds exist (not raster-of-PDF). */
    canChooseFormat?: boolean
    baseUrl?: string
    /** When set, show a hold-to-sound pitch control in the fullscreen toolbar. */
    payKeyEnabled?: boolean
    keyLabel?: string
    shift?: number
    /**
     * Crop whitespace margins on displayed pages (images + rendered PDFs).
     * Default off: catalog WebP/PDF pages are published pre-cropped. Enable for
     * Local Library / user uploads that often have scanner or page margins.
     */
    cropToContent?: boolean
    /**
     * Default view pages already prepared by the parent (cropped offscreen).
     * When set for the initial image set, skip a second crop pass.
     */
    prefetchedPages?: string[] | null
    /**
     * When true, never fetch/rasterize remote PDFs — only reuse memory/IDB rasters
     * (or keep WebP). Local `blob:` / `data:` PDFs still rasterize (no network).
     * When false (online), WebP paints first then HQ rasters are prepared, cached,
     * and faded in (inline and fullscreen).
     */
    offline?: boolean
    /** Extended sing chrome: ± shift, Mix play/scrub (parent wires audio). */
    singControls?: boolean
    /** Enter fullscreen automatically once pages are ready. */
    autoEnterFullscreen?: boolean
    /** Mix playback state for sing chrome. */
    playing?: boolean
    playReady?: boolean
    currentTime?: number
    duration?: number
    /** Label for ✕ when it returns to the list that opened this tag (“Browse”, …). */
    exitOriginLabel?: string
    /** Mix pitch/speed bake in flight — show on play control. */
    baking?: boolean
    /** Fullscreen Share button label (e.g. “Copied” after a successful share). */
    shareLabel?: string
  }>(),
  {
    pages: () => [],
    pdf: null,
    imageSets: () => [],
    pdfs: () => [],
    canChooseFormat: false,
    cropToContent: false,
    prefetchedPages: null,
    offline: false,
    singControls: false,
    autoEnterFullscreen: false,
    playing: false,
    playReady: false,
    currentTime: 0,
    duration: 0,
    exitOriginLabel: '',
    baking: false,
    shareLabel: 'Share',
  },
)

const emit = defineEmits<{
  'pay-down': []
  'pay-up': []
  'fullscreen-change': [boolean]
  'shift-delta': [number]
  'shift-reset': []
  'play-toggle': []
  /** Stop mix and reset playhead (fullscreen playback Close). */
  'play-stop': []
  seek: [number]
  share: []
  /** Leave the tag for the list/page that opened fullscreen (✕). */
  'exit-origin': []
}>()

const prefs = usePreferencesStore()
const fullscreen = ref(false)
/** Collapse Play / Share / Tag / Fit; page pager + Pitch ± + more + exit stay. Default on in fullscreen. */
const chromeCompact = ref(true)
/** Mix play/scrub panel popped open from compact Play (hides ⋮ while open). */
const playbackOpen = ref(false)
/**
 * When expanded, keep ⋮ menu controls on the top row if they fit; otherwise
 * move the whole menu group to a second row (⋮ / ✕ stay put).
 */
const moreInline = ref(true)
/** Narrow widths: keep pitch + ⋮/✕ on row 1, playback controls on row 2. */
const playbackBelow = ref(false)
const chromeElRef = ref<HTMLElement | null>(null)
let chromeLayoutRo: ResizeObserver | null = null
/** After user exits FS, ignore autoEnter until the prop cycles off→on (new deep link). */
const suppressAutoEnter = ref(false)
/** Soft-FS history sentinel so OS back exits overlay once before leaving the tag. */
const overlayHistory = new OverlayHistorySentinel()
const pageIndex = ref(0)
const mode = ref<SheetDisplayMode>('images')
const imageSetId = ref('')
const pdfId = ref('')
const displayPages = ref<string[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const ownedUrls = ref<string[]>([])
let loadAbort: AbortController | null = null
let loadSeq = 0
/** Incoming hi-res pages fading over {@link displayPages} (WebP → PDF raster). */
const upgradePages = ref<string[] | null>(null)
const upgradeOpaque = ref(false)
let fadeGen = 0
let fadeTimer: ReturnType<typeof setTimeout> | null = null
/** Auto-switched to PDF raster for fullscreen sharpness; revert on exit. */
let autoPdfForFullscreen = false

const sheetEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const zoomPan = ref<SheetZoomPan>(identitySheetZoomPan())
const fitMode = ref<SheetFitMode>('width')
/** False once the user pinches/wheels/double-clicks away from a fit layout. */
let layoutIsFitted = true
/** Last measured FS layout — used to preserve center when zoomed across resize. */
let lastFsViewport: { width: number; height: number } | null = null
let lastFsContent: { width: number; height: number } | null = null

const stageStyle = computed(() =>
  fullscreen.value ? { transform: sheetZoomPanCss(zoomPan.value) } : undefined,
)
/** Continuous multi-page stack in fullscreen (vs one-page pager). */
const fsScrollMode = computed(
  () =>
    fullscreen.value &&
    prefs.sheetFsPageMode === 'scroll' &&
    displayPages.value.length > 1,
)
const pageModeButtonLabel = computed(() =>
  prefs.sheetFsPageMode === 'scroll' ? 'Scroll' : 'Paging',
)
const pageModeButtonTitle = computed(() =>
  prefs.sheetFsPageMode === 'scroll'
    ? 'Page mode: continuous scroll — tap for one page at a time'
    : 'Page mode: paging — tap for continuous scroll',
)
const fitButtonLabel = computed(() => (fitMode.value === 'width' ? 'Fit width' : 'Fit all'))
/** True when cycling fit width ↔ fit all would leave the view unchanged. */
const fitCycleDisabled = ref(false)
const fitButtonTitle = computed(() => {
  if (fitCycleDisabled.value) {
    return fitMode.value === 'width'
      ? 'Fit width — fit all looks the same for this page'
      : 'Fit all — fit width looks the same for this page'
  }
  return fitMode.value === 'width'
    ? 'Fit mode: width — tap for fit all'
    : 'Fit mode: all — tap for fit width'
})

type ActivePointer = { id: number; x: number; y: number }
const pointers = new Map<number, ActivePointer>()
let pinchStartDist = 0
let pinchStartScale = 1
let dragging = false
let lastDragX = 0
let lastDragY = 0
/** Gesture start for fullscreen page-turn swipe (fit zoom only). */
let gesturePanX = 0
let gesturePanY = 0
const PAGE_SWIPE_MIN_PX = 56

const resolvedImageSets = computed<SheetImageSet[]>(() => {
  if (props.imageSets.length) return props.imageSets
  if (props.pages.length) {
    return [
      {
        id: 'pages',
        label: props.pages.length > 1 ? `Pages (${props.pages.length})` : 'Pages',
        paths: props.pages,
      },
    ]
  }
  return []
})

const resolvedPdfs = computed<SheetPdfFile[]>(() => {
  if (props.pdfs.length) return props.pdfs
  if (props.pdf) {
    return [{ id: 'pdf', label: 'PDF', path: props.pdf }]
  }
  return []
})

const hasImages = computed(() => resolvedImageSets.value.length > 0)
const hasPdf = computed(() => resolvedPdfs.value.length > 0)
const showFormatToggle = computed(
  () => props.canChooseFormat && hasImages.value && hasPdf.value,
)
const canChooseImageSet = computed(
  () => mode.value === 'images' && resolvedImageSets.value.length > 1,
)
const canChoosePdf = computed(() => mode.value === 'pdf' && resolvedPdfs.value.length > 1)
const showPickers = computed(
  () => showFormatToggle.value || canChooseImageSet.value || canChoosePdf.value,
)

const activeImageSet = computed(() => {
  const sets = resolvedImageSets.value
  return sets.find((s) => s.id === imageSetId.value) ?? sets[0] ?? null
})

const activePdf = computed(() => {
  const list = resolvedPdfs.value
  return list.find((p) => p.id === pdfId.value) ?? list[0] ?? null
})

const showingPdf = computed(() => mode.value === 'pdf' && hasPdf.value)

function src(path: string, base?: string): string {
  if (
    path.startsWith('/') ||
    path.startsWith('blob:') ||
    path.startsWith('http://') ||
    path.startsWith('https://') ||
    path.startsWith('data:')
  ) {
    return path
  }
  if (base) return `${base.endsWith('/') ? base : base + '/'}${path}`
  return mediaUrl(path)
}

/** Offline mode still allows pdf.js when the PDF bytes are already local. */
function canRasterizePdfUrl(pdfUrl: string): boolean {
  if (!props.offline) return true
  return pdfUrl.startsWith('blob:') || pdfUrl.startsWith('data:')
}

function revokeOwned(): void {
  for (const u of ownedUrls.value) URL.revokeObjectURL(u)
  ownedUrls.value = []
}

function prefersReducedMotion(): boolean {
  return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches
}

function clearUpgradeLayer(revoke = false): void {
  fadeGen++
  if (fadeTimer) {
    clearTimeout(fadeTimer)
    fadeTimer = null
  }
  if (revoke && upgradePages.value) {
    for (const u of upgradePages.value) {
      if (u.startsWith('blob:')) URL.revokeObjectURL(u)
    }
  }
  upgradePages.value = null
  upgradeOpaque.value = false
}

function preloadImageUrls(urls: string[]): Promise<void> {
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

/**
 * Swap to `urls` (owned blob URLs). When a same-length preview is already on screen,
 * cross-fade instead of hard-cutting — keeps low-res WebP visible until hi-res is ready.
 */
async function applyOwnedPages(
  urls: string[],
  opts: { signal?: AbortSignal; seq?: number; fade?: boolean } = {},
): Promise<void> {
  const { signal, seq, fade = true } = opts
  const from = displayPages.value
  const canFade =
    fade &&
    !prefersReducedMotion() &&
    from.length > 0 &&
    from.length === urls.length &&
    from.some((u, i) => u !== urls[i])

  if (!canFade) {
    clearUpgradeLayer(true)
    const previousOwned = ownedUrls.value
    ownedUrls.value = urls
    displayPages.value = urls
    for (const u of previousOwned) URL.revokeObjectURL(u)
    return
  }

  const token = ++fadeGen
  await preloadImageUrls(urls)
  if (signal?.aborted || (seq != null && seq !== loadSeq) || token !== fadeGen) {
    for (const u of urls) URL.revokeObjectURL(u)
    return
  }

  upgradePages.value = urls
  upgradeOpaque.value = false
  await nextTick()
  if (signal?.aborted || (seq != null && seq !== loadSeq) || token !== fadeGen) {
    for (const u of urls) URL.revokeObjectURL(u)
    if (upgradePages.value === urls) {
      upgradePages.value = null
      upgradeOpaque.value = false
    }
    return
  }

  await new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())))
  if (signal?.aborted || (seq != null && seq !== loadSeq) || token !== fadeGen) {
    for (const u of urls) URL.revokeObjectURL(u)
    if (upgradePages.value === urls) {
      upgradePages.value = null
      upgradeOpaque.value = false
    }
    return
  }
  upgradeOpaque.value = true

  await new Promise<void>((resolve) => {
    fadeTimer = setTimeout(() => {
      fadeTimer = null
      resolve()
    }, 300)
  })

  if (signal?.aborted || (seq != null && seq !== loadSeq) || token !== fadeGen) {
    // A newer rebuild owns cleanup via clearUpgradeLayer / applyOwnedPages.
    return
  }

  const previousOwned = ownedUrls.value
  ownedUrls.value = urls
  displayPages.value = urls
  upgradePages.value = null
  upgradeOpaque.value = false
  for (const u of previousOwned) URL.revokeObjectURL(u)
}


function setMode(next: SheetDisplayMode): void {
  if (next === 'pdf' && !hasPdf.value) return
  if (next === 'images' && !hasImages.value) return
  autoPdfForFullscreen = false
  mode.value = next
}

function syncSelection(resetMode: boolean): void {
  const sets = resolvedImageSets.value
  const pdfs = resolvedPdfs.value
  if (!sets.some((s) => s.id === imageSetId.value)) {
    imageSetId.value = sets[0]?.id ?? ''
  }
  if (!pdfs.some((p) => p.id === pdfId.value)) {
    pdfId.value = pdfs[0]?.id ?? ''
  }
  if (resetMode) {
    // Inline view prefers WebP; PDF is rasterized for fullscreen (or manual toggle).
    if (hasImages.value) mode.value = 'images'
    else if (hasPdf.value) mode.value = 'pdf'
  } else if (mode.value === 'images' && !hasImages.value && hasPdf.value) {
    mode.value = 'pdf'
  } else if (mode.value === 'pdf' && !hasPdf.value && hasImages.value) {
    mode.value = 'images'
  }
}

watch(
  () =>
    [
      resolvedImageSets.value.map((s) => `${s.id}:${s.paths.join(',')}`).join('\0'),
      resolvedPdfs.value.map((p) => `${p.id}:${p.path}`).join('\0'),
    ] as const,
  (_n, prev) => {
    syncSelection(!prev)
  },
  { immediate: true },
)

/** Only the primary sheet pages get automatic WebP→PDF HQ upgrade (not alternate scans). */
function shouldAutoUpgradePdf(): boolean {
  if (!hasPdf.value) return false
  const sets = resolvedImageSets.value
  if (!sets.length) return false
  const active = activeImageSet.value
  if (!active) return false
  if (sets.length === 1) return true
  return active.id === 'pages' || active.id === sets[0]!.id
}

/** Immediate image URLs for the active set (prefetch or raw) — never waits. */
function imagePreviewUrls(): string[] {
  const paths = activeImageSet.value?.paths ?? []
  if (!paths.length) return []
  const raw = paths.map((p) => src(p, props.baseUrl))
  const prefetch = props.prefetchedPages
  const defaultSetId = resolvedImageSets.value[0]?.id
  const canUsePrefetch =
    !!prefetch?.length &&
    activeImageSet.value?.id === defaultSetId &&
    prefetch.length === paths.length
  return canUsePrefetch ? prefetch! : raw
}

async function rebuildDisplay(): Promise<void> {
  loadAbort?.abort()
  clearUpgradeLayer(true)
  loadAbort = new AbortController()
  const { signal } = loadAbort
  const seq = ++loadSeq
  loadError.value = null

  if (showingPdf.value) {
    const pdf = activePdf.value
    if (!pdf) return
    const pdfUrl = src(pdf.path, props.baseUrl)
    const cacheKey = pdfRasterCacheKey(pdfUrl, { crop: props.cropToContent })

    // Session cache: high-res immediately (still fade if WebP is already up).
    const memHit = pdfRasterMemoryHit(cacheKey)
    if (memHit) {
      await applyOwnedPages(memHit, { signal, seq, fade: true })
      if (seq === loadSeq) loading.value = false
      return
    }

    // Always paint WebP (or keep prior pages) while we check IDB / rasterize.
    if (!displayPages.value.length) {
      const preview = imagePreviewUrls()
      if (preview.length) {
        revokeOwned()
        displayPages.value = preview
      } else {
        revokeOwned()
        displayPages.value = []
        loading.value = true
      }
    }
    try {
      const idbHit = await loadPdfRasterObjectUrls(cacheKey)
      if (signal.aborted || seq !== loadSeq) {
        if (idbHit) for (const u of idbHit) URL.revokeObjectURL(u)
        return
      }
      if (idbHit) {
        await applyOwnedPages(idbHit, { signal, seq, fade: true })
        return
      }

      // Offline: keep WebP for remote PDFs — never fetch without a cache hit.
      // Local blob/data PDFs (e.g. Local Library) still rasterize in-place.
      if (!canRasterizePdfUrl(pdfUrl)) {
        return
      }

      const urls = await renderPdfToPageUrls(pdfUrl, {
        crop: props.cropToContent,
        signal,
      })
      if (signal.aborted || seq !== loadSeq) {
        for (const u of urls) URL.revokeObjectURL(u)
        return
      }
      // Persist before fade so abort mid-transition still keeps HQ for next visit.
      void putPdfRasterFromObjectUrls(cacheKey, urls)
      await applyOwnedPages(urls, { signal, seq, fade: true })
    } catch (e) {
      if (signal.aborted || seq !== loadSeq) return
      loadError.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (seq === loadSeq) loading.value = false
    }
    return
  }

  const paths = activeImageSet.value?.paths ?? []
  if (!paths.length) {
    revokeOwned()
    displayPages.value = []
    return
  }

  const raw = paths.map((p) => src(p, props.baseUrl))
  const preview = imagePreviewUrls()
  const prefetch = props.prefetchedPages
  const defaultSetId = resolvedImageSets.value[0]?.id
  const usingPrefetch =
    !!prefetch?.length &&
    activeImageSet.value?.id === defaultSetId &&
    prefetch.length === paths.length

  // Parent already prepared these pages (cropped). Painting them then re-cropping
  // swaps dimensions and flickers layout — especially on online reload.
  if (usingPrefetch) {
    revokeOwned()
    displayPages.value = prefetch!
    loading.value = false
    if (shouldAutoUpgradePdf()) void upgradeToHqPdfRaster(signal, seq)
    else void cropWebpInPlace(raw, preview, signal, seq)
    return
  }

  // Instant session-cache HQ (no WebP flash on return from fullscreen).
  if (shouldAutoUpgradePdf()) {
    const pdf = activePdf.value
    if (pdf) {
      const cacheKey = pdfRasterCacheKey(src(pdf.path, props.baseUrl), {
        crop: props.cropToContent,
      })
      const memHit = pdfRasterMemoryHit(cacheKey)
      if (memHit) {
        await applyOwnedPages(memHit, {
          signal,
          seq,
          fade: displayPages.value.length > 0,
        })
        if (seq === loadSeq) loading.value = false
        return
      }
    }
  }

  // Show WebP immediately; HQ PDF rasters fade in when ready (online render or IDB).
  displayPages.value = preview
  loading.value = false

  if (shouldAutoUpgradePdf()) {
    void (async () => {
      if (await upgradeToHqPdfRaster(signal, seq)) return
      if (signal.aborted || seq !== loadSeq) return
      // Offline miss (or render failure): still crop WebP when enabled.
      await cropWebpInPlace(raw, preview, signal, seq)
    })()
    return
  }

  void cropWebpInPlace(raw, preview, signal, seq)
}

/** Content-crop the WebP preview in place (no PDF available / offline cache miss). */
async function cropWebpInPlace(
  raw: string[],
  preview: string[],
  signal: AbortSignal,
  seq: number,
): Promise<void> {
  if (!props.cropToContent) return
  if (seq === loadSeq) loading.value = true
  try {
    const next: string[] = []
    const owned: string[] = []
    for (const url of raw) {
      if (signal.aborted || seq !== loadSeq) return
      const { url: cropped, revoke } = await cropImageUrl(url, signal)
      next.push(cropped)
      if (revoke) owned.push(cropped)
    }
    if (signal.aborted || seq !== loadSeq) {
      for (const u of owned) URL.revokeObjectURL(u)
      return
    }
    await applyOwnedPages(next, { signal, seq, fade: true })
    if (seq === loadSeq) {
      ownedUrls.value = owned
    }
  } catch (e) {
    if (signal.aborted || seq !== loadSeq) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    displayPages.value = preview
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

/**
 * Fade WebP → HQ PDF rasters when available.
 * - Memory / IndexedDB hits: apply immediately (online or offline).
 * - Online miss: pdf.js render → cache → fade (inline and after sing-mode entry).
 * - Offline miss: keep WebP (no network PDF fetch).
 *
 * @returns true when an upgrade was applied (or aborted after a hit).
 */
async function upgradeToHqPdfRaster(signal: AbortSignal, seq: number): Promise<boolean> {
  if (!hasPdf.value || showingPdf.value) return false
  const pdf = activePdf.value
  if (!pdf) return false
  const pdfUrl = src(pdf.path, props.baseUrl)
  const cacheKey = pdfRasterCacheKey(pdfUrl, { crop: props.cropToContent })

  const memHit = pdfRasterMemoryHit(cacheKey)
  if (memHit) {
    await applyOwnedPages(memHit, { signal, seq, fade: true })
    return true
  }

  try {
    const idbHit = await loadPdfRasterObjectUrls(cacheKey)
    if (signal.aborted || seq !== loadSeq) {
      if (idbHit) for (const u of idbHit) URL.revokeObjectURL(u)
      return !!idbHit
    }
    if (idbHit) {
      await applyOwnedPages(idbHit, { signal, seq, fade: true })
      return true
    }
  } catch {
    /* best-effort cache read */
  }

  if (!canRasterizePdfUrl(pdfUrl)) return false

  try {
    const urls = await renderPdfToPageUrls(pdfUrl, {
      crop: props.cropToContent,
      signal,
    })
    if (signal.aborted || seq !== loadSeq) {
      for (const u of urls) URL.revokeObjectURL(u)
      return false
    }
    // Persist before fade so abort mid-transition still keeps HQ for next visit.
    void putPdfRasterFromObjectUrls(cacheKey, urls)
    await applyOwnedPages(urls, { signal, seq, fade: true })
    return true
  } catch (e) {
    if (signal.aborted || seq !== loadSeq) return false
    if (e instanceof DOMException && e.name === 'AbortError') return false
    return false
  }
}

watch(
  () =>
    [
      mode.value,
      imageSetId.value,
      pdfId.value,
      props.cropToContent,
      props.offline,
      activeImageSet.value?.paths.join('\0') ?? '',
      activePdf.value?.path ?? '',
      props.prefetchedPages?.join('\0') ?? '',
    ] as const,
  () => {
    void rebuildDisplay()
  },
  { immediate: true },
)

function measureViewportAndContent(): {
  viewport: { width: number; height: number }
  content: { width: number; height: number }
} | null {
  const sheet = sheetEl.value
  const stage = stageEl.value
  if (!sheet || !stage) return null
  const vr = sheet.getBoundingClientRect()
  if (vr.width <= 0 || vr.height <= 0) return null

  let width = stage.offsetWidth
  let height = stage.scrollHeight

  // Paging shows one page via v-show. Prefer that page's box — stage.scrollHeight can
  // be 0/stale for a frame after the swap, which used to snap zoom to identity.
  if (fullscreen.value && !fsScrollMode.value) {
    const pages = stage.querySelectorAll('.page')
    const el = pages[pageIndex.value] as HTMLElement | undefined
    if (el) {
      const img = el.querySelector('img.page-base') as HTMLImageElement | null
      const w = el.offsetWidth || img?.clientWidth || 0
      const h = el.offsetHeight || img?.clientHeight || 0
      if (w > 0 && h > 0) {
        width = w
        height = h
      }
    }
  }

  if (width <= 0 || height <= 0) return null
  return {
    viewport: { width: vr.width, height: vr.height },
    content: { width, height },
  }
}

/** Reserve space for top/bottom overlay chrome so the sheet isn't covered on load. */
function measureChromeInsets(): { top: number; bottom: number } {
  const sheet = sheetEl.value
  if (!sheet) return { top: 0, bottom: 0 }
  const overlay = sheet.querySelector('.chrome') as HTMLElement | null
  if (!overlay) return { top: 0, bottom: 0 }
  const sheetR = sheet.getBoundingClientRect()
  const or = overlay.getBoundingClientRect()
  if (or.width <= 0 || or.height <= 0) return { top: 0, bottom: 0 }
  const gap = 8
  const mid = (or.top + or.bottom) / 2
  const sheetMid = (sheetR.top + sheetR.bottom) / 2
  if (mid <= sheetMid) {
    return { top: Math.max(0, or.bottom - sheetR.top + gap), bottom: 0 }
  }
  return { top: 0, bottom: Math.max(0, sheetR.bottom - or.top + gap) }
}

function rememberFsLayout(
  viewport: { width: number; height: number },
  content: { width: number; height: number },
): void {
  lastFsViewport = viewport
  lastFsContent = content
}

function commitZoomPan(next: SheetZoomPan): void {
  const measured = measureViewportAndContent()
  if (!measured) {
    zoomPan.value = next
    updateFitCycleDisabled()
    return
  }
  const insets = measureChromeInsets()
  const min = sheetZoomMinScale(measured.viewport, measured.content, insets)
  const scale = Math.min(SHEET_ZOOM_MAX, Math.max(min, next.scale))
  zoomPan.value = clampSheetPan(
    { ...next, scale },
    measured.viewport,
    measured.content,
    insets,
  )
  rememberFsLayout(measured.viewport, measured.content)
  updateFitCycleDisabled()
}

/** Resolved fit transform after the same clamp path as {@link commitZoomPan}. */
function resolvedFitZoomPan(mode: SheetFitMode): SheetZoomPan | null {
  const measured = measureViewportAndContent()
  if (!measured) return null
  const insets = measureChromeInsets()
  const next = fitSheetZoomPan(mode, measured.viewport, measured.content, { insets })
  const min = sheetZoomMinScale(measured.viewport, measured.content, insets)
  const scale = Math.min(SHEET_ZOOM_MAX, Math.max(min, next.scale))
  return clampSheetPan({ ...next, scale }, measured.viewport, measured.content, insets)
}

function updateFitCycleDisabled(): void {
  if (!fullscreen.value) {
    fitCycleDisabled.value = false
    return
  }
  const nextMode: SheetFitMode = fitMode.value === 'width' ? 'all' : 'width'
  const target = resolvedFitZoomPan(nextMode)
  if (!target) {
    fitCycleDisabled.value = true
    return
  }
  fitCycleDisabled.value = sheetZoomPansNearlyEqual(zoomPan.value, target)
}

function applyFit(next: SheetFitMode): void {
  fitMode.value = next
  layoutIsFitted = true
  const measured = measureViewportAndContent()
  if (!measured) {
    zoomPan.value = identitySheetZoomPan()
    updateFitCycleDisabled()
    return
  }
  const insets = measureChromeInsets()
  commitZoomPan(fitSheetZoomPan(next, measured.viewport, measured.content, { insets }))
}

/**
 * Default fit for a new fullscreen session.
 * Paging multi-page shows one page at a time → Fit all.
 * Continuous scroll stacks pages → Fit width (document reading).
 * Single-page still auto-picks width vs all from aspect / pillarboxing.
 */
function initialFullscreenFitMode(): SheetFitMode {
  if (displayPages.value.length > 1) {
    return prefs.sheetFsPageMode === 'scroll' ? 'width' : 'all'
  }
  const measured = measureViewportAndContent()
  if (!measured) return 'width'
  const insets = measureChromeInsets()
  return chooseSheetFitMode(measured.viewport, measured.content, undefined, insets)
}

function cycleFit(): void {
  if (fitCycleDisabled.value) return
  applyFit(fitMode.value === 'width' ? 'all' : 'width')
}

async function applyPageMode(mode: SheetFsPageMode): Promise<void> {
  prefs.setSheetFsPageMode(mode)
  if (!fullscreen.value) return
  await waitForImages()
  await nextTick()
  if (displayPages.value.length > 1) {
    applyFit(mode === 'scroll' ? 'width' : 'all')
  } else {
    applyFit(fitMode.value)
  }
}

function cyclePageMode(): void {
  void applyPageMode(prefs.sheetFsPageMode === 'scroll' ? 'paging' : 'scroll')
}

async function waitForImages(): Promise<void> {
  await nextTick()
  const stage = stageEl.value
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
  await nextTick()
}

async function enterFullscreenLayout(opts?: { resetFitMode?: boolean }): Promise<void> {
  await waitForImages()
  // Chrome is absolute overlay — wait a frame so insets measure correctly.
  await nextTick()
  applyFit(opts?.resetFitMode ? initialFullscreenFitMode() : fitMode.value)
}

let fsViewportRaf = 0
function onFsViewportChange(): void {
  if (!fullscreen.value) return
  cancelAnimationFrame(fsViewportRaf)
  fsViewportRaf = requestAnimationFrame(() => {
    if (!fullscreen.value) return
    if (layoutIsFitted) {
      // Still in fit-width / fit-all — reflow for the new viewport.
      applyFit(fitMode.value)
      return
    }
    // Zoomed in: keep scale and the content point under the viewport center.
    const measured = measureViewportAndContent()
    if (!measured || !lastFsViewport || !lastFsContent) {
      commitZoomPan(zoomPan.value)
      return
    }
    commitZoomPan(
      preserveSheetCenter(
        zoomPan.value,
        lastFsViewport,
        lastFsContent,
        measured.viewport,
        measured.content,
      ),
    )
  })
}

function attachFsViewportListeners(): void {
  window.addEventListener('resize', onFsViewportChange)
  window.addEventListener('orientationchange', onFsViewportChange)
}

function detachFsViewportListeners(): void {
  window.removeEventListener('resize', onFsViewportChange)
  window.removeEventListener('orientationchange', onFsViewportChange)
  cancelAnimationFrame(fsViewportRaf)
  fsViewportRaf = 0
}

async function setFullscreen(on: boolean, opts?: { fromPopState?: boolean }): Promise<void> {
  fullscreen.value = on
  pointers.clear()
  dragging = false
  pinchStartDist = 0
  if (on) {
    chromeCompact.value = true
    playbackOpen.value = false
    moreInline.value = true
    playbackBelow.value = false
    suppressAutoEnter.value = false
    // Upgrade to PDF raster in fullscreen when available; keep WebP until ready.
    if (hasPdf.value && hasImages.value && mode.value === 'images') {
      autoPdfForFullscreen = true
      mode.value = 'pdf'
    }
    attachFsViewportListeners()
    void enterFullscreenLayout({ resetFitMode: true })
    void acquireWakeLock('sheet')
    setShellInert(true)
    if (!opts?.fromPopState) overlayHistory.push()
    void nextTick(() => attachChromeLayoutObserver())
  } else {
    detachChromeLayoutObserver()
    moreInline.value = true
    playbackBelow.value = false
    detachFsViewportListeners()
    if (autoPdfForFullscreen && hasImages.value) {
      autoPdfForFullscreen = false
      mode.value = 'images'
    }
    zoomPan.value = identitySheetZoomPan()
    layoutIsFitted = true
    lastFsViewport = null
    lastFsContent = null
    fitCycleDisabled.value = false
    void releaseWakeLock('sheet')
    setShellInert(false)
    suppressAutoEnter.value = true
    // Drop the sentinel in-place — history.back() makes Vue Router leave the tag page.
    if (!opts?.fromPopState) overlayHistory.discard()
  }
  emit('fullscreen-change', on)
  setScrollLock(on)
}

function toggleChromeCompact(): void {
  if (!fullscreen.value) return
  // Playback panel owns the chrome strip — Close / M dismisses it first.
  if (playbackOpen.value) {
    closePlaybackPanel()
    return
  }
  chromeCompact.value = !chromeCompact.value
  void nextTick(() => {
    measureChromeLayout()
    commitZoomPan(zoomPan.value)
  })
}

/** Play from ⋮ menu: start/stop mix and pop out scrub controls (hides ⋮). */
function onPlayClick(): void {
  if (!playbackOpen.value) {
    playbackOpen.value = true
    chromeCompact.value = true
  }
  emit('play-toggle')
  void nextTick(() => {
    measureChromeLayout()
    commitZoomPan(zoomPan.value)
  })
}

/** Close playback chrome: stop mix and rewind so the next open starts clean. */
function closePlaybackPanel(): void {
  emit('play-stop')
  playbackOpen.value = false
  void nextTick(() => {
    measureChromeLayout()
    commitZoomPan(zoomPan.value)
  })
}

function flexContentWidth(el: HTMLElement | null, gap: number): number {
  if (!el) return 0
  const kids = [...el.children] as HTMLElement[]
  if (!kids.length) return 0
  return kids.reduce((sum, child) => sum + child.offsetWidth, 0) + gap * (kids.length - 1)
}

function measureChromeLayout(): void {
  const chrome = chromeElRef.value
  if (!chrome || !fullscreen.value) {
    moreInline.value = true
    playbackBelow.value = false
    return
  }

  const width = chrome.clientWidth
  if (width <= 0) return

  const pitch = chrome.querySelector('.chrome-pitch-cluster') as HTMLElement | null
  const trailing = chrome.querySelector('.chrome-trailing') as HTMLElement | null
  const mid = chrome.querySelector('.chrome-mid') as HTMLElement | null
  const pitchW = pitch?.offsetWidth ?? 0
  const trailW = trailing?.offsetWidth ?? 0
  const styles = getComputedStyle(chrome)
  const gap = Number.parseFloat(styles.columnGap || styles.gap || '7') || 7
  const available = Math.max(0, width - pitchW - trailW - gap * 2)

  if (playbackOpen.value) {
    const play = mid?.querySelector('.chrome-play') as HTMLElement | null
    playbackBelow.value = flexContentWidth(play, gap) > available + 1
    moreInline.value = true
    return
  }

  playbackBelow.value = false
  if (!chromeCompact.value) {
    const more = mid?.querySelector('.chrome-more') as HTMLElement | null
    moreInline.value = flexContentWidth(more, gap) <= available + 1
  } else {
    moreInline.value = true
  }
}

function attachChromeLayoutObserver(): void {
  detachChromeLayoutObserver()
  if (typeof ResizeObserver === 'undefined') return
  const chrome = chromeElRef.value
  if (!chrome) return
  chromeLayoutRo = new ResizeObserver(() => measureChromeLayout())
  chromeLayoutRo.observe(chrome)
  measureChromeLayout()
}

function detachChromeLayoutObserver(): void {
  chromeLayoutRo?.disconnect()
  chromeLayoutRo = null
}

/** ✕ / Escape — exit fullscreen; parent navigates away only in Sing mode. */
async function exitToOrigin(): Promise<void> {
  // Do not history.back() the soft-FS sentinel here. Vue Router treats that popstate as
  // "return to Browse/Recent/Favorites" *before* the parent can arm scroll restore, so the
  // list lands at the wrong Y. Discard the sentinel in-place; parent then goTagBack().
  overlayHistory.discard()
  const leaveToList = props.exitOriginLabel !== 'tag page'
  // Navigate first in Sing mode so goTagBack arms scroll before any ?fullscreen= clear.
  if (leaveToList) emit('exit-origin')
  await setFullscreen(false, { fromPopState: true })
}

function onPopState(): void {
  if (overlayHistory.consumeInternalPop()) return
  if (!fullscreen.value) return
  overlayHistory.resetPushed()
  void setFullscreen(false, { fromPopState: true })
}

function scrollPageIntoView(index: number): void {
  if (fullscreen.value) {
    if (fsScrollMode.value) {
      panToPage(index)
      return
    }
    // Paging: one page via v-show; keep the session's Fit width / Fit all.
    applyFit(fitMode.value)
    return
  }
  const root = stageEl.value
  if (!root) return
  const pages = root.querySelectorAll('.page')
  const el = pages[index] as HTMLElement | undefined
  el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}

/** Pan so page `index` sits under the top chrome (scroll mode). */
function panToPage(index: number): void {
  const stage = stageEl.value
  if (!stage) {
    applyFit(fitMode.value)
    return
  }
  const pages = stage.querySelectorAll('.page')
  const el = pages[index] as HTMLElement | undefined
  if (!el) {
    applyFit(fitMode.value)
    return
  }
  const measured = measureViewportAndContent()
  if (!measured) return
  const insets = measureChromeInsets()
  const scale = zoomPan.value.scale > 0 ? zoomPan.value.scale : 1
  commitZoomPan({
    ...zoomPan.value,
    panY: Math.max(0, insets.top) - el.offsetTop * scale,
  })
}

/** Keep the page indicator in sync while panning the scroll stack. */
function syncPageIndexFromPan(): void {
  if (!fsScrollMode.value) return
  const stage = stageEl.value
  const sheet = sheetEl.value
  if (!stage || !sheet) return
  const pages = [...stage.querySelectorAll('.page')] as HTMLElement[]
  if (pages.length <= 1) return
  const scale = zoomPan.value.scale
  if (scale <= 0) return
  const viewMidContentY = (sheet.getBoundingClientRect().height / 2 - zoomPan.value.panY) / scale
  let best = 0
  let bestDist = Infinity
  for (let i = 0; i < pages.length; i++) {
    const el = pages[i]!
    const mid = el.offsetTop + el.offsetHeight / 2
    const d = Math.abs(mid - viewMidContentY)
    if (d < bestDist) {
      bestDist = d
      best = i
    }
  }
  pageIndex.value = best
}

/** After a paging page-turn: wait for layout, then re-apply the session fit mode. */
async function refitPagingPage(): Promise<void> {
  await waitForImages()
  await nextTick()
  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve())
  })
  if (!fullscreen.value || fsScrollMode.value) return
  applyFit(fitMode.value)
}

function goPage(delta: number): void {
  const max = Math.max(0, displayPages.value.length - 1)
  const next = Math.max(0, Math.min(max, pageIndex.value + delta))
  if (next === pageIndex.value) return
  pageIndex.value = next
  if (fullscreen.value && fsScrollMode.value) {
    void nextTick().then(() => scrollPageIntoView(next))
    return
  }
  if (fullscreen.value) {
    // Do not snap to identity first — that breaks Fit all and makes resize jump.
    void refitPagingPage()
    return
  }
  void nextTick().then(() => scrollPageIntoView(next))
}

function onSeekInput(e: Event): void {
  const v = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(v)) emit('seek', v)
}

function fmtTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00'
  const s = Math.floor(sec)
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${r.toString().padStart(2, '0')}`
}

function onKey(e: KeyboardEvent): void {
  if (!fullscreen.value) return
  if (e.key === 'Escape') {
    e.preventDefault()
    void exitToOrigin()
    return
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    goPage(-1)
  } else if (e.key === 'ArrowRight') {
    e.preventDefault()
    goPage(1)
  } else if (e.key === 'm' || e.key === 'M') {
    e.preventDefault()
    toggleChromeCompact()
  }
}

function onPayKey(e: KeyboardEvent): void {
  if (!props.payKeyEnabled) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (e.type === 'keydown') emit('pay-down')
    else emit('pay-up')
  }
}

function viewportPoint(clientX: number, clientY: number): { x: number; y: number } {
  const el = sheetEl.value
  if (!el) return { x: clientX, y: clientY }
  const r = el.getBoundingClientRect()
  return { x: clientX - r.left, y: clientY - r.top }
}

function pointerDistance(): number {
  const pts = [...pointers.values()]
  if (pts.length < 2) return 0
  const a = pts[0]!
  const b = pts[1]!
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function pointerMidpoint(): { x: number; y: number } {
  const pts = [...pointers.values()]
  if (pts.length < 2) return { x: 0, y: 0 }
  const a = pts[0]!
  const b = pts[1]!
  return viewportPoint((a.x + b.x) / 2, (a.y + b.y) / 2)
}

function isChromeTarget(t: EventTarget | null): boolean {
  return !!(t as HTMLElement | null)?.closest?.('.chrome')
}

function onWheel(e: WheelEvent): void {
  if (!fullscreen.value) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    const { x, y } = viewportPoint(e.clientX, e.clientY)
    const factor = wheelZoomFactor(e.deltaY)
    const measured = measureViewportAndContent()
    const insets = measureChromeInsets()
    const min = measured
      ? sheetZoomMinScale(measured.viewport, measured.content, insets)
      : undefined
    layoutIsFitted = false
    commitZoomPan(zoomSheetAt(zoomPan.value, x, y, zoomPan.value.scale * factor, min))
    return
  }
  commitZoomPan(panSheet(zoomPan.value, -e.deltaX, -e.deltaY))
  syncPageIndexFromPan()
}

function onPointerDown(e: PointerEvent): void {
  if (!fullscreen.value) return
  if (isChromeTarget(e.target)) return

  ;(e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId)
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

  if (pointers.size === 2) {
    dragging = false
    pinchStartDist = pointerDistance()
    pinchStartScale = zoomPan.value.scale
    gesturePanX = 0
    gesturePanY = 0
  } else if (pointers.size === 1) {
    dragging = true
    lastDragX = e.clientX
    lastDragY = e.clientY
    gesturePanX = 0
    gesturePanY = 0
  }
}

function onPointerMove(e: PointerEvent): void {
  if (!fullscreen.value || !pointers.has(e.pointerId)) return
  pointers.set(e.pointerId, { id: e.pointerId, x: e.clientX, y: e.clientY })

  if (pointers.size >= 2 && pinchStartDist > 0) {
    const dist = pointerDistance()
    if (dist <= 0) return
    const mid = pointerMidpoint()
    const next = pinchStartScale * (dist / pinchStartDist)
    const measured = measureViewportAndContent()
    const insets = measureChromeInsets()
    const min = measured
      ? sheetZoomMinScale(measured.viewport, measured.content, insets)
      : undefined
    layoutIsFitted = false
    commitZoomPan(zoomSheetAt(zoomPan.value, mid.x, mid.y, next, min))
    return
  }

  if (dragging && pointers.size === 1) {
    const dx = e.clientX - lastDragX
    const dy = e.clientY - lastDragY
    lastDragX = e.clientX
    lastDragY = e.clientY
    gesturePanX += dx
    gesturePanY += dy
    commitZoomPan(panSheet(zoomPan.value, dx, dy))
  }
}

function fitScaleNow(): number {
  const measured = measureViewportAndContent()
  if (!measured) return 1
  const insets = measureChromeInsets()
  return fitSheetZoomPan(
    fitMode.value,
    measured.viewport,
    measured.content,
    { insets },
  ).scale
}

/** At (or near) session fit, horizontal swipe turns pages instead of only panning. */
function tryPageSwipe(): void {
  if (fsScrollMode.value) return
  if (displayPages.value.length <= 1) return
  const fit = fitScaleNow()
  if (zoomPan.value.scale > fit * 1.08) return
  const ax = Math.abs(gesturePanX)
  const ay = Math.abs(gesturePanY)
  if (ax < PAGE_SWIPE_MIN_PX || ax < ay * 1.15) return
  goPage(gesturePanX < 0 ? 1 : -1)
}

function onPointerUp(e: PointerEvent): void {
  pointers.delete(e.pointerId)
  if (pointers.size < 2) {
    pinchStartDist = 0
  }
  if (pointers.size === 1) {
    const rem = [...pointers.values()][0]!
    dragging = true
    lastDragX = rem.x
    lastDragY = rem.y
  } else if (pointers.size === 0) {
    if (dragging) {
      tryPageSwipe()
      syncPageIndexFromPan()
    }
    dragging = false
    gesturePanX = 0
    gesturePanY = 0
  }
}

function onDoubleClick(e: MouseEvent): void {
  if (!fullscreen.value) return
  if (isChromeTarget(e.target)) return
  const measured = measureViewportAndContent()
  const insets = measured ? measureChromeInsets() : { top: 0, bottom: 0 }
  const fitScale = measured
    ? fitSheetZoomPan(fitMode.value, measured.viewport, measured.content, { insets }).scale
    : 1
  // Already past the session fit scale → reset to Fit width / Fit all; otherwise zoom in.
  if (zoomPan.value.scale > fitScale * 1.08) {
    applyFit(fitMode.value)
    return
  }
  const { x, y } = viewportPoint(e.clientX, e.clientY)
  const min = measured
    ? sheetZoomMinScale(measured.viewport, measured.content, insets)
    : undefined
  layoutIsFitted = false
  commitZoomPan(zoomSheetAt(zoomPan.value, x, y, Math.max(2.5, fitScale * 2), min))
}

watch(
  () => resolvedImageSets.value.length + resolvedPdfs.value.length,
  (n) => {
    if (!n && fullscreen.value) setFullscreen(false)
  },
)

watch(displayPages, (pages, prev) => {
  if (!prev || pages.length !== prev.length) {
    pageIndex.value = 0
  } else {
    pageIndex.value = Math.min(pageIndex.value, Math.max(0, pages.length - 1))
  }
  if (fullscreen.value) void enterFullscreenLayout()
})

watch(
  () => props.autoEnterFullscreen,
  (auto) => {
    // New deep-link (or query restored) may auto-enter again.
    if (auto) suppressAutoEnter.value = false
  },
)

watch(
  () => [props.autoEnterFullscreen, displayPages.value.length] as const,
  ([auto, n]) => {
    if (auto && n > 0 && !fullscreen.value && !suppressAutoEnter.value) setFullscreen(true)
  },
  { immediate: true },
)

watch(sheetEl, (el, prev) => {
  prev?.removeEventListener('wheel', onWheel)
  el?.addEventListener('wheel', onWheel, { passive: false })
})

onMounted(() => {
  window.addEventListener('keydown', onKey)
  window.addEventListener('popstate', onPopState)
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  window.removeEventListener('popstate', onPopState)
  detachFsViewportListeners()
  detachChromeLayoutObserver()
  sheetEl.value?.removeEventListener('wheel', onWheel)
  setScrollLock(false)
  setShellInert(false)
  void releaseWakeLock('sheet')
  loadAbort?.abort()
  clearUpgradeLayer(true)
  revokeOwned()
})

defineExpose({
  setFullscreen,
  enterFullscreen: () => setFullscreen(true),
  exitFullscreen: () => setFullscreen(false),
  isFullscreen: () => fullscreen.value,
  /** Test / parent helpers for session fit mode. */
  fitMode: () => fitMode.value,
  /** Test helper — current stage zoom/pan. */
  zoomPanState: () => ({ ...zoomPan.value }),
  applyFitMode: (mode: SheetFitMode) => applyFit(mode),
  pageMode: () => prefs.sheetFsPageMode,
  setPageMode: (mode: SheetFsPageMode) => applyPageMode(mode),
})
</script>

<template>
  <div v-if="hasImages || hasPdf" class="wrap">
    <div
      ref="sheetEl"
      class="sheet"
      :class="{
        fullscreen,
        zoomed: fullscreen && zoomPan.scale > 1.01,
        'is-awaiting': loading && !displayPages.length,
        'sing-chrome': fullscreen && singControls,
        'fs-scroll': fsScrollMode,
      }"
      role="region"
      :aria-label="fullscreen ? 'Sheet music fullscreen' : 'Sheet music'"
      :aria-modal="fullscreen ? true : undefined"
      :aria-busy="loading"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDoubleClick"
    >
      <p v-if="loading && !displayPages.length" class="status" role="status">
        Preparing sheet…
      </p>
      <p v-else-if="loadError" class="status err" role="alert">{{ loadError }}</p>

      <div ref="stageEl" class="stage" :style="stageStyle">
        <div
          v-for="(page, i) in displayPages"
          v-show="!fullscreen || fsScrollMode || i === pageIndex"
          :key="`${mode}-${imageSetId}-${pdfId}-${i}`"
          class="page"
        >
          <img
            class="page-base"
            :src="page"
            :alt="`Sheet page ${i + 1}`"
            loading="eager"
            decoding="async"
            draggable="false"
          />
          <img
            v-if="upgradePages?.[i]"
            class="page-upgrade"
            :class="{ 'is-in': upgradeOpaque }"
            :src="upgradePages[i]"
            alt=""
            aria-hidden="true"
            loading="eager"
            decoding="async"
            draggable="false"
          />
        </div>
      </div>

      <div
        v-if="fullscreen"
        ref="chromeElRef"
        class="chrome"
        :class="{
          compact: chromeCompact,
          'chrome-expanded': !chromeCompact && !playbackOpen,
          'more-below': !chromeCompact && !playbackOpen && !moreInline,
          'play-below': playbackOpen && playbackBelow,
        }"
        role="toolbar"
        aria-label="Sheet controls"
      >
        <div
          v-if="(payKeyEnabled && displayPages.length) || singControls"
          class="chrome-pitch-cluster"
        >
          <button
            v-if="payKeyEnabled && displayPages.length"
            type="button"
            class="chrome-btn pitch-fab"
            :aria-label="`Pitch${keyLabel ? ` (${keyLabel})` : ''} — hold to hear tonic`"
            :title="keyLabel ? `${keyLabel} — hold for pitch` : 'Hold for pitch'"
            @pointerdown.prevent="emit('pay-down')"
            @pointerup.prevent="emit('pay-up')"
            @pointerleave.prevent="emit('pay-up')"
            @pointercancel.prevent="emit('pay-up')"
            @keydown="onPayKey"
            @keyup="onPayKey"
          >
            <span class="pitch-label-sizer" aria-hidden="true">{{ KEY_SHIFT_LABEL_SIZE_SAMPLE }}</span>
            <span class="pitch-label">{{ keyLabel || 'Pitch' }}</span>
          </button>

          <div v-if="singControls" class="chrome-shift" role="group" aria-label="Key shift">
            <button type="button" class="chrome-btn" :disabled="baking" aria-label="Lower pitch one semitone" @click="emit('shift-delta', -1)">−</button>
            <button type="button" class="chrome-btn" :disabled="baking" aria-label="Raise pitch one semitone" @click="emit('shift-delta', 1)">+</button>
          </div>
        </div>

        <div class="chrome-mid">
          <div
            v-if="singControls && playbackOpen"
            class="chrome-play"
            role="group"
            aria-label="Mix playback"
          >
            <button
              type="button"
              class="chrome-btn"
              :disabled="!playReady || baking"
              :aria-label="playing ? 'Pause mix' : baking ? 'Updating pitch or speed' : 'Play mix'"
              @click="emit('play-toggle')"
            >
              {{ baking ? 'Updating…' : playing ? 'Pause' : 'Play' }}
            </button>
            <label v-if="duration > 0" class="chrome-scrub">
              <span class="visually-hidden">Seek</span>
              <input
                type="range"
                min="0"
                :max="duration"
                step="0.1"
                :value="currentTime"
                :disabled="!playReady"
                @input="onSeekInput"
              />
              <span class="scrub-time">{{ fmtTime(currentTime) }}</span>
            </label>
            <button
              type="button"
              class="chrome-btn play-close"
              aria-label="Close playback controls"
              title="Close playback controls"
              @click="closePlaybackPanel"
            >
              Close
            </button>
          </div>

          <div
            v-else-if="!chromeCompact"
            class="chrome-more"
            role="group"
            aria-label="More sheet controls"
          >
            <button
              v-if="singControls"
              type="button"
              class="chrome-btn play-menu"
              :disabled="!playReady || baking"
              :aria-label="playing ? 'Pause mix' : baking ? 'Updating pitch or speed' : 'Play mix'"
              :title="baking ? 'Updating pitch/speed…' : playing ? 'Pause' : 'Play mix'"
              @click="onPlayClick"
            >
              {{ baking ? '…' : playing ? 'Pause' : 'Play' }}
            </button>

            <button
              type="button"
              class="chrome-btn share"
              :class="{ ok: shareLabel === 'Copied' || shareLabel === 'Shared' }"
              aria-label="Share this tag"
              title="Copy or share a link that opens this sheet fullscreen"
              @click.stop="emit('share')"
            >
              {{ shareLabel || 'Share' }}
            </button>

            <button
              type="button"
              class="chrome-btn tag-page"
              aria-label="Open tag page — tracks, downloads, and details. Sing mode stays on."
              title="Tag page (Sing mode stays on)"
              @click="setFullscreen(false)"
            >
              Tag Page
            </button>

            <button
              type="button"
              class="chrome-btn fit"
              :disabled="fitCycleDisabled"
              :aria-label="fitButtonTitle"
              :title="fitButtonTitle"
              @click="cycleFit"
            >
              {{ fitButtonLabel }}
            </button>
          </div>
        </div>

        <div class="chrome-trailing">
          <div
            v-if="displayPages.length > 1 && !playbackOpen"
            class="chrome-pages"
            role="group"
            aria-label="Sheet pages"
          >
            <button
              type="button"
              class="chrome-btn page-mode"
              :aria-label="pageModeButtonTitle"
              :title="pageModeButtonTitle"
              :aria-pressed="prefs.sheetFsPageMode === 'scroll'"
              @click="cyclePageMode"
            >
              {{ pageModeButtonLabel }}
            </button>
            <button
              type="button"
              class="chrome-btn"
              aria-label="Previous page"
              :disabled="pageIndex <= 0"
              @click="goPage(-1)"
            >
              ‹
            </button>
            <span class="page-ind">{{ pageIndex + 1 }}/{{ displayPages.length }}</span>
            <button
              type="button"
              class="chrome-btn"
              aria-label="Next page"
              :disabled="pageIndex >= displayPages.length - 1"
              @click="goPage(1)"
            >
              ›
            </button>
          </div>
          <button
            v-if="!playbackOpen"
            type="button"
            class="chrome-btn more"
            :class="{ 'is-expanded': !chromeCompact }"
            :aria-expanded="!chromeCompact"
            :aria-label="chromeCompact ? 'Show more sheet controls' : 'Collapse sheet controls'"
            :title="chromeCompact ? 'More controls (M)' : 'Collapse controls (M)'"
            @click="toggleChromeCompact"
          >
            <span aria-hidden="true">⋮</span>
          </button>

          <button
            type="button"
            class="chrome-btn exit"
            :aria-label="
              exitOriginLabel
                ? `Back to ${exitOriginLabel}`
                : 'Back to the page that opened this sheet'
            "
            :title="exitOriginLabel ? `Back to ${exitOriginLabel}` : 'Leave sheet'"
            @click="exitToOrigin"
          >
            ✕
          </button>
        </div>
      </div>
    </div>

    <div v-if="showPickers" class="pickers">
      <div
        v-if="showFormatToggle"
        class="ctrl-segment format"
        role="group"
        aria-label="Sheet music format"
      >
        <button type="button" :aria-pressed="mode === 'images'" @click="setMode('images')">
          Images
        </button>
        <button type="button" :aria-pressed="mode === 'pdf'" @click="setMode('pdf')">
          PDF
        </button>
      </div>

      <label v-if="canChooseImageSet" class="file-pick">
        <span class="file-lbl">Image file</span>
        <select v-model="imageSetId" aria-label="Choose image sheet">
          <option v-for="set in resolvedImageSets" :key="set.id" :value="set.id">
            {{ set.label }}
          </option>
        </select>
      </label>

      <label v-if="canChoosePdf" class="file-pick">
        <span class="file-lbl">PDF file</span>
        <select v-model="pdfId" aria-label="Choose PDF sheet">
          <option v-for="file in resolvedPdfs" :key="file.id" :value="file.id">
            {{ file.label }}
          </option>
        </select>
      </label>
    </div>
  </div>
  <p v-else class="muted" role="status">No sheet music available.</p>
</template>

<style scoped>
.wrap {
  display: grid;
  gap: 0.55rem;
  min-width: 0;
  max-width: 100%;
}
.pickers {
  display: grid;
  gap: 0.55rem;
  min-width: 0;
  max-width: 100%;
}
.format {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  max-width: min(20rem, 100%);
  width: 100%;
}
.file-pick {
  display: grid;
  gap: 0.3rem;
  max-width: min(24rem, 100%);
  min-width: 0;
}
.file-lbl {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.file-pick select {
  min-height: 44px;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 0.95rem;
  padding: 0.45rem 0.65rem;
}
.file-pick select:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.sheet {
  position: relative;
  display: grid;
  gap: 0.75rem;
  max-height: 75vh;
  max-width: 100%;
  min-width: 0;
  overflow: auto;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem;
  -webkit-overflow-scrolling: touch;
}

.sheet.is-awaiting {
  min-height: min(60vh, 48rem);
}

.sheet.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 60;
  width: 100%;
  height: 100%;
  height: 100dvh;
  max-height: 100dvh;
  border-radius: 0;
  border: 0;
  padding: 0;
  background: #0d0d0d;
  overflow: hidden;
  overflow: clip;
  touch-action: none;
  overscroll-behavior: none;
  -webkit-overflow-scrolling: auto;
  display: block;
  /* Pan/zoom is transform-based; never show a native scrollbar. */
  scrollbar-width: none;
}
.sheet.fullscreen::-webkit-scrollbar {
  display: none;
  width: 0;
  height: 0;
}
.stage {
  display: grid;
  gap: 0.75rem;
  min-width: 0;
}
.sheet.fullscreen .stage {
  gap: 0;
  width: 100%;
  transform-origin: 0 0;
  will-change: transform;
  user-select: none;
  -webkit-user-select: none;
}
.sheet.fullscreen.fs-scroll .stage {
  gap: 0.35rem;
}
.chrome {
  position: absolute;
  top: calc(0.5rem + env(safe-area-inset-top));
  right: calc(0.5rem + env(safe-area-inset-right));
  left: calc(0.5rem + env(safe-area-inset-left));
  z-index: 80;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  grid-template-areas: 'pitch mid trailing';
  align-items: center;
  column-gap: 0.45rem;
  row-gap: 0.45rem;
  pointer-events: none;
}
.chrome.more-below,
.chrome.play-below {
  grid-template-areas:
    'pitch . trailing'
    'mid mid mid';
}
.chrome-pitch-cluster {
  grid-area: pitch;
}
.chrome-mid {
  grid-area: mid;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  justify-content: flex-end;
  gap: 0.45rem;
  min-width: 0;
  pointer-events: none;
}
.chrome.more-below .chrome-mid,
.chrome.play-below .chrome-mid {
  justify-content: flex-end;
  width: 100%;
}
.chrome-trailing {
  grid-area: trailing;
  display: flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}
.chrome-more,
.chrome-play {
  display: inline-flex;
  flex-wrap: nowrap;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}
.chrome-mid > *,
.chrome-more > *,
.chrome-trailing > *,
.chrome-play > * {
  pointer-events: auto;
  flex-shrink: 0;
}
.chrome-btn {
  box-sizing: border-box;
  min-height: 44px;
  min-width: 44px;
  padding: 0 0.85rem;
  border: 1px solid rgba(255, 255, 255, 0.28);
  border-radius: 12px;
  background: rgba(20, 20, 20, 0.38);
  color: #fff;
  font: inherit;
  font-size: 0.92rem;
  font-weight: 600;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.35rem;
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  box-shadow: 0 1px 6px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  touch-action: manipulation;
  user-select: none;
}
.chrome-btn:hover:not(:disabled) {
  background: rgba(40, 40, 40, 0.52);
}
.chrome-btn:disabled {
  opacity: 0.4;
  cursor: default;
}
.chrome-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.chrome-btn.share.ok,
.chrome-btn.more.is-expanded {
  border-color: color-mix(in srgb, var(--accent) 55%, rgba(255, 255, 255, 0.28));
  color: #fff;
  background: color-mix(in srgb, var(--accent) 35%, rgba(20, 20, 20, 0.38));
}
.chrome-btn.exit {
  width: 44px;
  padding: 0;
  font-size: 1.25rem;
  font-weight: 500;
}
.chrome-btn.more {
  width: 44px;
  padding: 0;
  font-size: 1.35rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  line-height: 1;
}
.chrome-btn.tag-page {
  min-width: 5.5rem;
  font-weight: 700;
}
.chrome-btn.pitch-fab {
  /* Width from invisible max-label sizer so ± don’t move as the key text changes. */
  display: inline-grid;
  justify-items: center;
  align-items: center;
  width: max-content;
  min-width: 0;
  max-width: none;
  padding: 0 0.55rem;
  flex-shrink: 0;
}
.chrome-pitch-cluster {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
  pointer-events: none;
}
.chrome-pitch-cluster > * {
  pointer-events: auto;
}
.chrome-shift {
  flex-shrink: 0;
}
.chrome-btn.fit {
  min-width: 5.75rem;
}
.chrome-shift,
.chrome-pages {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.page-ind {
  color: #fff;
  font-size: 0.85rem;
  font-weight: 600;
  min-width: 2.75rem;
  text-align: center;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.5);
}
.chrome-scrub {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  min-width: min(12rem, 40vw);
}
.chrome-scrub input[type='range'] {
  width: min(10rem, 32vw);
}
.scrub-time {
  color: #fff;
  font-size: 0.8rem;
  font-variant-numeric: tabular-nums;
  min-width: 2.5rem;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (orientation: landscape) and (max-height: 560px) {
  .sheet.fullscreen.sing-chrome .chrome {
    top: auto;
    bottom: calc(0.4rem + env(safe-area-inset-bottom));
  }
}
.page {
  position: relative;
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
}
.page img {
  width: 100%;
  height: auto;
  display: block;
  background: #fff;
  margin: 0;
}
.page-upgrade {
  position: absolute;
  left: 0;
  top: 0;
  width: 100%;
  height: auto;
  opacity: 0;
  transition: opacity 0.28s ease;
  pointer-events: none;
}
.page-upgrade.is-in {
  opacity: 1;
}
@media (prefers-reduced-motion: reduce) {
  .page-upgrade {
    transition: none;
  }
}
.sheet.fullscreen .page {
  max-width: none;
  margin: 0;
}
.sheet.fullscreen .page img {
  pointer-events: none;
}
.status {
  margin: 0;
  padding: 1.25rem 0.75rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.95rem;
}
.status.err {
  color: var(--danger, #b42318);
}
.pitch-label-sizer,
.pitch-label {
  grid-area: 1 / 1;
  white-space: nowrap;
  line-height: 1.1;
  text-align: center;
}
.pitch-label-sizer {
  visibility: hidden;
  pointer-events: none;
  user-select: none;
}
.muted {
  color: var(--muted);
}
</style>
