<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PartId, TagDetail } from '../types/tag'
import {
  DOWNLOAD_FORMAT_OPTIONS,
  encodeQualityForDownload,
  HOSTED_AUDIO_MIME,
  IDENTITY_TRANSFORM,
  type UserDownloadFormat,
} from '../types/audio'
import { originalAudioPath, playableAudioParts } from '../lib/audioTiers'
import { partTrackLabel, sortPartIds } from '../lib/parts'
import { mediaUrl } from '../lib/mediaUrl'
import { downloadableSheetAssets } from '../lib/sheetAssets'
import { downloadBlob, fetchBytes, sampleUrl, buildZip, type QueueTrack } from '../download/zip'
import { downloadFilename, prepareDownloadBytes } from '../download/transform'
import { useStarsStore } from '../stores/stars'

const props = defineProps<{
  detail: TagDetail
  offline?: boolean
  /** When set, direct file/zip download is disabled (e.g. cache-only tag detail). */
  downloadBlockedReason?: string | null
  /** When set, “Add to downloads” (queue) is disabled with this reason. */
  queueBlockedReason?: string | null
  queueMessage?: string | null
}>()

const emit = defineEmits<{
  'add-to-queue': [items: QueueTrack[]]
  'cache-upgraded': []
}>()

const stars = useStarsStore()
const err = ref<string | null>(null)
const msg = ref<string | null>(null)
const audioFormat = ref<UserDownloadFormat>('m4a')

type Asset = { id: string; label: string; kind: 'sheet' | 'audio' | 'page'; path: string; part?: PartId }

const assets = computed(() => {
  const d = props.detail
  const list: Asset[] = []
  for (const sheet of downloadableSheetAssets(d)) {
    list.push({
      id: sheet.id,
      label: sheet.label,
      kind: sheet.label === 'PDF' ? 'sheet' : 'page',
      path: sheet.path,
    })
  }
  for (const part of sortPartIds(playableAudioParts(d, 'online'))) {
    const path = originalAudioPath(d, part)
    if (!path) continue
    list.push({
      id: `audio-${part}`,
      label: partTrackLabel(part),
      kind: 'audio',
      path,
      part,
    })
  }
  return list
})

const selected = ref<Set<string>>(new Set())

watch(
  assets,
  (list) => {
    const ids = new Set(list.map((a) => a.id))
    // Drop selections for assets that disappeared; do not auto-select anything new.
    selected.value = new Set([...selected.value].filter((id) => ids.has(id)))
  },
  { immediate: true },
)

const selectedCount = computed(() => selected.value.size)
const audioSelected = computed(() =>
  assets.value.some((a) => a.kind === 'audio' && selected.value.has(a.id)),
)
const queueSelectionCount = computed(
  () => assets.value.filter((a) => selected.value.has(a.id)).length,
)
const queueAllCount = computed(() => assets.value.length)
const directDownloadDisabled = computed(
  () => !!props.offline || !!props.downloadBlockedReason,
)
const busyMode = ref<'files' | 'zip' | null>(null)

