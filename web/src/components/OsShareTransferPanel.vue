<script setup lang="ts">
/**
 * Labs OS Share handoff — system share sheet (Quick Share / AirDrop) + file import.
 */
import { onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import InfoTips from './InfoTips.vue'
import { buildTransferBundle, opticalFileFromBrowserFile } from '../lib/transferBundle'
import {
  canShareFiles,
  downloadTransferBundle,
  isShareTargetQuery,
  shareTransferBundle,
  takeShareTargetFiles,
} from '../lib/osShareTransfer'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'
import { useSnackbarStore } from '../stores/snackbar'

const props = defineProps<{
  tab: 'send' | 'receive'
  files: File[]
  disabled?: boolean
}>()

const emit = defineEmits<{
  received: [file: OpticalFile]
}>()

const route = useRoute()
const router = useRouter()
const snackbar = useSnackbarStore()

const status = ref('')
const error = ref<string | null>(null)
const busy = ref(false)

async function ingestBrowserFiles(files: File[]): Promise<void> {
  for (const file of files) {
    const optical = await opticalFileFromBrowserFile(file)
    emit('received', optical)
  }
}

async function shareQueue(): Promise<void> {
  if (!props.files.length || props.disabled) return
  busy.value = true
  error.value = null
  status.value = 'Packing…'
  try {
    const bundle = await buildTransferBundle(props.files)
    if (canShareFiles(bundle.file)) {
      status.value = 'Opening share sheet…'
      const result = await shareTransferBundle(bundle.file)
      if (result === 'shared') {
        status.value = 'Shared — pick Quick Share, AirDrop, or Files on the other phone'
        snackbar.show('Choose Quick Share or AirDrop in the share sheet', { tone: 'ok', ms: 4000 })
      } else if (result === 'aborted') {
        status.value = 'Share cancelled'
      } else {
        downloadTransferBundle(bundle.file)
        status.value = 'Downloaded — share that file via Quick Share / AirDrop / Files'
      }
    } else {
      downloadTransferBundle(bundle.file)
      status.value =
        'Web Share unavailable — file downloaded. Share it with Quick Share, AirDrop, or Files.'
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Could not share.'
  } finally {
    busy.value = false
  }
}

async function onImportPicked(ev: Event): Promise<void> {
  const input = ev.target as HTMLInputElement
  const list = input.files ? Array.from(input.files) : []
  input.value = ''
  if (!list.length) return
  busy.value = true
  error.value = null
  try {
    await ingestBrowserFiles(list)
    status.value = `Imported ${list.length} file${list.length === 1 ? '' : 's'}`
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Import failed.'
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  if (props.tab !== 'receive') return
  if (!isShareTargetQuery(route.query)) return
  void (async () => {
    busy.value = true
    try {
      const shared = await takeShareTargetFiles()
      if (shared.length) {
        await ingestBrowserFiles(shared)
        status.value = `Imported ${shared.length} shared file${shared.length === 1 ? '' : 's'}`
        snackbar.show('Imported from share', { tone: 'ok', ms: 3000 })
      }
      const q = { ...route.query }
      delete q['share-target']
      delete q.shareTarget
      await router.replace({ name: 'rx', query: q })
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Could not read shared files.'
    } finally {
      busy.value = false
    }
  })()
})
</script>

<template>
  <div class="os-share-panel">
    <div class="hint-row">
      <p class="hint">
        Opens the <strong>device share sheet</strong> (Quick Share, AirDrop, Files). SingTags cannot
        call Quick Share directly.
      </p>
      <InfoTips label="OS Share how-to" title="How to share via device">
        <p><strong>Send</strong></p>
        <ol>
          <li>Queue files on Send → Share.</li>
          <li>Tap <strong>Share via device…</strong> and pick Quick Share, AirDrop, Nearby Share, or Files.</li>
          <li>If the share sheet is unavailable, SingTags downloads the pack so you can share that file yourself.</li>
        </ol>
        <p><strong>Receive on Android</strong></p>
        <ul>
          <li>Install SingTags as a PWA (Add to Home screen) so it can appear as a share target.</li>
          <li>From the other phone/device, share the pack and choose SingTags — or save the file and use <strong>Import shared file…</strong>.</li>
        </ul>
        <p><strong>Receive on iPhone</strong></p>
        <ul>
          <li>AirDrop into Files (or save the shared pack).</li>
          <li>Open Receive → Share and tap <strong>Import shared file…</strong>.</li>
        </ul>
        <p>
          Cross-platform Quick Share QR cloud paths are OS/device-limited and need internet — they are
          not controlled by SingTags.
        </p>
      </InfoTips>
    </div>

    <div v-if="tab === 'send'" class="actions">
      <button
        type="button"
        class="btn btn-primary"
        :disabled="disabled || busy || !files.length"
        @click="shareQueue"
      >
        Share via device…
      </button>
    </div>

    <div v-else class="actions">
      <label class="btn btn-primary file-add" :class="{ disabled: disabled || busy }">
        Import shared file…
        <input
          class="visually-hidden"
          type="file"
          multiple
          :disabled="disabled || busy"
          @change="onImportPicked"
        />
      </label>
    </div>

    <p v-if="error" class="err" role="alert">{{ error }}</p>
    <p v-else-if="status" class="status" role="status">{{ status }}</p>
  </div>
</template>

<style scoped>
.os-share-panel {
  display: grid;
  gap: 0.75rem;
}
.hint-row {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
}
.hint-row .hint {
  flex: 1;
  min-width: 0;
}
.hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.file-add {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
}
.file-add.disabled {
  opacity: 0.55;
  pointer-events: none;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.err {
  margin: 0;
  color: var(--danger, #b00020);
}
.status {
  margin: 0;
  color: var(--muted);
}
</style>
