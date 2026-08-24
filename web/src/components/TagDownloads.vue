<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import type { PartId, TagDetail } from '../types/tag'
import type { AudioTransform, DownloadFormat } from '../types/audio'
import { isIdentityTransform, transformFromMode, type TransformMode } from '../types/audio'
import { partTrackLabel, sortPartIds } from '../lib/parts'
import { mediaUrl } from '../lib/mediaUrl'
import { originalSheetPaths, sheetFileLabel } from '../lib/sheetAssets'
import { isImageSheetPath, isPdfPath } from '../lib/sheetPath'
import { downloadBlob, fetchBytes, sampleUrl, buildZip } from '../download/zip'
import { downloadFilename, prepareDownloadBytes } from '../download/transform'
import { usePreferencesStore } from '../stores/preferences'

const props = defineProps<{
  detail: TagDetail
  transform: AudioTransform
  /** When set, “Add to downloads” (queue) is disabled with this reason. */
  queueBlockedReason?: string | null
  queueMessage?: string | null
}>()

const emit = defineEmits<{
  'add-to-queue': []
}>()

const prefs = usePreferencesStore()
const err = ref<string | null>(null)
const msg = ref<string | null>(null)
const audioFormat = ref<DownloadFormat>('mp4')
const transformMode = ref<TransformMode>('original')

type Asset = { id: string; label: string; kind: 'sheet' | 'audio' | 'page'; path: string; part?: PartId }

/** Short type labels; filenames only when there are multiple of that kind. */
function sheetLabel(path: string, originals: string[]): string {
  const name = sheetFileLabel(path)
  if (isPdfPath(path)) {
    const pdfCount = originals.filter((p) => isPdfPath(p)).length
    return pdfCount > 1 ? name : 'PDF'
  }
  if (isImageSheetPath(path)) {
    const imageCount = originals.filter((p) => isImageSheetPath(p)).length
    return imageCount > 1 ? name : 'Image'
  }
  return name
}

