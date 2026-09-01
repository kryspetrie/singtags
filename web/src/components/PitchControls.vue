<script setup lang="ts">
import { clampPitchSemitones, MIN_PITCH_SEMITONES, MAX_PITCH_SEMITONES } from '../audio/pitchPlayer'

const props = withDefaults(
  defineProps<{
    pitchLabel: string
    modelValue: number
    payKeyEnabled?: boolean
    /** Disable ± and reset (playback not ready, mix baking, …). */
    adjustDisabled?: boolean
  }>(),
  {
    payKeyEnabled: false,
    adjustDisabled: false,
  },
)

const emit = defineEmits<{
  'update:modelValue': [number]
  'pay-down': []
  'pay-up': []
}>()

function bump(delta: number): void {
  emit('update:modelValue', clampPitchSemitones(props.modelValue + delta))
}

function reset(): void {
  emit('update:modelValue', 0)
}

function onPayKey(e: KeyboardEvent): void {
  if (!props.payKeyEnabled) return
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault()
    if (e.type === 'keydown') emit('pay-down')
    else emit('pay-up')
  }
}
</script>

<template>
  <div class="pay" role="group" aria-label="Pitch">
    <button
      type="button"
      class="paybtn"
      :disabled="!payKeyEnabled"
      :aria-label="`Pitch ${pitchLabel} — hold to hear tonic`"
      @pointerdown.prevent="emit('pay-down')"
      @pointerup.prevent="emit('pay-up')"
      @pointerleave.prevent="emit('pay-up')"
      @pointercancel.prevent="emit('pay-up')"
      @keydown="onPayKey"
      @keyup="onPayKey"
    >
      <span class="pay-kicker">Pitch</span>
      <strong>{{ pitchLabel }}</strong>
    </button>
    <button
      type="button"
      aria-label="Lower pitch one semitone"
      :disabled="adjustDisabled || modelValue <= MIN_PITCH_SEMITONES"
      @click="bump(-1)"
    >
      −
    </button>
    <button
      type="button"
      aria-label="Raise pitch one semitone"
      :disabled="adjustDisabled || modelValue >= MAX_PITCH_SEMITONES"
      @click="bump(1)"
    >
      +
    </button>
    <button type="button" :disabled="adjustDisabled || !modelValue" @click="reset">Reset</button>
  </div>
</template>

<style scoped>
.pay {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  flex-wrap: wrap;
  width: 100%;
  min-width: 0;
}
.paybtn {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  background: var(--accent);
  color: #fff;
  border: 0;
  border-radius: 12px;
  padding: 0.55rem 0.85rem;
  font-weight: 600;
  min-height: 52px;
  min-width: 0;
  text-align: left;
  flex: 1 1 8rem;
}
.paybtn:disabled {
  opacity: 0.5;
}
.pay-kicker {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  opacity: 0.85;
  font-weight: 600;
}
.paybtn strong {
  font-size: clamp(1rem, 4vw, 1.15rem);
  overflow-wrap: anywhere;
}
.pay > button:not(.paybtn) {
  border: 1px solid var(--border);
  background: var(--surface);
  border-radius: 10px;
  padding: 0.45rem 0.65rem;
  min-height: 48px;
  min-width: 44px;
  flex: 0 0 auto;
}
</style>
