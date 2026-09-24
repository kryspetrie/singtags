<script setup lang="ts">
/**
 * Review polish strip — strengthen, export, checklist (ruleset lives in Coaching config).
 */
import type { FinalChecklistItem } from '../../domain/arranging/finalChecklist'
import type { BarbershopnessFactor } from '../../domain/arranging/barbershopness'

defineProps<{
  checklist: FinalChecklistItem[]
  ready: boolean
  howFactors: BarbershopnessFactor[]
  musicXmlAvailable: boolean
}>()

const emit = defineEmits<{
  strengthen: []
  polish: []
  exportMidi: []
  exportMusicXml: []
  applySwipe: []
  openConfig: []
}>()
</script>

<template>
  <section class="polish" aria-label="Review polish">
    <h3 class="subh">Polish</h3>
    <p class="hint">
      Last teaching pass: revoice the whole chart as one inversion path (I/V openings prefer
      bass on 1 or 5; minimize part motion; favor ring), strengthen approaches, then export.
      Open Coaching configuration to change contest vocabulary and learning strictness.
    </p>
    <div class="row">
      <button
        type="button"
        class="btn"
        title="Improve weak approaches and secondary-dominant drives where the coach can do so safely"
        @click="emit('strengthen')"
      >
        Strengthen
      </button>
      <button
        type="button"
        class="btn primary"
        title="Revoice stacks along a global path (not greedy): try I/V starting inversions, optimize voice leading and ring, then apply safe VL lint fixes"
        @click="emit('polish')"
      >
        Polish inversions
      </button>
      <button
        type="button"
        class="btn"
        title="Try a swipe-style seed pass for variety (review before keeping)"
        @click="emit('applySwipe')"
      >
        Try swipe seed
      </button>
    </div>

    <button
      type="button"
      class="btn linkish"
      title="Contest profile, tuning, and learning preferences"
      @click="emit('openConfig')"
    >
      Coaching configuration…
    </button>

    <div class="row">
      <button
        type="button"
        class="btn primary"
        title="Export the arrangement as MIDI for DAWs and players"
        @click="emit('exportMidi')"
      >
        Export MIDI
      </button>
      <button
        v-if="musicXmlAvailable"
        type="button"
        class="btn"
        title="Export MusicXML for notation software"
        @click="emit('exportMusicXml')"
      >
        Export MusicXML
      </button>
    </div>

    <details class="check">
      <summary title="Contest-minded craft checklist before you leave the coach">
        Checklist
        <span class="meta">{{ ready ? 'ready' : 'residuals' }}</span>
      </summary>
      <ul>
        <li v-for="item in checklist" :key="item.id" :class="{ ok: item.ok }">
          <strong>{{ item.ok ? '✓' : '·' }}</strong>
          {{ item.label }}
          <span v-if="item.detail" class="meta"> — {{ item.detail }}</span>
        </li>
      </ul>
    </details>

    <details v-if="howFactors.length" class="check">
      <summary title="How the coach scores barbershop style factors on this chart">
        How barbershop (factors)
      </summary>
      <ul>
        <li v-for="f in howFactors" :key="f.id">
          {{ f.label }}
          <span class="meta"> — {{ f.detail || `${Math.round(f.points)} pts` }}</span>
        </li>
      </ul>
    </details>
  </section>
</template>

<style scoped>
.polish {
  display: grid;
  gap: 0.4rem;
}
.hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
.subh {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.8rem;
  padding: 0.2rem 0.5rem;
}
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.btn.linkish {
  justify-self: start;
  border-style: dashed;
  color: var(--muted);
}
.meta {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 500;
}
.check {
  font-size: 0.78rem;
}
.check ul {
  list-style: none;
  margin: 0.3rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.2rem;
}
.check li.ok {
  color: var(--accent);
}
</style>
