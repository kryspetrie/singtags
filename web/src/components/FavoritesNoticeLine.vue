<script setup lang="ts">
/**
 * Compact favorites status line (favorited, cached media, removed) for tag rows and settings.
 */
import { computed } from 'vue'
import type { FavoritesNotice } from '../stores/favoritesNotice'

const props = defineProps<{
  /** Favorites notice payload from {@link useFavoritesNoticeStore} helpers. */
  notice: FavoritesNotice
}>()

/** Single plain-text status line — no emoji badges. */
const label = computed(() => {
  const n = props.notice
  if (n.type === 'cached') {
    if (n.audio && n.sheets) return 'Favorited · audio and sheets saved'
    if (n.audio) return 'Favorited · audio saved'
    if (n.sheets) return 'Favorited · sheets saved'
    return 'Favorited'
  }
  if (n.type === 'favorited') return 'Favorited'
  if (n.type === 'removed') return 'Removed from favorites'
  return n.message
})
</script>

<template>
  <span class="favorites-notice">{{ label }}</span>
</template>

<style scoped>
.favorites-notice {
  white-space: nowrap;
}
</style>
