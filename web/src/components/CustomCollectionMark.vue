<script setup lang="ts">
/** Inline SVG mark distinguishing user-defined collections from catalog series. */
defineProps<{
  /** Accessible tooltip for the collection icon. */
  title?: string
}>()
</script>

<template>
  <svg
    class="custom-collection-mark"
    viewBox="0 0 24 24"
    width="14"
    height="14"
    aria-hidden="true"
    focusable="false"
    :title="title || 'Custom collection'"
  >
    <!-- Stacked layers: custom (user) collection -->
    <path
      fill="none"
      stroke="currentColor"
      stroke-width="1.75"
      stroke-linecap="round"
      stroke-linejoin="round"
      d="M4 8.5h16v9H4zM7 5.5h10M7 20.5h10"
    />
  </svg>
</template>

<style scoped>
.custom-collection-mark {
  flex: 0 0 auto;
  display: inline-block;
  vertical-align: -0.15em;
  opacity: 0.85;
}
</style>
