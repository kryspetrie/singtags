<script setup lang="ts">
/** Compact “⇄ Transfer” label for optical-transfer actions. */
</script>

<template>
  <span class="transfer-label">
    <span class="transfer-ico" aria-hidden="true">⇄</span>
    Transfer
  </span>
</template>

<style scoped>
.transfer-label {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
}
.transfer-ico {
  font-size: 1.05em;
  line-height: 1;
}
</style>
