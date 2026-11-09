<script setup lang="ts">
/** Full + compact jump-rail text; visibility is CSS via `html[data-narrow]`. */
defineProps<{ full: string; compact?: string }>()
</script>

<template>
  <span class="jump-lab-full">{{ full }}</span>
  <span class="jump-lab-compact">{{ compact ?? full }}</span>
</template>
