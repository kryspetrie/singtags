<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { mediaUrl } from '../lib/mediaUrl'
import type { SheetImageSet, SheetPdfFile } from '../lib/sheetAssets'
import { cropImageUrl } from '../lib/contentCrop'
import { renderPdfToPageUrls } from '../lib/pdfRender'

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
    /** When set, show a floating hold-to-sound pitch control in fullscreen. */
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
    // First-open / tag change: prefer images when available.
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

async function rebuildDisplay(): Promise<void> {
  loadAbort?.abort()
  loadAbort = new AbortController()
  const { signal } = loadAbort
  const seq = ++loadSeq
  revokeOwned()
  displayPages.value = []
  loadError.value = null

  if (showingPdf.value) {
    const pdf = activePdf.value
    if (!pdf) return
    loading.value = true
    try {
      const urls = await renderPdfToPageUrls(src(pdf.path, props.baseUrl), {
        crop: props.cropToContent,
        signal,
      })
      if (signal.aborted || seq !== loadSeq) {
        for (const u of urls) URL.revokeObjectURL(u)
        return
      }
      ownedUrls.value = urls
      displayPages.value = urls
    } catch (e) {
      if (signal.aborted || seq !== loadSeq) return
      loadError.value = e instanceof Error ? e.message : String(e)
    } finally {
      if (seq === loadSeq) loading.value = false
    }
    return
  }

  // Prefer parent-prefetched pages for the default image set (no second crop / flash).
  const paths = activeImageSet.value?.paths ?? []
  if (!paths.length) return
  const raw = paths.map((p) => src(p, props.baseUrl))
  const prefetch = props.prefetchedPages
  const defaultSetId = resolvedImageSets.value[0]?.id
  const canUsePrefetch =
    !!prefetch?.length &&
    activeImageSet.value?.id === defaultSetId &&
    prefetch.length === paths.length

  if (canUsePrefetch) {
    displayPages.value = prefetch!
    return
  }

  if (!props.cropToContent) {
    displayPages.value = raw
    return
  }

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
    ownedUrls.value = owned
    displayPages.value = next
  } catch (e) {
    if (signal.aborted || seq !== loadSeq) return
    if (e instanceof DOMException && e.name === 'AbortError') return
    displayPages.value = raw
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

function setFullscreen(on: boolean): void {
  fullscreen.value = on
  emit('fullscreen-change', on)
  document.body.style.overflow = on ? 'hidden' : ''
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

watch(
  () => resolvedImageSets.value.length + resolvedPdfs.value.length,
  (n) => {
    if (!n && fullscreen.value) setFullscreen(false)
  },
)

onMounted(() => window.addEventListener('keydown', onKey))
onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  document.body.style.overflow = ''
  loadAbort?.abort()
  revokeOwned()
})
</script>

<template>
  <div v-if="hasImages || hasPdf" class="wrap">
    <div
      class="sheet"
      :class="{ fullscreen }"
      role="region"
      :aria-label="fullscreen ? 'Sheet music fullscreen' : 'Sheet music'"
      :aria-busy="loading"
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
      <div v-if="fullscreen" class="chrome">
        <button type="button" class="exit" aria-label="Exit fullscreen" @click="setFullscreen(false)">
          ✕
        </button>
      </div>

      <p v-if="loading && !displayPages.length" class="status" role="status">
        {{ showingPdf ? 'Preparing PDF…' : 'Preparing sheet…' }}
      </p>
      <p v-else-if="loadError" class="status err" role="alert">{{ loadError }}</p>

      <img
        v-for="(page, i) in displayPages"
        :key="`${mode}-${imageSetId}-${pdfId}-${i}-${page}`"
        :src="page"
        :alt="`Sheet page ${i + 1}`"
        loading="lazy"
        decoding="async"
      />

      <button
        v-if="fullscreen && payKeyEnabled && displayPages.length"
        type="button"
        class="pitch-fab"
        :aria-label="`Pitch${keyLabel ? ` (${keyLabel})` : ''} — hold to hear tonic`"
        @pointerdown.prevent="emit('pay-down')"
        @pointerup.prevent="emit('pay-up')"
        @pointerleave.prevent="emit('pay-up')"
        @pointercancel.prevent="emit('pay-up')"
        @keydown="onPayKey"
        @keyup="onPayKey"
      >
        <span class="pitch-label">{{ keyLabel || 'Pitch' }}</span>
      </button>
    </div>

    <div v-if="showPickers" class="pickers">
      <div
        v-if="showFormatToggle"
        class="ctrl-segment format"
        role="group"
        aria-label="Sheet music format"
      >
        <button
          type="button"
          :aria-pressed="mode === 'images'"
          @click="setMode('images')"
        >
          Images
        </button>
        <button
          type="button"
          :aria-pressed="mode === 'pdf'"
          @click="setMode('pdf')"
        >
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
.sheet.fullscreen {
  position: fixed;
  inset: 0;
  z-index: 60;
  max-height: none;
  border-radius: 0;
  border: 0;
  padding: calc(0.5rem + env(safe-area-inset-top)) 0.5rem
    calc(5.5rem + env(safe-area-inset-bottom));
  background: #0d0d0d;
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
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  justify-content: flex-end;
  pointer-events: none;
}
.exit {
  pointer-events: auto;
  box-sizing: border-box;
  width: 48px;
  height: 48px;
  min-width: 48px;
  min-height: 48px;
  padding: 0;
  border: 0;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.18);
  color: #fff;
  font-size: 1.35rem;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(6px);
}
.sheet img {
  width: 100%;
  max-width: 960px;
  margin: 0 auto;
  height: auto;
  display: block;
  background: #fff;
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
.pitch-fab {
  position: fixed;
  left: 50%;
  bottom: calc(1rem + env(safe-area-inset-bottom));
  transform: translateX(-50%);
  z-index: 70;
  min-width: min(280px, calc(100vw - 2rem));
  min-height: 56px;
  padding: 0.65rem 1.25rem;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 700;
  font-size: 1.05rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.1rem;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.35);
  touch-action: manipulation;
  user-select: none;
}
.pitch-fab:active {
  filter: brightness(0.92);
  transform: translateX(-50%) scale(0.98);
}
.pitch-label {
  line-height: 1.1;
}
.muted {
  color: var(--muted);
}
</style>
