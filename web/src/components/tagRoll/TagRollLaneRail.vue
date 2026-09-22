<script setup lang="ts">
/**
 * Collapsed lane chrome: horizontal Mods / Coach toggles (one lane open at a time).
 * Opening Coach expands the lane and the Coach sidebar together.
 */
import { computed, onMounted } from 'vue'
import { tagRollTip } from '../../lib/tagRoll/shortcuts'
import { usePreferencesStore } from '../../stores/preferences'

const props = defineProps<{
  leftGutterPx?: number
}>()

const prefs = usePreferencesStore()

const bothCollapsed = computed(
  () => prefs.tagRollExpressionLaneCollapsed && prefs.tagRollCoachLaneCollapsed,
)

const gutterStyle = computed(() => {
  const g = Math.max(52, props.leftGutterPx ?? 72)
  return { '--lane-gutter': `${g}px` } as Record<string, string>
})

function openMods(): void {
  prefs.openTagRollBottomLane('mods')
}

function openCoach(): void {
  prefs.openTagRollBottomLane('coach')
}

onMounted(() => {
  // Legacy prefs could leave both lanes expanded — enforce exclusivity.
  if (!prefs.tagRollExpressionLaneCollapsed && !prefs.tagRollCoachLaneCollapsed) {
    prefs.openTagRollBottomLane(null)
  }
})
</script>

<template>
  <div v-if="bothCollapsed" class="lane-rail" :style="gutterStyle" role="toolbar" aria-label="Bottom lanes">
    <div class="gutter" aria-hidden="true" />
    <div class="toggles">
      <button
        type="button"
        class="rail-btn"
        :title="tagRollTip('Open Mods lane (tempo, fermata, ramps)')"
        aria-label="Open Mods lane"
        @click="openMods"
      >
        Mods
      </button>
      <button
        type="button"
        class="rail-btn"
        :title="tagRollTip('Open Coach lane and sidebar')"
        aria-label="Open Coach lane and sidebar"
        @click="openCoach"
      >
        Coach
      </button>
    </div>
  </div>
</template>

<style scoped>
.lane-rail {
  display: grid;
  grid-template-columns: var(--lane-gutter, 72px) minmax(0, 1fr);
  align-items: center;
  border-top: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 94%, var(--bg, var(--surface)));
  min-height: 2.35rem;
}
.gutter {
  min-height: 1px;
}
.toggles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.45rem 0.25rem 0.15rem;
}
.rail-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.85rem;
  padding: 0.2rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  cursor: pointer;
}
.rail-btn:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
</style>
