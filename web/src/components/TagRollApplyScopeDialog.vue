<script setup lang="ts">
/**
 * Choose whether a Key / Tempo change applies at the song start or at the playhead.
 */
import ConfirmDialog from './ConfirmDialog.vue'

defineProps<{
  open: boolean
  title: string
  message: string
}>()

const emit = defineEmits<{
  close: []
  beginning: []
  cursor: []
}>()
</script>

<template>
  <ConfirmDialog
    :open="open"
    :title="title"
    :message="message"
    :danger="false"
    wide
    @close="emit('close')"
  >
    <template #actions>
      <div class="actions">
        <button type="button" class="btn" @click="emit('close')">Cancel</button>
        <button type="button" class="btn" @click="emit('beginning')">Beginning</button>
        <button type="button" class="btn btn-primary" @click="emit('cursor')">At cursor</button>
      </div>
    </template>
  </ConfirmDialog>
</template>

<style scoped>
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
.btn {
  min-height: 44px;
  padding: 0.45rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
.btn:hover {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent);
}
</style>
