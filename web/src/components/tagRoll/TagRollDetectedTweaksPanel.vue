<script setup lang="ts">
/**
 * Detected scoring Tweaks — right-dock JSON editor for Mild/Bold weights.
 */
import { computed, ref, watch } from 'vue'
import {
  DEFAULT_DETECTED_SCORE_TWEAKS,
  detectedScoreTweaksEqual,
  formatDetectedScoreTweaksJson,
  parseDetectedScoreTweaksJson,
} from '../../domain/arranging/detectedScoreTweaks'
import { usePreferencesStore } from '../../stores/preferences'

const emit = defineEmits<{
  close: []
}>()

const prefs = usePreferencesStore()
const tweaksDraft = ref(formatDetectedScoreTweaksJson(prefs.detectedScoreTweaks))
const tweaksError = ref<string | null>(null)
const tweaksSavedFlash = ref(false)
const tweaksIsDefault = computed(() =>
  detectedScoreTweaksEqual(prefs.detectedScoreTweaks, DEFAULT_DETECTED_SCORE_TWEAKS),
)

watch(
  () => prefs.detectedScoreTweaks,
  (t) => {
    tweaksDraft.value = formatDetectedScoreTweaksJson(t)
    tweaksError.value = null
  },
)

function applyDetectedTweaks(): void {
  const parsed = parseDetectedScoreTweaksJson(tweaksDraft.value)
  if (!parsed.ok) {
    tweaksError.value = parsed.error
    return
  }
  tweaksError.value = null
  prefs.setDetectedScoreTweaks(parsed.tweaks)
  tweaksDraft.value = formatDetectedScoreTweaksJson(parsed.tweaks)
  tweaksSavedFlash.value = true
  window.setTimeout(() => {
    tweaksSavedFlash.value = false
  }, 1600)
}

function resetDetectedTweaks(): void {
  prefs.resetDetectedScoreTweaks()
  tweaksDraft.value = formatDetectedScoreTweaksJson(prefs.detectedScoreTweaks)
  tweaksError.value = null
}
</script>

<template>
  <section class="tweaks-panel" aria-label="Detected Tweaks">
    <header class="head">
      <div>
        <h3 class="title">Detected Tweaks</h3>
        <p class="hint">
          JSON weights for Basic / Mild / Bold scoring and held-note splits. Apply, then cycle
          interest on Detected. Unknown keys are ignored.
        </p>
      </div>
      <button type="button" class="close" title="Close Tweaks" @click="emit('close')">✕</button>
    </header>

    <textarea
      v-model="tweaksDraft"
      class="tweaks-json"
      spellcheck="false"
      rows="18"
      aria-label="Detected scoring tweaks JSON"
    />
    <p v-if="tweaksError" class="msg err" role="alert">{{ tweaksError }}</p>
    <p v-else-if="tweaksSavedFlash" class="msg ok">Saved — Detected will re-rank.</p>
    <div class="actions">
      <button type="button" class="btn" @click="applyDetectedTweaks">Apply</button>
      <button
        type="button"
        class="btn btn-ghost"
        :disabled="tweaksIsDefault"
        @click="resetDetectedTweaks"
      >
        Reset to defaults
      </button>
    </div>
  </section>
</template>

<style scoped>
.tweaks-panel {
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  min-height: 0;
  height: 100%;
  padding: 0.35rem 0.45rem 0.55rem;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
}
.hint {
  margin: 0.2rem 0 0;
  font-size: 0.72rem;
  line-height: 1.35;
  color: var(--muted);
}
.close {
  flex: 0 0 auto;
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  cursor: pointer;
}
.tweaks-json {
  display: block;
  width: 100%;
  box-sizing: border-box;
  flex: 1 1 auto;
  min-height: 14rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg, var(--surface));
  color: inherit;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.72rem;
  line-height: 1.35;
  resize: vertical;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}
.msg {
  margin: 0;
  font-size: 0.72rem;
}
.msg.err {
  color: color-mix(in srgb, #b00020 80%, var(--text));
}
.msg.ok {
  color: color-mix(in srgb, #1f6b45 75%, var(--text));
}
</style>
