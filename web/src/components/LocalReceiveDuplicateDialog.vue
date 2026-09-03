<script setup lang="ts">
/**
 * Soft-duplicate gate when receiving a Local Library transfer.
 */
import ConfirmDialog from './ConfirmDialog.vue'
import { useLocalReceiveUiStore } from '../stores/localReceiveUi'
import { useSnackbarStore } from '../stores/snackbar'

const receiveUi = useLocalReceiveUiStore()
const snackbar = useSnackbarStore()

async function run(choice: 'open' | 'keep' | 'replace'): Promise<void> {
  const prompt = receiveUi.duplicatePrompt
  if (!prompt || receiveUi.duplicateBusy) return
  receiveUi.duplicateBusy = true
  try {
    if (choice === 'open') prompt.onOpenExisting()
    else if (choice === 'keep') await prompt.onKeepBoth()
    else await prompt.onReplace()
    receiveUi.clearDuplicate()
  } catch (e) {
    receiveUi.duplicateBusy = false
    snackbar.show(e instanceof Error ? e.message : 'Could not finish receive.', { tone: 'error' })
  }
}
</script>

<template>
  <ConfirmDialog
    :open="!!receiveUi.duplicatePrompt"
    title="Already in Local Library?"
    :message="
      receiveUi.duplicatePrompt
        ? `“${receiveUi.duplicatePrompt.incomingTitle}” looks like “${receiveUi.duplicatePrompt.existingTitle}” (same title and size).`
        : ''
    "
    confirm-label="Replace"
    :danger="false"
    @close="!receiveUi.duplicateBusy && receiveUi.dismissDuplicate()"
    @confirm="run('replace')"
  >
    <div class="dup-actions">
      <button
        type="button"
        class="btn"
        :disabled="receiveUi.duplicateBusy"
        @click="run('open')"
      >
        Open existing
      </button>
      <button
        type="button"
        class="btn"
        :disabled="receiveUi.duplicateBusy"
        @click="run('keep')"
      >
        Keep both
      </button>
    </div>
  </ConfirmDialog>
</template>

<style scoped>
.dup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 0.15rem;
}
</style>
