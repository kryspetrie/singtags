<script setup lang="ts">
/**
 * Compact favorites status line (favorited, cached media, removed).
 * Prefer the app snackbar for completed actions — kept for tests / rare inline use.
 */
import { computed } from 'vue'
import { formatFavoritesNotice, type FavoritesNotice } from '../stores/favoritesNotice'

const props = defineProps<{
  /** Favorites notice payload from {@link formatFavoritesNotice} helpers. */
  notice: FavoritesNotice
}>()

const label = computed(() => formatFavoritesNotice(props.notice))
</script>

<template>
  <span class="favorites-notice">{{ label }}</span>
</template>

<style scoped>
.favorites-notice {
  white-space: nowrap;
}
</style>
