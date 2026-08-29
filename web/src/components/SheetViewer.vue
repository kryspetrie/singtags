<script setup lang="ts">
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
  fitSheetZoomPan,
  identitySheetZoomPan,
  panSheet,
  sheetZoomPanCss,
  wheelZoomFactor,
  zoomSheetAt,
  type SheetFitMode,
  type SheetZoomPan,
} from '../lib/sheetZoomPan'

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
    /** Crop whitespace margins on displayed pages (images + rendered PDFs). */
    cropToContent?: boolean
    /**
     * Default view pages already prepared by the parent (cropped offscreen).
     * When set for the initial image set, skip a second crop pass.
     */
    prefetchedPages?: string[] | null
  }>(),
  {
    pages: () => [],
    pdf: null,
    imageSets: () => [],
    pdfs: () => [],
    canChooseFormat: false,
    cropToContent: true,
    prefetchedPages: null,
  },
)

const emit = defineEmits<{
  'pay-down': []
  'pay-up': []
  'fullscreen-change': [boolean]
}>()

const fullscreen = ref(false)
const mode = ref<SheetDisplayMode>('images')
const imageSetId = ref('')
const pdfId = ref('')
const displayPages = ref<string[]>([])
const loading = ref(false)
const loadError = ref<string | null>(null)
const ownedUrls = ref<string[]>([])
let loadAbort: AbortController | null = null
let loadSeq = 0
/** Auto-switched to PDF raster for fullscreen sharpness; revert on exit. */
let autoPdfForFullscreen = false

const sheetEl = ref<HTMLElement | null>(null)
const stageEl = ref<HTMLElement | null>(null)
const zoomPan = ref<SheetZoomPan>(identitySheetZoomPan())
const fitMode = ref<SheetFitMode>('width')

const stageStyle = computed(() =>
  fullscreen.value ? { transform: sheetZoomPanCss(zoomPan.value) } : undefined,
)
const fitButtonLabel = computed(() => (fitMode.value === 'width' ? 'Fit width' : 'Fit all'))
const fitButtonTitle = computed(() =>
  fitMode.value === 'width'
    ? 'Fit mode: width — tap for fit all'
    : 'Fit mode: all — tap for fit width',
)

type ActivePointer = { id: number; x: number; y: number }
const pointers = new Map<number, ActivePointer>()
let pinchStartDist = 0
let pinchStartScale = 1
let dragging = false
let lastDragX = 0
let lastDragY = 0

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

function revokeOwned(): void {
  for (const u of ownedUrls.value) URL.revokeObjectURL(u)
  ownedUrls.value = []
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
  loadAbort = new AbortController()
  const { signal } = loadAbort
  const seq = ++loadSeq
  loadError.value = null

  if (showingPdf.value) {
    const pdf = activePdf.value
    if (!pdf) return
    const pdfUrl = src(pdf.path, props.baseUrl)
    const cacheKey = pdfRasterCacheKey(pdfUrl, { crop: props.cropToContent })

    const applyPages = (urls: string[]) => {
      const previousOwned = ownedUrls.value
      ownedUrls.value = urls
      displayPages.value = urls
      for (const u of previousOwned) URL.revokeObjectURL(u)
    }

    // Session cache: high-res immediately, skip low-res flash.
    const memHit = pdfRasterMemoryHit(cacheKey)
    if (memHit) {
      applyPages(memHit)
      loading.value = false
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
        applyPages(idbHit)
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
      applyPages(urls)
      void putPdfRasterFromObjectUrls(cacheKey, urls)
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
    return
  }

  // Show WebP immediately; optional content-crop upgrades in place.
  if (!props.cropToContent) {
    revokeOwned()
    displayPages.value = preview
    return
  }

  // Paint raw first so crop never blanks the stage.
  displayPages.value = preview

  loading.value = true
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
    const previousOwned = ownedUrls.value
    ownedUrls.value = owned
    displayPages.value = next
    for (const u of previousOwned) URL.revokeObjectURL(u)
  } catch (e) {
    if (signal.aborted || seq !== loadSeq) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    displayPages.value = preview
  } finally {
    if (seq === loadSeq) loading.value = false
  }
}