const assets = computed(() => {
  const d = props.detail
  const list: Asset[] = []
  const originals = originalSheetPaths(d)
  for (const [i, path] of originals.entries()) {
    list.push({
      id: `sheet-${i}-${path}`,
      label: sheetLabel(path, originals),
      kind: 'sheet',
      path,
    })
  }
  // Raster pages are a viewing aid derived from an original — don't offer them
  // as separate downloads when the source file is already listed.
  if (!originals.length) {
    const pageCount = d.sheet_pages?.length ?? 0
    for (const [i, page] of (d.sheet_pages ?? []).entries()) {
      list.push({
        id: `page-${i}`,
        label: pageCount > 1 ? `Page ${i + 1}` : 'Page',
        kind: 'page',
        path: page,
      })
    }
  }
  for (const part of sortPartIds(Object.keys(d.audio))) {
    const path = d.audio[part]
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

function defaultSelection(list: Asset[]): Set<string> {
  const next = new Set<string>()
  const images = list.filter((a) => a.kind === 'sheet' && isImageSheetPath(a.path))
  if (images.length) {
    for (const a of images) next.add(a.id)
    return next
  }
  const pdfs = list.filter((a) => a.kind === 'sheet' && isPdfPath(a.path))
  for (const a of pdfs) next.add(a.id)
  if (next.size) return next
  // Offline / pages-only tags: prefer raster pages when that's all we have.
  for (const a of list) {
    if (a.kind === 'page') next.add(a.id)
  }
  return next
}

watch(
  assets,
  (list) => {
    selected.value = defaultSelection(list)
  },
  { immediate: true },
)

const hasTransform = computed(() => !isIdentityTransform(props.transform))
const selectedCount = computed(() => selected.value.size)
const audioSelected = computed(() =>
  assets.value.some((a) => a.kind === 'audio' && selected.value.has(a.id)),
)
const busyMode = ref<'files' | 'zip' | null>(null)

function toggle(id: string): void {
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function selectAll(): void {
  selected.value = new Set(assets.value.map((a) => a.id))
}

function selectNone(): void {
  selected.value = new Set()
}

function selectTracksOnly(): void {
  selected.value = new Set(assets.value.filter((a) => a.kind === 'audio').map((a) => a.id))
}

function mimeForAsset(a: Asset, name: string): string {
  if (a.kind === 'page') return 'image/webp'
  if (name.endsWith('.pdf')) return 'application/pdf'
  if (name.endsWith('.png')) return 'image/png'
  if (name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image/jpeg'
  if (name.endsWith('.webp')) return 'image/webp'
  if (name.endsWith('.mp3')) return 'audio/mpeg'
  if (name.endsWith('.ogg')) return 'audio/ogg'
  if (name.endsWith('.mp4')) return 'audio/mp4'
  if (name.endsWith('.wav')) return 'audio/wav'
  return 'application/octet-stream'
}

async function preparePickedFiles(): Promise<Array<{ name: string; data: Uint8Array; mime: string }>> {
  const picks = assets.value.filter((a) => selected.value.has(a.id))
  if (!picks.length) throw new Error('Select at least one file to download.')
  const files: Array<{ name: string; data: Uint8Array; mime: string }> = []
  for (const a of picks) {
    if (a.kind === 'audio' && a.part) {
      const raw = await fetchBytes(sampleUrl(a.path))
      const mode: TransformMode = hasTransform.value ? transformMode.value : 'original'
      const transform = transformFromMode(mode, props.transform)
      const data = await prepareDownloadBytes({
        input: raw,
        format: audioFormat.value,
        transform,
        encodeQuality: prefs.audioEncodeQuality,
      })
      const name = downloadFilename(a.part, audioFormat.value, transform)
      files.push({ name, data, mime: mimeForAsset(a, name) })
    } else {
      const res = await fetch(mediaUrl(a.path))
      if (!res.ok) throw new Error(`Failed to fetch ${a.label} (${res.status})`)
      const data = new Uint8Array(await res.arrayBuffer())
      const name = a.path.split('/').pop() || a.id
      files.push({ name, data, mime: mimeForAsset(a, name) })
    }
  }
  return files
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
  <details class="dl section" open>
    <summary class="section-summary head">
      <span class="section-title">Download</span>
      <div class="quick" @click.stop>
        <button type="button" class="ghost" @click="selectAll">All</button>
        <button type="button" class="ghost" @click="selectNone">None</button>
        <button type="button" class="ghost" @click="selectTracksOnly">Tracks Only</button>
      </div>
    </summary>
    <div class="body">
      <p class="muted">Tap to select sheet music and learning tracks.</p>

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
      <p v-else class="muted">No downloadable files on this tag.</p>

      <div v-if="audioSelected" class="audio-opts">
        <label>
          Audio format
          <select v-model="audioFormat" aria-label="Audio download format">
            <option value="mp4">MP4 (hosted AAC)</option>
            <option value="mp3">MP3 VBR</option>
            <option value="ogg">OGG Vorbis</option>
          </select>
        </label>
        <label v-if="hasTransform">
          Apply current pitch/speed
          <select v-model="transformMode" aria-label="Audio transform">
            <option value="original">Original (no transform)</option>
            <option value="key">Current key</option>
            <option value="speed">Current speed</option>
            <option value="key+speed">Current key + speed</option>
          </select>
        </label>
      </div>

      <div class="actions">
        <button
          type="button"
          class="go"
          :disabled="!!busyMode || !selectedCount"
          @click="downloadSelected"
        >
          {{
            busyMode === 'files'
              ? 'Preparing…'
              : `Download selected (${selectedCount})`
          }}
        </button>
        <button
          type="button"
          class="go secondary"
          :disabled="!!busyMode || !selectedCount"
          @click="downloadSelectedZip"
        >
          {{
            busyMode === 'zip'
              ? 'Zipping…'
              : `Download selected as zip (${selectedCount})`
          }}
        </button>
        <button
          type="button"
          class="go secondary"
          :disabled="!!busyMode || !!queueBlockedReason || !selectedCount"
          :title="queueBlockedReason || undefined"
          @click="emit('add-to-queue')"
        >
          Add to downloads
        </button>
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
  margin: 1.25rem 0;
  padding: 0.35rem 1.15rem 1.25rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--surface);
}
.section-summary.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  list-style: none;
  cursor: pointer;
  font-family: var(--font-display);
  font-size: 1.15rem;
  font-weight: 600;
  padding: 0.75rem 0 0.55rem;
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
  flex: 1 1 auto;
  min-width: 0;
}
.quick {
  display: flex;
  gap: 0.45rem;
  flex-shrink: 0;
}
.ghost {
  min-height: 40px;
  border: 1px solid var(--border);
  background: var(--bg);
  border-radius: 8px;
  padding: 0.3rem 0.75rem;
  font: inherit;
}
.body {
  display: grid;
  gap: 1rem;
  padding: 0.35rem 0 0.15rem;
  border-top: 1px solid var(--border);
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
}
.toggle {
  min-height: 44px;
  padding: 0.5rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  color: inherit;
  cursor: pointer;
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
  .audio-opts {
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }
  .actions {
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.75rem;
  }
}
</style>
