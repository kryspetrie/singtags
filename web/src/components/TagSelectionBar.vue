<script setup lang="ts">
/**
 * Floating multiselect toolbar for catalog tag lists (Browse / Recent / Favorites).
 */
import { ref } from 'vue'
import QueueDownloadModeDialog from './QueueDownloadModeDialog.vue'
import SelectionBar from './SelectionBar.vue'
import type { QueueDownloadMode } from '../lib/queueSelectedTags'
import { usePreferencesStore } from '../stores/preferences'

const props = withDefaults(
  defineProps<{
    count: number
    toolbarLabel: string
    /** When false, hide the favorite action (e.g. on the favorites list). */
    showFavorite?: boolean
  }>(),
  {
    showFavorite: true,
  },
)

const emit = defineEmits<{
  favorite: []
  collection: []
  zip: [mode: QueueDownloadMode]
  clear: []
}>()

const prefs = usePreferencesStore()
const modeOpen = ref(false)

function onChooseMode(mode: QueueDownloadMode): void {
  modeOpen.value = false
  emit('zip', mode)
}
</script>

<template>
  <SelectionBar
    :count="props.count"
    :toolbar-label="props.toolbarLabel"
    @clear="emit('clear')"
  >
    <button
      v-if="props.showFavorite"
      type="button"
      class="btn btn-fav"
      aria-label="Favorite selected tags"
      title="Favorite selected tags and cache for offline"
      @click="emit('favorite')"
    >
      <span aria-hidden="true">♡</span>
    </button>
    <button
      type="button"
      class="btn"
      aria-label="Add to collection"
      title="Favorite selected tags and add them to a collection"
      @click="emit('collection')"
    >
      <span class="label-long">Add to Collection</span>
      <span class="label-short">+Collection</span>
    </button>
    <button
      v-if="prefs.zipExportsEnabled"
      type="button"
      class="btn"
      aria-label="Queue downloads"
      title="Add selected tags' sheets and/or tracks to the download queue"
      @click="modeOpen = true"
    >
      <span class="label-long">Queue Downloads</span>
      <span class="label-short">+Queue</span>
    </button>
    <slot />
  </SelectionBar>

  <QueueDownloadModeDialog
    :open="modeOpen && count > 0 && prefs.zipExportsEnabled"
    :count="count"
    @close="modeOpen = false"
    @choose="onChooseMode"
  />
</template>
