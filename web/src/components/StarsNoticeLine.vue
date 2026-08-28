<script setup lang="ts">
import { computed } from 'vue'
import type { StarsNotice } from '../stores/starNotice'

const props = defineProps<{ notice: StarsNotice }>()

const ariaLabel = computed(() => {
  const n = props.notice
  if (n.type === 'cached') {
    const parts: string[] = []
    if (n.audio) parts.push('audio')
    if (n.sheets) parts.push('sheets')
    return parts.length ? `Favorited with ${parts.join(' and ')}` : 'Favorited'
  }
  if (n.type === 'starred') return 'Favorited'
  if (n.type === 'removed') return 'Removed from favorites'
  return n.message
})
</script>

<template>
  <span class="stars-notice" :aria-label="ariaLabel">
    <template v-if="notice.type === 'cached'">
      <span>Favorited</span>
      <span v-if="notice.audio" class="ico" aria-hidden="true">♪</span>
      <span v-if="notice.sheets" class="ico" aria-hidden="true">📄</span>
    </template>
    <template v-else-if="notice.type === 'starred'">Favorited</template>
    <template v-else-if="notice.type === 'removed'">Removed</template>
    <template v-else>{{ notice.message }}</template>
  </span>
</template>

<style scoped>
.stars-notice {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  white-space: nowrap;
}
.ico {
  opacity: 0.88;
  line-height: 1;
}
</style>