function toggle(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function mimeForAsset(a: Asset, name: string): string {
  if (a.kind === 'page') return 'image/webp'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.mp3')) return 'audio/mpeg'
  if (name.endsWith('.ogg')) return 'audio/ogg'
  if (name.endsWith('.m4a')) return HOSTED_AUDIO_MIME
  if (name.endsWith('.wav')) return 'audio/wav'
  return 'application/octet-stream'
}

async function preparePickedFiles(): Promise<Array<{ name: string; data: Uint8Array; mime: string }>> {
  const picks = assets.value.filter((a) => selected.value.has(a.id))
  if (!picks.length) throw new Error('Select at least one file to download.')
  const files: Array<{ name: string; data: Uint8Array; mime: string }> = []
  let cacheUpgraded = false
  for (const a of picks) {
    if (a.kind === 'audio' && a.part) {
      const raw = await fetchBytes(sampleUrl(a.path))
      const data = await prepareDownloadBytes({
        input: raw,
        format: audioFormat.value,
        transform: IDENTITY_TRANSFORM,
        encodeQuality: encodeQualityForDownload(audioFormat.value),
      })
      const name = downloadFilename(a.part, audioFormat.value, IDENTITY_TRANSFORM)
      files.push({ name, data, mime: mimeForAsset(a, name) })

      if (stars.ids.has(props.detail.tag_id)) {
        const { upgradeStarredAudioPart } = await import('../offline/starredDb')
        const copy = new Uint8Array(raw.byteLength)
        copy.set(raw)
        await upgradeStarredAudioPart(props.detail.tag_id, a.part, {
          path: a.path,
          mime: HOSTED_AUDIO_MIME,
          data: copy.buffer,
          quality: 'original',
        })
        cacheUpgraded = true
      }
    } else {
      const res = await fetch(mediaUrl(a.path))
      if (!res.ok) throw new Error(`Failed to fetch ${a.label} (${res.status})`)
      const data = new Uint8Array(await res.arrayBuffer())
      const name = a.path.split('/').pop() || a.id
      files.push({ name, data, mime: mimeForAsset(a, name) })
    }
  }
  if (cacheUpgraded) emit('cache-upgraded')
  return files
}

function queueItemsFor(ids: ReadonlySet<string> | 'all'): QueueTrack[] {
  const d = props.detail
  const title = d.title || `Tag ${d.tag_id}`
  const items: QueueTrack[] = []
  for (const a of assets.value) {
    if (ids !== 'all' && !ids.has(a.id)) continue
    if (a.kind === 'audio' && a.part) {
      items.push({
        kind: 'audio',
        tagId: d.tag_id,
        title,
        part: a.part,
        path: a.path,
        transform: { ...IDENTITY_TRANSFORM },
        format: audioFormat.value,
        label: a.label,
      })
    } else {
      items.push({
        kind: 'sheet',
        tagId: d.tag_id,
        title,
        part: a.id,
        path: a.path,
        label: a.label,
      })
    }
  }
  return items
}

function addSelectedToQueue(): void {
  emit('add-to-queue', queueItemsFor(selected.value))
}

function addAllToQueue(): void {
  emit('add-to-queue', queueItemsFor('all'))
}

function zipBaseName(): string {
  const id = props.detail.tag_id
  const title = (props.detail.title || `tag-${id}`).replace(/[^\w.\-]+/g, '_').slice(0, 48)
  return `${id}-${title}`
}

async function downloadSelected(): Promise<void> {
  busyMode.value = 'files'
  err.value = null
  msg.value = null
  try {
    const files = await preparePickedFiles()
    for (const f of files) downloadBlob(f.data, f.name, f.mime)
    msg.value = `Downloaded ${files.length} file${files.length === 1 ? '' : 's'}.`
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    busyMode.value = null
  }
}

async function downloadSelectedZip(): Promise<void> {
  busyMode.value = 'zip'
  err.value = null
  msg.value = null
  try {
    const files = await preparePickedFiles()
    const zipped = buildZip(files.map((f) => ({ name: f.name, data: f.data })))
    downloadBlob(zipped, `${zipBaseName()}.zip`, 'application/zip')
    msg.value = `Downloaded zip with ${files.length} file${files.length === 1 ? '' : 's'}.`
  } catch (e) {
    err.value = e instanceof Error ? e.message : String(e)
  } finally {
    busyMode.value = null
  }
}
</script>

<template>
  <details class="dl section">
    <summary class="section-summary head">
      <span class="section-title">Download</span>
    </summary>
    <div class="body">
      <p v-if="assets.length" class="picker-hint">
        Tap files to select them for download or the queue.
      </p>
      <p v-else class="muted">No downloadable files on this tag.</p>

      <div v-if="assets.length" class="toggles" role="group" aria-label="Download files">
        <button
          v-for="a in assets"
          :key="a.id"
          type="button"
          class="toggle"
          :class="{ on: selected.has(a.id) }"
          :aria-pressed="selected.has(a.id)"
          @click="toggle(a.id)"
        >
          {{ a.label }}
        </button>
      </div>

      <div v-if="audioSelected" class="audio-opts">
        <label>
          Download as
          <select v-model="audioFormat" aria-label="Download as">
            <option v-for="f in DOWNLOAD_FORMAT_OPTIONS" :key="f.value" :value="f.value">
              {{ f.label }}
            </option>
          </select>
        </label>
        <p class="format-hint muted">
          Original is the hosted AAC file (~128 kbps, .m4a). MP3 is transcoded on your device (LAME VBR quality&nbsp;2).
        </p>
      </div>

      <p v-if="downloadBlockedReason" class="muted tip">{{ downloadBlockedReason }}</p>

      <p v-if="offline" class="muted offline-hint" role="status">
        Offline — use Queue selected / Queue all; zip export runs when you’re back online.
      </p>

      <div class="actions">
        <button
          type="button"
          class="go"
          :disabled="!!busyMode || !selectedCount || directDownloadDisabled"
          :title="
            downloadBlockedReason ||
              (offline ? 'Connect to download files — use Queue while offline' : undefined)
          "
          @click="downloadSelected"
        >
          {{
            busyMode === 'files'
              ? 'Preparing…'
              : offline
                ? 'Download (needs connection)'
                : `Download selected (${selectedCount})`
          }}
        </button>
        <button
          v-if="selectedCount > 1"
          type="button"
          class="go secondary"
          :disabled="!!busyMode || directDownloadDisabled"
          :title="
            downloadBlockedReason ||
              (offline ? 'Connect to download files — use Queue while offline' : undefined)
          "
          @click="downloadSelectedZip"
        >
          {{
            busyMode === 'zip'
              ? 'Zipping…'
              : `Download selected as zip (${selectedCount})`
          }}
        </button>
      </div>

      <div v-if="assets.length" class="queue-actions">
        <p class="queue-lbl">Download queue</p>
        <div class="actions queue-btns">
          <button
            type="button"
            class="go secondary"
            :disabled="!!busyMode || !!queueBlockedReason || !queueSelectionCount"
            :title="
              queueBlockedReason || 'Add the checked files to the downloads queue (works offline)'
            "
            @click="addSelectedToQueue"
          >
            Queue selected ({{ queueSelectionCount }})
          </button>
          <button
            type="button"
            class="go secondary"
            :disabled="!!busyMode || !!queueBlockedReason || !queueAllCount"
            :title="
              queueBlockedReason || 'Add every file on this tag to the downloads queue (works offline)'
            "
            @click="addAllToQueue"
          >
            Queue all ({{ queueAllCount }})
          </button>
        </div>
      </div>

      <p v-if="queueBlockedReason" class="muted tip">{{ queueBlockedReason }}</p>
      <p v-if="queueMessage" class="ok" role="status">{{ queueMessage }}</p>
      <p v-if="msg" class="ok" role="status">{{ msg }}</p>
      <p v-if="err" class="error" role="alert">{{ err }}</p>
    </div>
  </details>
</template>

<style scoped>
.dl {
  margin: 1rem 0;
  padding: 0.35rem 0.85rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
  min-width: 0;
  max-width: 100%;
}
.section-summary.head {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  list-style: none;
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 1.1rem;
  font-weight: 600;
  padding: 0.65rem 0 0.5rem;
  min-width: 0;
}
.section-summary.head::-webkit-details-marker {
  display: none;
}
.section-summary.head::before {
  content: '▸';
  display: inline-block;
  margin-right: 0.45rem;
  transition: transform 0.15s ease;
  color: var(--muted);
  font-size: 0.85em;
}
details[open] > .section-summary.head::before {
  transform: rotate(90deg);
}
.section-title {
  min-width: 0;
}
.picker-hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.body {
  display: grid;
  gap: 1rem;
  padding: 0.35rem 0 0.15rem;
  border-top: 1px solid var(--border);
  min-width: 0;
}
.muted {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.toggles {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  min-width: 0;
}
.toggle {
  min-height: 44px;
  padding: 0.5rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
  flex: 1 1 auto;
  min-width: 0;
}
.toggle.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 35%, transparent);
}
.toggle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.audio-opts {
  display: grid;
  gap: 0.85rem;
}
.format-hint {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.4;
}
.audio-opts label {
  display: grid;
  gap: 0.4rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.audio-opts select {
  font: inherit;
  min-height: 48px;
  font-size: 16px;
  border-radius: 8px;
  border: 1px solid var(--border);
  padding: 0.45rem 0.65rem;
  background: var(--bg);
}
.go {
  min-height: 48px;
  border: 0;
  border-radius: 10px;
  background: var(--accent);
  color: #fff;
  font: inherit;
  font-weight: 600;
  padding: 0.6rem 1rem;
}
.go.secondary {
  background: var(--bg);
  color: inherit;
  border: 1px solid var(--border);
}
.go:disabled {
  opacity: 0.55;
}
.actions {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.15rem;
}
.queue-actions {
  display: grid;
  gap: 0.45rem;
  padding-top: 0.35rem;
  border-top: 1px solid var(--border);
}
.queue-lbl {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--muted);
}
.queue-btns {
  margin-top: 0;
}
.ok {
  margin: 0;
  color: var(--accent);
  font-size: 0.9rem;
}
.tip {
  font-size: 0.85rem;
}
.error {
  margin: 0;
  color: var(--danger);
  font-size: 0.9rem;
}
@media (min-width: 640px) {
  .dl {
    margin: 1.25rem 0;
    padding: 0.35rem 1.15rem 1.25rem;
  }
  .section-summary.head {
    font-size: 1.15rem;
  }
  .toggle {
    flex: 0 0 auto;
  }
  .audio-opts {
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .actions {
    grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
    gap: 0.75rem;
  }
}
</style>
