<script setup lang="ts">
import { computed } from 'vue'
import type { StarsNotice } from '../stores/starNotice'

const props = defineProps<{ notice: StarsNotice }>()

/** Single plain-text status line — no emoji badges. */
const label = computed(() => {
  const n = props.notice
  if (n.type === 'cached') {
    if (n.audio && n.sheets) return 'Favorited · audio and sheets saved'
    if (n.audio) return 'Favorited · audio saved'
    if (n.sheets) return 'Favorited · sheets saved'
    return 'Favorited'
  }
  if (n.type === 'starred') return 'Favorited'
  if (n.type === 'removed') return 'Removed from favorites'
  return n.message
})
</script>

<template>
  <span class="stars-notice">{{ label }}</span>
</template>

<style scoped>
.stars-notice {
  white-space: nowrap;
}
</style>
