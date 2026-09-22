<script setup lang="ts">
/**
 * Collapsible chord-analysis strip under the measure ruler: names or Roman numerals.
 */
import { computed, nextTick, ref, watch } from 'vue'
import { ticksToPx } from '../../lib/tagRoll/normalize'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import type { TagRollProject } from '../../lib/tagRoll/types'
import {
  TAG_ROLL_RULER_H,
  TAG_ROLL_RULER_H_COMPOSE,
} from '../../lib/tagRoll/types'
import type { ChordAnalysisMode, ChordAnalysisSegment } from '../../domain/arranging/chordAnalysisBar'

const props = defineProps<{
  project: TagRollProject
  segments: readonly ChordAnalysisSegment[]
  mode: ChordAnalysisMode
  collapsed: boolean
}>()

const emit = defineEmits<{
  'update:collapsed': [value: boolean]
  'update:mode': [value: ChordAnalysisMode]
  pick: [tick: number, patch: { name?: string; roman?: string }]
  /** Stack window — L/R inspect bounds (do not collapse to a whole held note). */
  focusRange: [startTick: number, endTick: number]
}>()

const rootEl = ref<HTMLElement | null>(null)
const menuEl = ref<HTMLElement | null>(null)
const openMenuTick = ref<number | null>(null)
const menuPos = ref<{ top: string; left: string; minWidth: string }>({
  top: '0px',
  left: '0px',
  minWidth: '4.5rem',
})

const rulerH = computed(() =>
  props.project.view.mode === 'compose' ? TAG_ROLL_RULER_H_COMPOSE : TAG_ROLL_RULER_H,
)

const scrollX = computed(() => props.project.view.scrollX)
const cellW = computed(() => props.project.view.cellW)

const bandStyle = computed(() => ({
  top: `${rulerH.value}px`,
}))

const openSeg = computed(() =>
  openMenuTick.value == null
    ? null
    : (props.segments.find((s) => s.startTick === openMenuTick.value) ?? null),
)

function labelOf(seg: ChordAnalysisSegment): string {
  return props.mode === 'roman' ? seg.displayRoman : seg.displayName
}

function optionsOf(seg: ChordAnalysisSegment): string[] {
  return props.mode === 'roman' ? seg.romanOptions : seg.nameOptions
}

function segStyle(seg: ChordAnalysisSegment): Record<string, string> {
  // Same origin as TagRollViewport ruler/notes: roll-col left edge + scrollX.
  const x = -scrollX.value + ticksToPx(seg.startTick, cellW.value, props.project.ppq)
  const w = Math.max(
    28,
    ticksToPx(seg.endTick - seg.startTick, cellW.value, props.project.ppq),
  )
  return {
    transform: `translate3d(${x}px, 0, 0)`,
    width: `${w}px`,
  }
}

function closeMenu(): void {
  openMenuTick.value = null
}

function placeMenu(): void {
  const anchor = rootEl.value?.querySelector('.cell.menu .lab') as HTMLElement | null
  if (!anchor) return
  const r = anchor.getBoundingClientRect()
  menuPos.value = {
    top: `${Math.round(r.bottom + 2)}px`,
    left: `${Math.round(r.left)}px`,
    minWidth: `${Math.max(Math.round(r.width), 72)}px`,
  }
}

function toggleCollapsed(): void {
  emit('update:collapsed', !props.collapsed)
}

function setMode(m: ChordAnalysisMode): void {
  emit('update:mode', m)
  closeMenu()
}

function onPick(seg: ChordAnalysisSegment, value: string): void {
  if (props.mode === 'roman') emit('pick', seg.startTick, { roman: value })
  else emit('pick', seg.startTick, { name: value })
  closeMenu()
}

function onSegClick(seg: ChordAnalysisSegment): void {
  emit('focusRange', seg.startTick, seg.endTick)
  const opts = optionsOf(seg)
  if (opts.length > 1) {
    openMenuTick.value = openMenuTick.value === seg.startTick ? null : seg.startTick
  }
}

watch(
  () => props.collapsed,
  (c) => {
    if (c) closeMenu()
  },
)

watch([scrollX, cellW], () => {
  if (openMenuTick.value != null) placeMenu()
})

/** Portal menu so it cannot stretch the roll / chord-bar layout box. */
watch(openMenuTick, (tick, _prev, onCleanup) => {
  if (tick == null) return
  void nextTick(() => placeMenu())
  const onPointerDown = (e: PointerEvent) => {
    const t = e.target
    if (!(t instanceof Node)) {
      closeMenu()
      return
    }
    const openCell = rootEl.value?.querySelector('.cell.menu')
    if (openCell?.contains(t) || menuEl.value?.contains(t)) return
    closeMenu()
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      closeMenu()
    }
  }
  const onReposition = () => placeMenu()
  const raf = requestAnimationFrame(() => {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)
  })
  onCleanup(() => {
    cancelAnimationFrame(raf)
    document.removeEventListener('pointerdown', onPointerDown, true)
    document.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('resize', onReposition)
    window.removeEventListener('scroll', onReposition, true)
  })
})
</script>