watch(
  () =>
    [
      mode.value,
      imageSetId.value,
      pdfId.value,
      props.cropToContent,
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
  const width = stage.offsetWidth
  const height = stage.scrollHeight
  if (vr.width <= 0 || vr.height <= 0 || width <= 0 || height <= 0) return null
  return {
    viewport: { width: vr.width, height: vr.height },
    content: { width, height },
  }
}

function applyFit(next: SheetFitMode): void {
  fitMode.value = next
  const measured = measureViewportAndContent()
  if (!measured) {
    zoomPan.value = identitySheetZoomPan()
    return
  }
  zoomPan.value = fitSheetZoomPan(next, measured.viewport, measured.content)
}

function cycleFit(): void {
  applyFit(fitMode.value === 'width' ? 'all' : 'width')
}

async function waitForImages(): Promise<void> {
  await nextTick()
  const stage = stageEl.value
  if (!stage) return
  const imgs = [...stage.querySelectorAll('img')]
  await Promise.all(
    imgs.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true })
            img.addEventListener('error', () => resolve(), { once: true })
          }),
    ),
  )
  await nextTick()
}

async function enterFullscreenLayout(): Promise<void> {
  fitMode.value = 'all'
  await waitForImages()
  applyFit('all')
}

function setScrollLock(on: boolean): void {
  const v = on ? 'hidden' : ''
  document.documentElement.style.overflow = v
  document.body.style.overflow = v
}

function setFullscreen(on: boolean): void {
  fullscreen.value = on
  pointers.clear()
  dragging = false
  pinchStartDist = 0
  if (on) {
    // Upgrade to PDF raster in fullscreen when available; keep WebP until ready.
    if (hasPdf.value && hasImages.value && mode.value === 'images') {
      autoPdfForFullscreen = true
      mode.value = 'pdf'
    }
    void enterFullscreenLayout()
  } else {
    if (autoPdfForFullscreen && hasImages.value) {
      autoPdfForFullscreen = false
      mode.value = 'images'
    }
    zoomPan.value = identitySheetZoomPan()
  }
  emit('fullscreen-change', on)
  setScrollLock(on)
}

function toggleFullscreen(): void {
  setFullscreen(!fullscreen.value)
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape' && fullscreen.value) {
    e.preventDefault()
    setFullscreen(false)
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
  return !!(t as HTMLElement | null)?.closest?.('.chrome, .fs-fab')
}

function onWheel(e: WheelEvent): void {
  if (!fullscreen.value) return
  e.preventDefault()
  if (e.ctrlKey || e.metaKey) {
    const { x, y } = viewportPoint(e.clientX, e.clientY)
    const factor = wheelZoomFactor(e.deltaY)
    zoomPan.value = zoomSheetAt(zoomPan.value, x, y, zoomPan.value.scale * factor)
    return
  }
  zoomPan.value = panSheet(zoomPan.value, -e.deltaX, -e.deltaY)
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
  } else if (pointers.size === 1) {
    dragging = true
    lastDragX = e.clientX
    lastDragY = e.clientY
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
    zoomPan.value = zoomSheetAt(zoomPan.value, mid.x, mid.y, next)
    return
  }

  if (dragging && pointers.size === 1) {
    const dx = e.clientX - lastDragX
    const dy = e.clientY - lastDragY
    lastDragX = e.clientX
    lastDragY = e.clientY
    zoomPan.value = panSheet(zoomPan.value, dx, dy)
  }
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
    dragging = false
  }
}

function onDoubleClick(e: MouseEvent): void {
  if (!fullscreen.value) return
  if (isChromeTarget(e.target)) return
  if (zoomPan.value.scale > 1.05 || fitMode.value === 'all') {
    applyFit('width')
    return
  }
  const { x, y } = viewportPoint(e.clientX, e.clientY)
  zoomPan.value = zoomSheetAt(zoomPan.value, x, y, 2.5)
}

watch(
  () => resolvedImageSets.value.length + resolvedPdfs.value.length,
  (n) => {
    if (!n && fullscreen.value) setFullscreen(false)
  },
)

