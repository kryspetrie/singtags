/**
 * Transient UI for Local Library receive: group placement + soft-duplicate dialog.
 */
import { defineStore } from 'pinia'
import { ref } from 'vue'

export type LocalDuplicatePrompt = {
  existingId: string
  existingTitle: string
  incomingTitle: string
  onOpenExisting: () => void
  onKeepBoth: () => void | Promise<void>
  onReplace: () => void | Promise<void>
  onDismiss?: () => void
}

export const useLocalReceiveUiStore = defineStore('localReceiveUi', () => {
  const groupPickerEntryIds = ref<string[] | null>(null)
  const duplicatePrompt = ref<LocalDuplicatePrompt | null>(null)
  const duplicateBusy = ref(false)

  function openGroupPicker(entryIds: string[]): void {
    groupPickerEntryIds.value = [...entryIds]
  }

  function closeGroupPicker(): void {
    groupPickerEntryIds.value = null
  }

  function askDuplicate(prompt: LocalDuplicatePrompt): void {
    duplicatePrompt.value = prompt
    duplicateBusy.value = false
  }

  function clearDuplicate(): void {
    duplicatePrompt.value = null
    duplicateBusy.value = false
  }

  function dismissDuplicate(): void {
    const prompt = duplicatePrompt.value
    duplicatePrompt.value = null
    duplicateBusy.value = false
    prompt?.onDismiss?.()
  }

  return {
    groupPickerEntryIds,
    duplicatePrompt,
    duplicateBusy,
    openGroupPicker,
    closeGroupPicker,
    askDuplicate,
    clearDuplicate,
    dismissDuplicate,
  }
})