<template>
  <div
    ref="rootEl"
    class="chord-bar"
    :class="{ collapsed }"
    :style="bandStyle"
    role="region"
    aria-label="Chord analysis"
  >
    <!-- Track first so tick x matches the roll; chrome overlays controls. -->
    <div v-if="!collapsed" class="track">
      <p v-if="!segments.length" class="empty">No chord changes</p>
      <div
        v-for="seg in segments"
        :key="`${seg.startTick}-${seg.id}`"
        class="cell"
        :class="{ locked: seg.locked, implied: seg.implied, menu: openMenuTick === seg.startTick }"
        :style="segStyle(seg)"
      >
        <button
          type="button"
          class="lab"
          :title="
            seg.locked
              ? `Coach: ${labelOf(seg)}`
              : seg.implied
                ? `Implied from key: ${labelOf(seg)}`
                : optionsOf(seg).length > 1
                  ? `${labelOf(seg)} — click for alternates`
                  : labelOf(seg)
          "
          @click="onSegClick(seg)"
        >
          <span class="txt">{{ labelOf(seg) }}</span>
          <span v-if="optionsOf(seg).length > 1" class="caret" aria-hidden="true">▾</span>
        </button>
      </div>
    </div>

    <div class="chrome">
      <button
        type="button"
        class="collapse-btn"
        :title="
          collapsed
            ? tagRollTip('Expand chord analysis')
            : tagRollTip('Collapse chord analysis')
        "
        :aria-expanded="!collapsed"
        @click="toggleCollapsed"
      >
        {{ collapsed ? 'Chords' : 'Hide' }}
      </button>
      <template v-if="!collapsed">
        <div class="mode" role="group" aria-label="Chord label mode">
          <button
            type="button"
            :class="{ on: mode === 'name' }"
            title="Chord names (e.g. Bb7)"
            @click="setMode('name')"
          >
            Chord
          </button>
          <button
            type="button"
            :class="{ on: mode === 'roman' }"
            title="Scale-degree numbers / Roman numerals (e.g. ♭VII7)"
            @click="setMode('roman')"
          >
            Number
          </button>
        </div>
      </template>
    </div>
  </div>

  <Teleport to="body">
    <ul
      v-if="openSeg && optionsOf(openSeg).length > 1"
      ref="menuEl"
      class="chord-analysis-menu"
      :style="menuPos"
      role="listbox"
      :aria-label="`Alternates for ${labelOf(openSeg)}`"
    >
      <li v-for="opt in optionsOf(openSeg)" :key="opt" role="option">
        <button
          type="button"
          :class="{ on: opt === labelOf(openSeg) }"
          @click.stop="onPick(openSeg, opt)"
        >
          {{ opt }}
        </button>
      </li>
    </ul>
  </Teleport>
</template>

<style scoped>
.chord-bar {
  position: absolute;
  left: 0;
  right: 0;
  z-index: 5;
  /* No horizontal padding/gap — track must share the viewport's x origin. */
  min-height: 1.45rem;
  height: 1.7rem;
  overflow: hidden;
  border-top: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(5px);
  pointer-events: auto;
}
.chord-bar.collapsed {
  width: auto;
  right: auto;
  border-radius: 0 0 8px 0;
  border-right: 1px solid var(--border);
}
.chrome {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.12rem 0.35rem 0.12rem 0.2rem;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--surface) 96%, transparent) 70%,
    transparent
  );
  pointer-events: none;
}
.chrome > * {
  pointer-events: auto;
}
.collapse-btn {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.66rem;
  font-weight: 750;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  cursor: pointer;
  padding: 0.12rem 0.35rem;
  min-height: 1.35rem;
}
.collapse-btn:hover {
  color: var(--text);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.mode {
  display: inline-flex;
  gap: 0.1rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 0.05rem;
  background: var(--surface);
}
.mode button {
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.66rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0.1rem 0.3rem;
  min-height: 1.2rem;
}
.mode button.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  color: var(--text);
}
.track {
  position: absolute;
  inset: 0.12rem 0;
  overflow: hidden;
  pointer-events: none;
}
.track .cell,
.track .empty {
  pointer-events: auto;
}
.empty {
  margin: 0;
  font-size: 0.68rem;
  color: var(--muted);
  line-height: 1.45rem;
  padding-left: 0.2rem;
}
.cell {
  position: absolute;
  top: 0;
  left: 0;
  height: 1.45rem;
  box-sizing: border-box;
  padding-right: 2px;
  will-change: transform;
}
.lab {
  width: 100%;
  height: 100%;
  display: inline-flex;
  align-items: center;
  gap: 0.15rem;
  border: 1px solid var(--border);
  border-radius: 5px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  padding: 0 0.3rem;
  overflow: hidden;
}
.cell.locked .lab {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.cell.implied .lab {
  border-style: dashed;
  color: color-mix(in srgb, var(--text) 78%, var(--muted));
  font-weight: 650;
}
.txt {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.caret {
  margin-left: auto;
  color: var(--muted);
  font-size: 0.62rem;
  flex: 0 0 auto;
}
</style>

<!-- Teleported menu is outside scoped root — unscoped class on body. -->
<style>
.chord-analysis-menu {
  position: fixed;
  z-index: 40;
  margin: 0;
  padding: 0.2rem;
  list-style: none;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  box-shadow: 0 6px 16px color-mix(in srgb, #000 14%, transparent);
  box-sizing: border-box;
}
.chord-analysis-menu button {
  width: 100%;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  padding: 0.25rem 0.4rem;
  border-radius: 5px;
  cursor: pointer;
}
.chord-analysis-menu button.on {
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.chord-analysis-menu button:hover {
  background: color-mix(in srgb, var(--accent) 10%, transparent);
}
</style>
