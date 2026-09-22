<script setup lang="ts">
/**
 * Piano-roll overlay: mirrors shared coach transport while Coach is open (or detached).
 */
import { computed } from 'vue'
import {
  coachRollTransportState,
  coachRollTransportHear,
  coachRollTransportLock,
  coachRollTransportNext,
  coachRollTransportPrev,
  coachRollTransportPrimary,
  coachRollTransportSkip,
} from '../../lib/arranging/coachRollTransport'

const tr = coachRollTransportState
const visible = computed(() => tr.value.active && tr.value.model)
const tm = computed(() => tr.value.model)
</script>

<template>
  <div v-if="visible && tm" class="roll-nav" role="toolbar" aria-label="Coach transport">
    <span class="kind">{{ tm.stepLabel }}</span>
    <span class="meta compact">{{ tm.status }}</span>
    <template v-if="tm.showNav">
      <button
        type="button"
        class="nav-btn"
        :disabled="tm.prevDisabled"
        @click="coachRollTransportPrev"
      >
        {{ tm.prevLabel }}
      </button>
      <button
        type="button"
        class="nav-btn"
        :disabled="tm.nextDisabled"
        @click="coachRollTransportNext"
      >
        {{ tm.nextLabel }}
      </button>
    </template>
    <button
      type="button"
      class="nav-btn primary"
      :disabled="tm.primaryDisabled"
      :title="tm.primaryTitle"
      @click="coachRollTransportPrimary"
    >
      {{ tm.primaryLabel }}
    </button>
    <button
      v-if="tm.showHear"
      type="button"
      class="nav-btn"
      :disabled="tm.hearDisabled"
      @click="coachRollTransportHear"
    >
      {{ tm.hearLabel }}
    </button>
    <button
      v-if="tm.showLock"
      type="button"
      class="nav-btn"
      :disabled="tm.lockDisabled"
      @click="coachRollTransportLock"
    >
      Lock
    </button>
    <button
      v-if="tm.showSkip"
      type="button"
      class="nav-btn"
      :disabled="tm.skipDisabled"
      @click="coachRollTransportSkip"
    >
      Skip
    </button>
  </div>
</template>

<style scoped>
.roll-nav {
  position: absolute;
  left: 0.35rem;
  right: 0.35rem;
  bottom: 0.35rem;
  z-index: 6;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.45rem;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--surface) 92%, transparent);
  backdrop-filter: blur(6px);
  box-shadow: 0 4px 14px color-mix(in srgb, #000 12%, transparent);
  pointer-events: auto;
}
.kind {
  font-size: 0.68rem;
  font-weight: 750;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
  margin-right: 0.15rem;
}
.nav-btn {
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.7rem;
  padding: 0.15rem 0.45rem;
}
.nav-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.nav-btn:not(:disabled):hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
}
.nav-btn.primary {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.meta.compact {
  margin-left: 0;
  max-width: 12rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 550;
}
</style>
