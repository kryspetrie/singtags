<script setup lang="ts">
/**
 * Thin HUD for Melody roles (Strong / Passing / Melody) on the piano roll.
 */
import { computed } from 'vue'
import InfoTips from '../InfoTips.vue'
import HarmonyHowToSections from './HarmonyHowToSections.vue'
import { ROLES_HOWTO } from '../../lib/tagRoll/harmonyHowTo'
import {
  roleDisplayFromToggles,
  roleDisplayShowsMelody,
  roleDisplayShowsRoles,
} from '../../lib/tagRoll/roleDisplay'
import type { TagRollRoleDisplay } from '../../lib/tagRoll/types'

const props = defineProps<{
  active: boolean
  melodyPartName: string | null
  selectedRole: 'pmn' | 'smn' | 'unknown' | null
  roleDisplay: TagRollRoleDisplay
}>()

const emit = defineEmits<{
  close: []
  'update:roleDisplay': [TagRollRoleDisplay]
  openMarks: []
}>()

const showMelody = computed(() => roleDisplayShowsMelody(props.roleDisplay))
const showRoles = computed(() => roleDisplayShowsRoles(props.roleDisplay))

function setMelody(on: boolean): void {
  emit('update:roleDisplay', roleDisplayFromToggles(on, showRoles.value))
}

function setRoles(on: boolean): void {
  emit('update:roleDisplay', roleDisplayFromToggles(showMelody.value, on))
}
</script>

<template>
  <div v-if="active" class="hud" role="status" aria-live="polite">
    <div class="main">
      <strong>Melody roles</strong>
      <InfoTips class="howto" label="How to use Melody roles" title="How to use Melody roles">
        <HarmonyHowToSections :sections="ROLES_HOWTO" />
      </InfoTips>
      <span class="sep">·</span>
      <span>←→ part notes</span>
      <span class="sep">·</span>
      <span>↑↓ stack</span>
      <span class="sep">·</span>
      <span>Shift+arrows move</span>
      <span class="sep">·</span>
      <kbd>S</kbd> Strong
      <kbd>P</kbd> Passing
      <kbd>C</kbd> Clear
      <kbd>M</kbd> Melody
      <span v-if="melodyPartName" class="mel">Melody: {{ melodyPartName }}</span>
      <span v-if="selectedRole === 'pmn'" class="role pmn">Strong</span>
      <span v-else-if="selectedRole === 'smn'" class="role smn">Passing</span>
      <span class="sep">·</span>
      <label class="tog" title="Show red Melody stripe">
        <input
          type="checkbox"
          :checked="showMelody"
          @change="setMelody(($event.target as HTMLInputElement).checked)"
        />
        Melody
      </label>
      <label class="tog" title="Show Strong / Passing stripes">
        <input
          type="checkbox"
          :checked="showRoles"
          @change="setRoles(($event.target as HTMLInputElement).checked)"
        />
        Roles
      </label>
      <button type="button" class="filter" title="Open View marks" @click="emit('openMarks')">
        Marks…
      </button>
    </div>
    <button type="button" class="close" title="Exit Roles" @click="$emit('close')">✕</button>
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
.role {
  font-weight: 750;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.role.pmn {
  color: #1f6b45;
  border-color: color-mix(in srgb, #2a8c5a 45%, var(--border));
  background: color-mix(in srgb, #2a8c5a 14%, transparent);
}
.role.smn {
  color: #9a7a10;
  border-color: color-mix(in srgb, #d4a81c 55%, var(--border));
  background: color-mix(in srgb, #d4a81c 16%, transparent);
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
