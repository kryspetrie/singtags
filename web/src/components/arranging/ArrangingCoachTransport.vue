<script setup lang="ts">
/**
 * Shared coach transport — prev/next, primary, hear/lock/skip; suggested next is a link.
 */
import type { CoachTransportView } from '../../composables/useCoachTransport'

defineProps<{
  model: CoachTransportView
  nextActionCta: string
}>()

defineEmits<{
  prev: []
  next: []
  primary: []
  hear: []
  lock: []
  skip: []
  secondary: []
  nextAction: []
}>()
</script>

<template>
  <div class="coach-transport" role="toolbar" :aria-label="`${model.stepLabel} transport`">
    <div class="transport-meta">
      <strong>{{ model.stepLabel }}</strong>
      <span class="status">{{ model.status }}</span>
    </div>
    <div class="transport-actions">
      <template v-if="model.showNav">
        <button
          type="button"
          class="step-btn"
          :disabled="model.prevDisabled"
          @click="$emit('prev')"
        >
          {{ model.prevLabel }}
        </button>
        <button
          type="button"
          class="step-btn"
          :disabled="model.nextDisabled"
          @click="$emit('next')"
        >
          {{ model.nextLabel }}
        </button>
      </template>
      <button
        type="button"
        class="primary"
        :disabled="model.primaryDisabled"
        :title="model.primaryTitle"
        @click="$emit('primary')"
      >
        {{ model.primaryLabel }}
      </button>
      <button
        v-if="model.showHear"
        type="button"
        class="step-btn"
        :disabled="model.hearDisabled"
        @click="$emit('hear')"
      >
        {{ model.hearLabel }}
      </button>
      <button
        v-if="model.showLock"
        type="button"
        class="step-btn"
        :disabled="model.lockDisabled"
        title="Confirm this home root"
        @click="$emit('lock')"
      >
        Lock
      </button>
      <button
        v-if="model.showSkip"
        type="button"
        class="step-btn"
        :disabled="model.skipDisabled"
        title="Discard draft and propose the next position"
        @click="$emit('skip')"
      >
        Skip
      </button>
      <button
        v-if="model.secondaryLabel"
        type="button"
        class="step-btn"
        :disabled="model.secondaryDisabled"
        :title="model.secondaryTitle"
        @click="$emit('secondary')"
      >
        {{ model.secondaryLabel }}
      </button>
    </div>
    <button type="button" class="linkish suggested" @click="$emit('nextAction')">
      Suggested: {{ nextActionCta }}
    </button>
  </div>
</template>

<style scoped>
.coach-transport {
  display: grid;
  gap: 0.45rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: color-mix(in srgb, var(--surface) 92%, var(--accent) 8%);
}
.transport-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem 0.65rem;
  font-size: 0.82rem;
}
.transport-meta strong {
  font-size: 0.88rem;
}
.status {
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.transport-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.suggested {
  justify-self: start;
  border: 0;
  background: transparent;
  font: inherit;
  font-size: 0.78rem;
  color: var(--accent);
  cursor: pointer;
  padding: 0;
  text-align: left;
}
.suggested:hover {
  text-decoration: underline;
}
</style>
