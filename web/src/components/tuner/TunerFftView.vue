<script setup lang="ts">
/**
 * FFT Analyze surface (Phase 6) — peak list + Pause. Sine click later.
 */
import { formatDisplayCents } from '../../domain/tuner/displayCents'
import type { FftPeak } from '../../audio/tuner/fftPeaks'

defineProps<{
  peaks: FftPeak[]
  paused: boolean
  fftSize: number
}>()

defineEmits<{
  togglePause: []
}>()
</script>

<template>
  <section class="fft" aria-label="FFT analysis">
    <div class="head">
      <h2 class="title">Analyze · FFT</h2>
      <span class="lat">{{ fftSize }} · latency labeled later</span>
      <button type="button" class="btn" :class="{ on: paused }" @click="$emit('togglePause')">
        {{ paused ? 'Resume' : 'Pause' }}
      </button>
    </div>
    <ol class="peaks">
      <li v-for="(p, i) in peaks" :key="i" class="peak">
        <span class="note">{{ p.note ?? '—' }}</span>
        <span class="hz">{{ p.hz.toFixed(1) }} Hz</span>
        <span class="cents">
          {{
            p.errorCents == null ? '—' : formatDisplayCents(p.errorCents, { clarity: p.salience })
          }}
        </span>
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
}
.btn {
  min-height: 40px;
  margin-left: auto;
  padding: 0.35rem 0.75rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  cursor: pointer;
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
  grid-template-columns: 3.5rem 7rem 1fr;
  gap: 0.5rem;
  padding: 0.35rem 0.45rem;
  border-radius: 6px;
  border: 1px solid var(--border);
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
