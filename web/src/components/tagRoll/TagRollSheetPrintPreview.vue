<script setup lang="ts">
/**
 * Print preview for Tag Studio page layout — Letter/A4 frames + browser print.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { TagRollProject } from '../../lib/tagRoll/types'
import {
  renderVexSheetScore,
  type VexScoreLayoutResult,
} from '../../lib/tagRoll/sheetScore/renderVexScore'
import { sheetPageHeightPx, sheetPageWidthPx } from '../../lib/tagRoll/sheetPage'

const props = defineProps<{
  project: TagRollProject
}>()

const emit = defineEmits<{
  close: []
}>()

const hostRef = ref<HTMLElement | null>(null)
const layout = ref<VexScoreLayoutResult | null>(null)
const error = ref<string | null>(null)
let gen = 0

const pageW = computed(() =>
  sheetPageWidthPx(props.project.view.sheetPageWidthIn ?? 8.5, props.project.view.sheetPageDpi ?? 96),
)
const pageH = computed(() =>
  sheetPageHeightPx(
    props.project.view.sheetPageHeightIn ?? 11,
    props.project.view.sheetPageDpi ?? 96,
  ),
)
const pageCount = computed(() => Math.max(1, layout.value?.pages.length ?? 1))

async function render(): Promise<void> {
  const host = hostRef.value
  if (!host) return
  const g = ++gen
  error.value = null
  try {
    const next = await renderVexSheetScore({
      host,
      project: props.project,
      pxPerBeat: props.project.view.sheetZoom,
      showLyrics: props.project.view.sheetShowLyrics !== false,
      sheetLayout: 'page',
      measureSizing: props.project.view.sheetMeasureSizing ?? 'dynamic',
      pageWidthIn: props.project.view.sheetPageWidthIn ?? 8.5,
      pageHeightIn: props.project.view.sheetPageHeightIn ?? 11,
      pageDpi: props.project.view.sheetPageDpi ?? 96,
      headerBandPx:
        props.project.view.sheetShowEngravedHeader !== false &&
        !!(
          props.project.title?.trim() ||
          props.project.subtitle?.trim() ||
          props.project.composer?.trim() ||
          props.project.arranger?.trim()
        )
          ? Math.round(92 * (props.project.view.sheetScoreScale ?? 1))
          : 0,
      noteColors: props.project.view.sheetNoteColors === true,
      staveGap: props.project.view.sheetStaveGap ?? 'normal',
      measureScale: props.project.view.sheetMeasureScale ?? 1,
      noteSpacing: props.project.view.sheetNoteSpacing ?? 1,
      beatStretch: props.project.view.sheetBeatStretch ?? 1,
      staveGapFine: props.project.view.sheetStaveGapFine ?? 1,
      systemGap: props.project.view.sheetSystemGap ?? 1,
      topMargin: props.project.view.sheetTopMargin ?? 1,
      lyricSize: props.project.view.sheetLyricSize ?? 12,
      lyricOffsets: props.project.view.sheetLyricOffsets ?? {},
      paddingScale: props.project.view.sheetPadding ?? 1,
      minBarWidth: props.project.view.sheetMinBarWidth ?? 1,
      clefGutter: props.project.view.sheetClefGutter ?? 1,
      timeFactor: props.project.view.sheetTimeFactor ?? 1,
      bottomMargin: props.project.view.sheetBottomMargin ?? 1,
      musicFont: props.project.view.sheetMusicFont,
      textFont: props.project.view.sheetTextFont,
      staffLineWeight: props.project.view.sheetStaffLineWeight ?? 1,
      showPartNames: props.project.view.sheetPartNames === true,
      marginLeftIn: props.project.view.sheetMarginLeftIn ?? 0.3,
      marginRightIn: props.project.view.sheetMarginRightIn ?? 0.3,
      marginTopIn: props.project.view.sheetMarginTopIn ?? 0.3,
      marginBottomIn: props.project.view.sheetMarginBottomIn ?? 0.3,
      engravingScale: props.project.view.sheetEngravingScale ?? 1,
      scoreScale: props.project.view.sheetScoreScale ?? 1,
    })
    if (g !== gen) return
    layout.value = next
  } catch (e) {
    if (g !== gen) return
    error.value = e instanceof Error ? e.message : 'Print preview failed'
    layout.value = null
  }
}

function onPrint(): void {
  window.print()
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault()
    emit('close')
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  void render()
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey)
  gen++
})

watch(
  () => [
    props.project.view.sheetZoom,
    props.project.view.sheetMeasureSizing,
    props.project.view.sheetPageWidthIn,
    props.project.view.sheetPageHeightIn,
    props.project.notes,
    props.project.lengthTicks,
  ],
  () => void render(),
  { deep: true },
)
</script>

<template>
  <div class="print-overlay" role="dialog" aria-modal="true" aria-label="Print preview">
    <header class="bar no-print">
      <div>
        <h2 class="title">Print preview</h2>
        <p class="sub">
          {{ pageCount }} page{{ pageCount === 1 ? '' : 's' }} ·
          {{ (project.view.sheetPageWidthIn ?? 8.5).toFixed(2) }}″ ×
          {{ (project.view.sheetPageHeightIn ?? 11).toFixed(2) }}″
        </p>
      </div>
      <div class="actions">
        <button type="button" class="btn" @click="onPrint">Print…</button>
        <button type="button" class="btn ghost" @click="emit('close')">Close</button>
      </div>
    </header>
    <p v-if="error" class="err no-print" role="alert">{{ error }}</p>
    <div class="canvas-wrap">
      <div
        class="canvas"
        :style="{
          width: `${pageW}px`,
          minHeight: `${layout?.height ?? pageH}px`,
        }"
      >
        <div
          v-for="pg in layout?.pages ?? [{ index: 0, y: 0, width: pageW, height: pageH }]"
          :key="pg.index"
          class="sheet-page"
          :style="{
            width: `${pg.width}px`,
            height: `${pg.height}px`,
            top: `${pg.y}px`,
          }"
        />
        <div ref="hostRef" class="score" />
      </div>
    </div>
  </div>
</template>

<style scoped>
.print-overlay {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, #1a1a1a 55%, transparent);
  backdrop-filter: blur(2px);
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.75rem 1rem;
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  color: var(--text);
}
.title {
  margin: 0;
  font-size: 1rem;
}
.sub {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  color: var(--muted);
}
.actions {
  display: flex;
  gap: 0.45rem;
}
.btn {
  font: inherit;
  min-height: 34px;
  padding: 0.35rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--accent);
  color: var(--on-accent, #fff);
  cursor: pointer;
}
.btn.ghost {
  background: var(--surface);
  color: var(--text);
}
.err {
  margin: 0.5rem 1rem;
  color: #b33;
}
.canvas-wrap {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  padding: 1.25rem;
}
.canvas {
  position: relative;
  margin: 0 auto;
}
.sheet-page {
  position: absolute;
  left: 0;
  background: #fff;
  box-shadow: 0 4px 18px color-mix(in srgb, #000 28%, transparent);
}
.score {
  position: relative;
  z-index: 1;
}
.score :deep(svg) {
  display: block;
  background: transparent;
}

@media print {
  .no-print {
    display: none !important;
  }
  .print-overlay {
    position: static;
    background: none;
    backdrop-filter: none;
  }
  .canvas-wrap {
    overflow: visible;
    padding: 0;
  }
  .sheet-page {
    box-shadow: none;
    break-after: page;
    page-break-after: always;
  }
  .sheet-page:last-child {
    break-after: auto;
    page-break-after: auto;
  }
}
</style>