watch(displayPages, () => {
  if (fullscreen.value) void enterFullscreenLayout()
})

watch(sheetEl, (el, prev) => {
  prev?.removeEventListener('wheel', onWheel)
  el?.addEventListener('wheel', onWheel, { passive: false })
})

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  sheetEl.value?.removeEventListener('wheel', onWheel)
  setScrollLock(false)
  loadAbort?.abort()
  revokeOwned()
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
      }"
      role="region"
      :aria-label="fullscreen ? 'Sheet music fullscreen' : 'Sheet music'"
      :aria-busy="loading"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @dblclick="onDoubleClick"
    >
      <button
        v-if="!fullscreen"
        type="button"
        class="fs-fab"
        aria-label="Fullscreen sheet"
        title="Fullscreen"
        @click="toggleFullscreen"
      >
        <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
          <path
            fill="currentColor"
            d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"
          />
        </svg>
      </button>

      <p v-if="loading && !displayPages.length" class="status" role="status">
        Preparing sheet…
      </p>
      <p v-else-if="loadError" class="status err" role="alert">{{ loadError }}</p>

      <div ref="stageEl" class="stage" :style="stageStyle">
        <img
          v-for="(page, i) in displayPages"
          :key="`${mode}-${imageSetId}-${pdfId}-${i}`"
          :src="page"
          :alt="`Sheet page ${i + 1}`"
          loading="eager"
          decoding="async"
          draggable="false"
        />
      </div>

      <div v-if="fullscreen" class="chrome" role="toolbar" aria-label="Sheet controls">
        <button
          v-if="payKeyEnabled && displayPages.length"
          type="button"
          class="chrome-btn pitch-fab"
          :aria-label="`Pitch${keyLabel ? ` (${keyLabel})` : ''} — hold to hear tonic`"
          title="Hold for pitch"
          @pointerdown.prevent="emit('pay-down')"
          @pointerup.prevent="emit('pay-up')"
          @pointerleave.prevent="emit('pay-up')"
          @pointercancel.prevent="emit('pay-up')"
          @keydown="onPayKey"
          @keyup="onPayKey"
        >
          <span class="pitch-label">{{ keyLabel || 'Pitch' }}</span>
        </button>

        <button
          type="button"
          class="chrome-btn fit"
          :aria-label="fitButtonTitle"
          :title="fitButtonTitle"
          @click="cycleFit"
        >
          {{ fitButtonLabel }}
        </button>

        <button
          type="button"
          class="chrome-btn exit"
          aria-label="Exit fullscreen"
          title="Close"
          @click="setFullscreen(false)"
        >
          ✕
        </button>
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
.fs-fab {
  position: absolute;
  top: 0.9rem;
  right: 0.9rem;
  z-index: 3;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: color-mix(in srgb, var(--surface) 88%, transparent);
  color: var(--text);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.18);
  backdrop-filter: blur(6px);
  cursor: pointer;
  touch-action: manipulation;
}
.fs-fab:hover {
  background: var(--surface);
}
.fs-fab:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.fs-fab svg {
  width: 24px;
  height: 24px;
}
.chrome {
  position: absolute;
  top: calc(0.5rem + env(safe-area-inset-top));
  right: calc(0.5rem + env(safe-area-inset-right));
  left: calc(0.5rem + env(safe-area-inset-left));
  z-index: 80;
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  align-items: center;
  gap: 0.45rem;
  pointer-events: none;
}
.chrome > * {
  pointer-events: auto;
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
.chrome-btn:hover {
  background: rgba(40, 40, 40, 0.52);
}
.chrome-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.chrome-btn.exit {
  width: 44px;
  padding: 0;
  font-size: 1.25rem;
  font-weight: 500;
}
.chrome-btn.fit {
  min-width: 5.75rem;
}
.pitch-fab {
  margin-right: auto;
}
.sheet img {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  height: auto;
  display: block;
  background: #fff;
}
.sheet.fullscreen img {
  width: 100%;
  max-width: none;
  margin: 0;
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
.pitch-label {
  line-height: 1.1;
}
.muted {
  color: var(--muted);
}
</style>
