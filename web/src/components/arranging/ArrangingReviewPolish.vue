<script setup lang="ts">
/**
 * Polish / finish strip — checklist and style factors (no whole-chart tools or export).
 */
import type { FinalChecklistItem } from '../../domain/arranging/finalChecklist'
import type { BarbershopnessFactor } from '../../domain/arranging/barbershopness'

defineProps<{
  checklist: FinalChecklistItem[]
  ready: boolean
  howFactors: BarbershopnessFactor[]
}>()
</script>

<template>
  <section class="polish" aria-label="Review polish">
    <h3 class="subh">Polish</h3>
    <p class="hint">
      Final craft skim after Auto passes. Whole-chart tools (Strengthen, Polish inversions, swipe)
      live on the <strong>Auto</strong> step. Export MIDI / MusicXML from the Tag Studio toolbar.
    </p>

    <details class="check" open>
      <summary title="Contest-minded craft checklist before you leave the coach">
        Checklist
        <span class="meta">{{ ready ? 'ready' : 'residuals' }}</span>
      </summary>
      <ul>
        <li v-for="item in checklist" :key="item.id" :class="{ ok: item.ok }">
          <strong>{{ item.ok ? 'OK' : '-' }}</strong>
          {{ item.label }}
          <span v-if="item.detail" class="meta"> - {{ item.detail }}</span>
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
          <span class="meta"> - {{ f.detail || `${Math.round(f.points)} pts` }}</span>
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
