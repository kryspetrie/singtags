<script setup lang="ts">
/**
 * Thin HUD for handing the melody from one part to another.
 */
import { computed } from 'vue'
import InfoTips from '../InfoTips.vue'
import HarmonyHowToSections from './HarmonyHowToSections.vue'
import { ROLES_HOWTO } from '../../lib/tagRoll/harmonyHowTo'
import { roleDisplayFromToggles, roleDisplayShowsMelody } from '../../lib/tagRoll/roleDisplay'
import type { TagRollRoleDisplay } from '../../lib/tagRoll/types'

const props = defineProps<{
  active: boolean
  melodyPartName: string | null
  roleDisplay: TagRollRoleDisplay
}>()

const emit = defineEmits<{
  close: []
  'update:roleDisplay': [TagRollRoleDisplay]
  openMarks: []
}>()

const showMelody = computed(() => roleDisplayShowsMelody(props.roleDisplay))

function setMelody(on: boolean): void {
  emit('update:roleDisplay', roleDisplayFromToggles(on, false))
}
</script>

<template>
  <div v-if="active" class="hud" role="status" aria-live="polite">
    <div class="main">
      <strong>Melody</strong>
      <InfoTips class="howto" label="How melody handoffs work" title="How melody handoffs work">
        <HarmonyHowToSections :sections="ROLES_HOWTO" />
      </InfoTips>
      <span class="sep">·</span>
      <span>←→ part notes</span>
      <span class="sep">·</span>
      <span>↑↓ stack</span>
      <span class="sep">·</span>
      <span>Shift+arrows move</span>
      <span class="sep">·</span>
      <kbd>M</kbd> Handoff
      <span v-if="melodyPartName" class="mel">Melody: {{ melodyPartName }}</span>
      <span class="sep">·</span>
      <label class="tog" title="Show red Melody stripe">
        <input
          type="checkbox"
          :checked="showMelody"
          @change="setMelody(($event.target as HTMLInputElement).checked)"
        />
        Melody
      </label>
      <button type="button" class="filter" title="Open View marks" @click="emit('openMarks')">
        Marks…
      </button>
    </div>
    <button type="button" class="close" title="Exit Melody" @click="$emit('close')">✕</button>
  </div>
</template>

<style scoped>
.hud {
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  top: auto;
  bottom: 0.4rem;
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.35rem 0.55rem;
  border-radius: 8px;
  border: 1px solid color-mix(in srgb, #2a8c5a 45%, var(--border));
  background: color-mix(in srgb, var(--surface) 88%, #2a8c5a 12%);
  box-shadow: 0 2px 10px color-mix(in srgb, #000 12%, transparent);
  font-size: 0.78rem;
  color: var(--text);
  pointer-events: auto;
}
.main {
  flex: 1;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  min-width: 0;
}
.howto {
  display: inline-flex;
  align-items: center;
}

.sep {
  color: var(--muted);
}
kbd {
  font: inherit;
  font-weight: 750;
  font-size: 0.72rem;
  padding: 0.05rem 0.28rem;
  border-radius: 4px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.mel {
  margin-left: 0.25rem;
  font-weight: 650;
  color: var(--muted);
}
.tog {
  display: inline-flex;
  align-items: center;
  gap: 0.22rem;
  font-weight: 650;
  cursor: pointer;
  user-select: none;
}
.tog input {
  margin: 0;
}
.filter {
  margin-left: 0.15rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  padding: 0.12rem 0.4rem;
  color: var(--text);
}
.close {
  border: none;
  background: transparent;
  color: var(--muted);
  font: inherit;
  cursor: pointer;
  padding: 0.1rem 0.35rem;
}
</style>
