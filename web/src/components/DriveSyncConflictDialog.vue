<script setup lang="ts">
/**
 * Optional manual Drive conflict UI (concurrent sync auto-merges by default).
 * Mount once from App.vue so Sync now works from any route.
 */
import ConfirmDialog from './ConfirmDialog.vue'
import {
  dismissDriveConflict,
  driveConflictUi,
  resolveDriveConflict,
} from '../lib/google/driveAppStateSync'
</script>

<template>
  <ConfirmDialog
    :open="driveConflictUi.open"
    title="Drive sync conflict"
    message="Google Drive and this device both have changes that have not been synced together. Choose what to keep."
    :danger="false"
    wide
    @close="dismissDriveConflict"
  >
    <template #actions>
      <div class="actions">
        <button type="button" class="btn" @click="resolveDriveConflict('keep-local')">
          Keep this device
        </button>
        <button type="button" class="btn" @click="resolveDriveConflict('merge')">
          Merge favorites
        </button>
        <button type="button" class="btn btn-primary" @click="resolveDriveConflict('keep-cloud')">
          Use Drive
        </button>
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
</style>
