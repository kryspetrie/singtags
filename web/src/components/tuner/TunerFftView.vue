<script setup lang="ts">
/**
 * FFT Analyze surface — peak list, Pause, sine click, multi-select audition.
 */
import { ref, watch } from 'vue'
import { formatDisplayCents } from '../../domain/tuner/displayCents'
import type { FftPeak } from '../../audio/tuner/fftPeaks'

const props = defineProps<{
  peaks: FftPeak[]
  paused: boolean
  fftSize: number
}>()

const emit = defineEmits<{
  togglePause: []
  playPeak: [hz: number]
  auditionSelected: [hz: number[]]
}>()

const selected = ref<Set<number>>(new Set())

watch(
  () => props.peaks,
  () => {
    // Drop selections that no longer exist when live updating
    if (!props.paused) selected.value = new Set()
  },
)

function toggleSelect(i: number): void {
  const next = new Set(selected.value)
  if (next.has(i)) next.delete(i)
  else next.add(i)
  selected.value = next
}

function audition(): void {
  const hz = [...selected.value]
    .map((i) => props.peaks[i]?.hz)
    .filter((h): h is number => typeof h === 'number')
  emit('auditionSelected', hz)
}
</script>

<template>
  <section class="fft" aria-label="FFT analysis">
    <div class="head">
      <h2 class="title">Analyze · FFT</h2>
      <span class="lat">{{ fftSize }} bins · tap peak = sine · select + Audition</span>
      <button type="button" class="btn" :class="{ on: paused }" @click="$emit('togglePause')">
        {{ paused ? 'Resume' : 'Pause' }}
      </button>
      <button
        type="button"
        class="btn"
        :disabled="!selected.size"
        @click="audition"
      >
        Audition ({{ selected.size }})
      </button>
    </div>
    <ol class="peaks">
      <li
        v-for="(p, i) in peaks"
        :key="i"
        class="peak"
        :class="{ sel: selected.has(i) }"
      >
        <button
          type="button"
          class="sel-btn"
          :aria-pressed="selected.has(i)"
          :aria-label="`Select ${p.note ?? p.hz.toFixed(0)}`"
          @click="toggleSelect(i)"
        >
          {{ selected.has(i) ? '✓' : '○' }}
        </button>
        <button
          type="button"
          class="play"
          @click="$emit('playPeak', p.hz)"
        >
          <span class="note">{{ p.note ?? '—' }}</span>
          <span class="hz">{{ p.hz.toFixed(1) }} Hz</span>
          <span class="cents">
            {{
              p.errorCents == null
                ? '—'
                : formatDisplayCents(p.errorCents, { clarity: p.salience })
            }}
          </span>
        </button>
      </li>
      <li v-if="!peaks.length" class="empty">No peaks — sing or unpause.</li>
    </ol>
  </section>
</template>

<style scoped>
.fft {
  display: grid;
  gap: 0.5rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.lat {
  color: var(--muted);
  font-size: 0.8rem;
  flex: 1 1 12rem;
}
.btn {
  min-height: 40px;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  cursor: pointer;
}
.btn:disabled {
  opacity: 0.45;
  cursor: default;
}
.btn.on {
  border-color: var(--accent);
  color: var(--accent);
}
.peaks {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.3rem;
}
.peak {
  display: grid;
  grid-template-columns: 2.5rem 1fr;
  gap: 0.25rem;
  align-items: stretch;
}
.peak.sel .play {
  border-color: var(--accent);
}
.sel-btn,
.play {
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
  min-height: 44px;
}
.sel-btn {
  font-size: 1rem;
}
.play {
  display: grid;
  grid-template-columns: 3.5rem 7rem 1fr;
  gap: 0.5rem;
  padding: 0.35rem 0.45rem;
  text-align: left;
  font-variant-numeric: tabular-nums;
}
.note {
  font-weight: 700;
}
.hz,
.empty {
  color: var(--muted);
}
.empty {
  padding: 0.5rem;
}
</style>
