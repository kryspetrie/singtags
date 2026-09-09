<script setup lang="ts">
/**
 * Send or receive arbitrary files via Decimen fountain-coded QR streams.
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute, useRouter, type RouteLocationNormalizedLoaded } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import OpticalReceiveInvite from '../components/OpticalReceiveInvite.vue'
import OpticalReceiveInviteOverlay from '../components/OpticalReceiveInviteOverlay.vue'
import OpticalReceivedPreview from '../components/OpticalReceivedPreview.vue'
import OpticalReceiveStreamOverlay from '../components/OpticalReceiveStreamOverlay.vue'
import OpticalTransferStreamOverlay from '../components/OpticalTransferStreamOverlay.vue'
import OpticalTransferQualityToggle from '../components/OpticalTransferQualityToggle.vue'
import { DecimenSendStream } from '../lib/decimen/sendStream'
import {
  formatOpticalPlanSummary,
  planOpticalTransfer,
  resolveOpticalTransferPreset,
  type OpticalTransferPlan,
} from '../lib/decimen/opticalTransferPlan'
import type { DecimenSendStreamProgress } from '../lib/decimen/sendProgress'
import { createOpticalSendCountdownSignal, runOpticalSendCountdown, type OpticalSendCountdownTick } from '../lib/decimen/sendCountdown'
import { DecimenReceiveCapture } from '../lib/decimen/receiveCapture'
import {
  estimateOpticalTransferPreview,
  prepareOpticalTransfer,
  prefersOpticalDownloadSave,
  saveOpticalFiles,
} from '../lib/decimen/opticalTransfer'
import {
  canOpenOpticalAfterTransfer,
  opticalPreviewKind,
} from '../lib/decimen/opticalReceivePreview'
import {
  DEFAULT_OPTICAL_AUDIO_FORMAT,
  estimateOpticalAudioPayloadBytes,
  isOpticalAudioFile,
  OpticalAudioPrepareQueue,
  OPTICAL_AUDIO_FORMAT_OPTIONS,
  probeFileAudioDurationSeconds,
  type OpticalAudioFormat,
  type PreparedOpticalAudio,
} from '../lib/decimen/opticalAudioFormat'
import {
  listVideoInputDevices,
  opticalVideoConstraints,
  type OpticalCameraDevice,
} from '../lib/decimen/opticalCamera'
import { isOpticalReceiveRoute, opticalReceiveAbsoluteHref } from '../lib/decimen/opticalTransferNav'
import { isSingtagsSheetFile, unpackSingtagsSheetFile } from '../lib/decimen/singtagsPayload'
import {
  isLocalDocTransferFile,
  isLocalEntryTransferFile,
  unpackLocalDocFile,
  unpackLocalEntryFile,
  packLocalEntryFile,
  LOCAL_ENTRY_TRANSFER_MIME,
} from '../lib/decimen/localDocTransfer'
import { ingestLocalTransferFile } from '../lib/localDocReceive'
import {
  isSingtagsCollectionFile,
  unpackSingtagsCollectionFile,
  type CollectionBatchManifest,
} from '../lib/decimen/collectionTransfer'
import { prepareCollectionTransfer } from '../lib/decimen/prepareCollectionTransfer'
import { anyHighResTransferAvailable } from '../lib/decimen/loadTagForTransfer'
import {
  applyReceivedCollectionToLibrary,
  collectionReceiveProgress,
  importCollectionBatchTags,
  importedTagIdsForSession,
  markCollectionBatchImported,
  upsertCollectionSession,
  type CollectionReceiveSession,
} from '../lib/decimen/collectionReceive'
import { putTransferredTag } from '../offline/transferredDb'
import { formatBytes } from '../offline/storageEstimate'
import { MAX_FILE_LABEL } from '../../vendor/decimen/shared/protocol'
import type { OpticalFile } from '../../vendor/decimen/shared/protocol'
import {
  OPTICAL_FRAME_BYTES_LABELS,
  formatOpticalThroughput,
  opticalPayloadFits,
  suggestOpticalFrameBytes,
  type OpticalFrameBytes,
  type OpticalGridCodes,
  type OpticalTxFps,
} from '../lib/decimen/sendSettings'
import {
  estimateOpticalStageCss,
} from '../lib/decimen/opticalDensityResolve'
import {
  canEaseOpticalSend,
  nextEasierOpticalSendParams,
} from '../lib/decimen/opticalSendEase'
import {
  OPTICAL_TRANSFER_CONCRETE_PRESETS,
  OPTICAL_TRANSFER_PRESET_DEFS,
  OPTICAL_TRANSFER_PRESET_OPTIONS,
  normalizeOpticalTransferConcretePreset,
  type OpticalTransferConcretePreset,
  type OpticalTransferPreset,
} from '../lib/decimen/opticalTransferPresets'
import { useCatalogStore } from '../stores/catalog'
import { parseTagIdList } from '../lib/favoritesShare'
import { useFavoritesStore } from '../stores/favorites'
import { useLocalLibraryStore } from '../stores/localLibrary'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'
import { useUserCollectionsStore } from '../stores/userCollections'
import { useOnline } from '../composables/useOnline'
import { tagOpenLocation } from '../lib/tagOpen'
import { tagSummaryFromSheetTransferMeta } from '../lib/sheetQrTransfer'
import type { TagSummary } from '../types/tag'
import {
  decodeLocalTransferAssetQuery,
  defaultOpticalTransferAssets,
} from '../types/localLibrary'

type Tab = 'send' | 'receive'

function tabFromRoute(route: RouteLocationNormalizedLoaded): Tab {
  return isOpticalReceiveRoute(route) ? 'receive' : 'send'
}

type QueuedFile = {
  id: number
  file: File
  batchLabel?: string
}

type ReceivedItem = {
  id: string
  file: OpticalFile
  singtagsTagId: number | null
  collectionBatch: CollectionBatchManifest | null
  localDocTitle: string | null
  collectionImported: boolean
  localDocImported: boolean
  saved: boolean
}

type SendPreview = {
  payloadBytes: number
  containerBytes: number
  etaLabel: string
  sendName: string
  fileCount: number
}

const route = useRoute()
const router = useRouter()
const catalog = useCatalogStore()
const favorites = useFavoritesStore()
const localLibrary = useLocalLibraryStore()
const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()
const userCollections = useUserCollectionsStore()
const { offline } = useOnline()

const tab = ref<Tab>(tabFromRoute(route))
const canvasRef = ref<HTMLCanvasElement | null>(null)
const videoRef = ref<HTMLVideoElement | null>(null)

const queue = ref<QueuedFile[]>([])
let nextQueueId = 0

const audioFormat = ref<OpticalAudioFormat>(DEFAULT_OPTICAL_AUDIO_FORMAT)
const audioPrepareQueue = new OpticalAudioPrepareQueue()
const preparedAudioById = ref<Map<number, PreparedOpticalAudio>>(new Map())
/** Metadata duration for reencode size estimates (before prepare finishes). */
const audioDurationById = ref<Map<number, number>>(new Map())

const sendBusy = ref(false)
const sendError = ref<string | null>(null)
const sendStatus = ref('')
const sendProgress = ref<DecimenSendStreamProgress | null>(null)
const sendCountdown = ref<OpticalSendCountdownTick | null>(null)
const streaming = ref(false)

/** Resolved concrete mode (Auto re-evaluates from queue size). */
const resolvedTransferPreset = computed(() => {
  const preferred = prefs.opticalTransferPreset as OpticalTransferPreset
  if (!sendPreview.value) {
    return preferred === 'auto'
      ? 'balanced'
      : normalizeOpticalTransferConcretePreset(preferred)
  }
  return resolveOpticalTransferPreset({
    containerBytes: sendPreview.value.containerBytes,
    preferred,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : undefined,
  })
})

const selectedPresetDef = computed(() => {
  const mode = prefs.opticalTransferPreset as OpticalTransferPreset
  if (mode === 'auto') {
    return { hint: OPTICAL_TRANSFER_PRESET_OPTIONS[0]!.hint }
  }
  return OPTICAL_TRANSFER_PRESET_DEFS[normalizeOpticalTransferConcretePreset(mode)]
})

/** Next more-reliable concrete mode below Auto’s current pick (for downgrade guidance). */
function nextLowerConcretePreset(
  preset: OpticalTransferConcretePreset,
): OpticalTransferConcretePreset | null {
  const idx = OPTICAL_TRANSFER_CONCRETE_PRESETS.indexOf(preset)
  if (idx <= 0) return null
  return OPTICAL_TRANSFER_CONCRETE_PRESETS[idx - 1]!
}

const autoResolvedPresetLabel = computed(() => {
  if (prefs.opticalTransferPreset !== 'auto' || !sendPreview.value) return ''
  return OPTICAL_TRANSFER_PRESET_DEFS[resolvedTransferPreset.value].label
})

const autoResolvedDowngradeHint = computed(() => {
  if (prefs.opticalTransferPreset !== 'auto' || !sendPreview.value) return ''
  const lower = nextLowerConcretePreset(resolvedTransferPreset.value)
  if (!lower) {
    return 'If cameras struggle, try Easier scan while sending.'
  }
  return `If cameras struggle, switch Scan mode to ${OPTICAL_TRANSFER_PRESET_DEFS[lower].label}.`
})

function onTransferPresetChange(raw: string): void {
  prefs.setOpticalTransferPreset(raw as OpticalTransferPreset)
}

const receiveStatus = ref('')
const receiveError = ref<string | null>(null)
const receiveLive = ref(false)
const cameraDevices = ref<OpticalCameraDevice[]>([])
const received = ref<ReceivedItem[]>([])
const selectedReceivedIds = ref<Set<string>>(new Set())
const saveBusy = ref(false)
/** Phones: Save uses Downloads instead of the Android folder-permission sheet. */
const saveUsesDownload = prefersOpticalDownloadSave()
const saveAllLabel = computed(() => (saveUsesDownload ? 'Download all' : 'Save all…'))
const saveSelectedLabel = computed(() =>
  saveUsesDownload ? 'Download selected' : 'Save selected…',
)
const saveOneLabel = computed(() => (saveUsesDownload ? 'Download' : 'Save…'))
const saveAfterLabel = computed(() =>
  saveUsesDownload ? 'Download after transfer' : 'Save after transfer',
)
/** Session intents — Open defaults on; Save off. */
const saveAfterTransfer = ref(false)
const openAfterTransfer = ref(true)
const previewFile = ref<OpticalFile | null>(null)
/** Receive preview: fill stage height (default) vs show whole frame. */
const cameraFit = ref<'height' | 'all'>('height')

const cameraDeviceId = computed({
  get: () => prefs.opticalTransferCameraDeviceId,
  set: (id: string) => prefs.setOpticalTransferCameraDeviceId(id),
})

const sendPreview = ref<SendPreview | null>(null)
const sendPreviewBusy = ref(false)
const sendPreviewError = ref<string | null>(null)

const collectionPrepareBusy = ref(false)
const collectionPrepareStatus = ref('')
const collectionPrepareError = ref<string | null>(null)

const useHighRes = ref(false)
const highResAvailable = ref(false)
const tagTransferContext = ref<{ collectionName: string; tagIds: number[] } | null>(null)

const showSendQualityToggle = computed(() => tagTransferContext.value != null)

const collectionSessions = ref<Map<string, CollectionReceiveSession>>(new Map())
const collectionImportBusy = ref(false)
const receiveInviteOverlayOpen = ref(false)

const receiveInviteHref = computed(() => opticalReceiveAbsoluteHref(router))

const sendStreamStartDisabled = computed(
  () => !queue.value.length || sendBusy.value || streaming.value || densityTooLow.value || sendCountdown.value != null,
)

const sendStreamStartLabel = computed(() => {
  if (sendCountdown.value != null && sendCountdown.value !== 'paused') {
    return `Starting in ${sendCountdown.value}…`
  }
  if (sendCountdown.value === 'paused') return 'Countdown paused'
  if (streaming.value) return 'Streaming…'
  if (sendBusy.value) return 'Preparing…'
  return 'Start transfer'
})

let sendStream: DecimenSendStream | null = null
let countdownSignal: ReturnType<typeof createOpticalSendCountdownSignal> | null = null
/** Packed container for the active fullscreen send (survives density restarts). */
let activeSendPayload: {
  container: Uint8Array
  sendName: string
  frameBytes: number
  gridCodes: OpticalGridCodes
  txFps: OpticalTxFps
} | null = null
/** Reactive mirror for ease-scan availability (payload bytes stay in activeSendPayload). */
const activeSendMeta = ref<{
  frameBytes: number
  gridCodes: OpticalGridCodes
  containerBytes: number
} | null>(null)
const easeScanBusy = ref(false)
let cameraStream: MediaStream | null = null
let decimenCapture: DecimenReceiveCapture | null = null
let receiveActive = false

const canEaseScan = computed(() => {
  if (!streaming.value || !activeSendMeta.value || sendCountdown.value != null) return false
  const stage = estimateOpticalStageCss({
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
  })
  return canEaseOpticalSend({
    frameBytes: activeSendMeta.value.frameBytes,
    gridCodes: activeSendMeta.value.gridCodes,
    containerBytes: activeSendMeta.value.containerBytes,
    stageWidthCss: stage.width,
    stageHeightCss: stage.height,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  })
})

const queuedFiles = computed(() => queue.value.map((entry) => entry.file))

const queueHasAudio = computed(() => queue.value.some((entry) => isOpticalAudioFile(entry.file)))

function isCollectionBundleFile(file: File): boolean {
  return /^singtags-collection-.+-(\d+)-of-(\d+)\.bundle$/i.test(file.name)
}

const sendFiles = computed(() => {
  const files = queuedFiles.value
  if (!files.length) return []
  const allCollection = files.every((file) => isCollectionBundleFile(file))
  if (allCollection && files.length > 1) return [files[0]!]
  return files
})

function fileFromPreparedBytes(name: string, type: string, bytes: Uint8Array): File {
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  return new File([copy.buffer], name, { type })
}

/** Size stub for transfer preview without allocating a full buffer. */
function fileWithEstimatedSize(name: string, type: string, size: number): Pick<File, 'name' | 'size' | 'type'> {
  return { name, type, size: Math.max(0, Math.round(size)) }
}

/** Files for size estimate — prepared bytes when ready, else reencode estimate. */
const estimateFiles = computed(() => {
  return sendFiles.value.map((file) => {
    const entry = queue.value.find((e) => e.file === file)
    if (!entry || !isOpticalAudioFile(file)) return file
    const prepared = preparedAudioById.value.get(entry.id)
    if (prepared) {
      return fileWithEstimatedSize(prepared.name, prepared.type, prepared.bytes.byteLength)
    }
    const estimated = estimateOpticalAudioPayloadBytes({
      byteLength: file.size,
      format: audioFormat.value,
      durationSec: audioDurationById.value.get(entry.id) ?? null,
    })
    return fileWithEstimatedSize(file.name, file.type, estimated)
  })
})

/** True while any audio still uses a bitrate estimate (not actual prepared bytes). */
const audioSizeEstimateProvisional = computed(() => {
  if (audioFormat.value === 'original') return false
  return sendFiles.value.some((file) => {
    const entry = queue.value.find((e) => e.file === file)
    return !!entry && isOpticalAudioFile(file) && !preparedAudioById.value.has(entry.id)
  })
})

async function resolveSendFiles(): Promise<File[]> {
  const out: File[] = []
  for (const file of sendFiles.value) {
    const entry = queue.value.find((e) => e.file === file)
    if (entry && isOpticalAudioFile(file)) {
      const prepared = await audioPrepareQueue.ensure(
        String(entry.id),
        file,
        audioFormat.value,
      )
      out.push(fileFromPreparedBytes(prepared.name, prepared.type, prepared.bytes))
    } else {
      out.push(file)
    }
  }
  return out
}

function kickAudioDurationProbe(): void {
  for (const entry of queue.value) {
    if (!isOpticalAudioFile(entry.file)) continue
    if (audioDurationById.value.has(entry.id)) continue
    void probeFileAudioDurationSeconds(entry.file).then((sec) => {
      if (sec == null) return
      if (!queue.value.some((e) => e.id === entry.id)) return
      const next = new Map(audioDurationById.value)
      next.set(entry.id, sec)
      audioDurationById.value = next
      refreshSendPreview()
    })
  }
}

function kickAudioPrepare(): void {
  const format = audioFormat.value
  for (const entry of queue.value) {
    if (!isOpticalAudioFile(entry.file)) continue
    void audioPrepareQueue
      .prepare(String(entry.id), entry.file, format)
      .then((prepared) => {
        const next = new Map(preparedAudioById.value)
        next.set(entry.id, prepared)
        preparedAudioById.value = next
        refreshSendPreview()
      })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return
      })
  }
}

const multipleCollectionBatchesQueued = computed(() => {
  const files = queuedFiles.value
  return files.length > 1 && files.every((file) => isCollectionBundleFile(file))
})

const collectionSessionList = computed(() => [...collectionSessions.value.values()])

const queueBytes = computed(() => queue.value.reduce((sum, entry) => sum + entry.file.size, 0))

/** Transfer-oriented byte total (reencoded audio when applicable). */
const queueTransferBytes = computed(() =>
  estimateFiles.value.reduce((sum, file) => sum + file.size, 0),
)

const queueSummary = computed(() => {
  if (!queue.value.length) return ''
  const n = queue.value.length
  const usesReencode =
    audioFormat.value !== 'original' && queue.value.some((e) => isOpticalAudioFile(e.file))
  const size = formatBytes(usesReencode ? queueTransferBytes.value : queueBytes.value)
  const approx = usesReencode && audioSizeEstimateProvisional.value ? '~' : ''
  const sizeLabel = usesReencode ? `${approx}${size} transfer` : size
  const archive = n > 1 ? ' · will zip before transfer' : ''
  return `${n} file${n === 1 ? '' : 's'} · ${sizeLabel} selected${archive}`
})

function queueEntrySizeLabel(entry: QueuedFile): string {
  const file = entry.file
  if (!isOpticalAudioFile(file) || audioFormat.value === 'original') {
    return formatBytes(file.size)
  }
  const prepared = preparedAudioById.value.get(entry.id)
  const sendBytes = prepared
    ? prepared.bytes.byteLength
    : estimateOpticalAudioPayloadBytes({
        byteLength: file.size,
        format: audioFormat.value,
        durationSec: audioDurationById.value.get(entry.id) ?? null,
      })
  if (sendBytes === file.size) return formatBytes(file.size)
  const approx = prepared ? '' : '~'
  return `${formatBytes(file.size)} → ${approx}${formatBytes(sendBytes)}`
}

const transferStatsLine = computed(() => {
  if (!sendPreview.value) return sendPreviewBusy.value ? 'Calculating transfer size…' : ''
  const p = sendPreview.value
  const plan = plannedTransfer.value
  const approx = audioSizeEstimateProvisional.value ? '~' : ''
  if (plan) {
    const eta =
      plan.etaSeconds < 10 ? plan.etaSeconds.toFixed(1) : String(Math.round(plan.etaSeconds))
    return `Transfer size ${approx}${formatBytes(p.containerBytes)} · ~${eta}s planned (${formatOpticalPlanSummary(plan)})`
  }
  return `Transfer size ${approx}${formatBytes(p.containerBytes)} · about ${p.etaLabel}`
})

const plannedTransfer = computed((): OpticalTransferPlan | null => {
  if (!sendPreview.value) return null
  return planOpticalTransfer({
    containerBytes: sendPreview.value.containerBytes,
    preset: prefs.opticalTransferPreset,
    viewportWidth: typeof window !== 'undefined' ? window.innerWidth : undefined,
    viewportHeight: typeof window !== 'undefined' ? window.innerHeight : undefined,
    devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : undefined,
  })
})

const selectedDensityHint = computed(() => selectedPresetDef.value?.hint ?? '')

const densityTooLow = computed(() => {
  if (!sendPreview.value || !plannedTransfer.value) return false
  return !opticalPayloadFits(sendPreview.value.containerBytes, plannedTransfer.value.frameBytes)
})

const suggestedDensity = computed(() => {
  if (!sendPreview.value) return undefined
  return suggestOpticalFrameBytes(sendPreview.value.containerBytes)
})

const suggestedDensityLabel = computed(() => {
  const suggestion = suggestedDensity.value
  if (suggestion == null) return ''
  return OPTICAL_FRAME_BYTES_LABELS[suggestion as OpticalFrameBytes]?.label ?? String(suggestion)
})

const selectedReceived = computed(() =>
  received.value.filter((item) => selectedReceivedIds.value.has(item.id)),
)

const allReceivedSelected = computed(
  () => received.value.length > 0 && selectedReceived.value.length === received.value.length,
)

let sendPreviewGen = 0

function refreshSendPreview(): void {
  const gen = ++sendPreviewGen
  if (!queue.value.length) {
    sendPreview.value = null
    sendPreviewError.value = null
    sendPreviewBusy.value = false
    return
  }
  sendPreviewBusy.value = true
  sendPreviewError.value = null
  try {
    const preview = estimateOpticalTransferPreview(
      estimateFiles.value,
      prefs.opticalTransferFrameBytes,
      prefs.opticalTransferTxFps,
    )
    if (gen !== sendPreviewGen) return
    sendPreview.value = {
      payloadBytes: preview.payloadBytes,
      containerBytes: preview.containerBytes,
      etaLabel: preview.etaLabel,
      sendName: preview.sendName,
      fileCount: preview.fileCount,
    }
  } catch (e) {
    if (gen !== sendPreviewGen) return
    sendPreview.value = null
    sendPreviewError.value = e instanceof Error ? e.message : 'Could not estimate transfer.'
  } finally {
    if (gen === sendPreviewGen) sendPreviewBusy.value = false
  }
}

function onFilesPicked(event: Event): void {
  const input = event.target as HTMLInputElement
  // FileList is live — snapshot before clearing the input.
  const picked = input.files?.length ? Array.from(input.files) : []
  input.value = ''
  if (!picked.length) return
  const added = picked.map((file) => ({ id: nextQueueId++, file }))
  queue.value = [...queue.value, ...added]
  sendError.value = null
  kickAudioDurationProbe()
  kickAudioPrepare()
  refreshSendPreview()
  snackbar.show(
    added.length === 1
      ? `Added “${added[0]!.file.name}”`
      : `Added ${added.length} files to the queue`,
    { tone: 'ok', ms: 2200 },
  )
}

function removeQueued(id: number): void {
  audioPrepareQueue.cancelItem(String(id))
  const next = new Map(preparedAudioById.value)
  next.delete(id)
  preparedAudioById.value = next
  const durations = new Map(audioDurationById.value)
  durations.delete(id)
  audioDurationById.value = durations
  queue.value = queue.value.filter((entry) => entry.id !== id)
  if (!queue.value.length) stopSendStream()
  refreshSendPreview()
}

function clearQueue(): void {
  audioPrepareQueue.clear()
  preparedAudioById.value = new Map()
  audioDurationById.value = new Map()
  queue.value = []
  stopSendStream()
  refreshSendPreview()
}

function haltSendTransmission(): void {
  countdownSignal?.cancel()
  countdownSignal = null
  sendCountdown.value = null
  sendStream?.stop()
  sendStream = null
  sendProgress.value = null
}

function stopSendStream(): void {
  haltSendTransmission()
  activeSendPayload = null
  activeSendMeta.value = null
  easeScanBusy.value = false
  streaming.value = false
  sendStatus.value = ''
}

function onDisplayScale(scale: number): void {
  prefs.setOpticalTransferDisplayScale(scale)
  sendStream?.setDisplayScale(scale)
}

function openReceiveInviteOverlay(): void {
  receiveInviteOverlayOpen.value = true
}

function closeReceiveInviteOverlay(): void {
  receiveInviteOverlayOpen.value = false
}

async function startFromReceiveInviteOverlay(): Promise<void> {
  await startSendStream()
  if (streaming.value || sendBusy.value) receiveInviteOverlayOpen.value = false
}

/** Start (or restart) QR fountain for an already-packed container. */
async function beginOpticalSendTransmission(opts: {
  container: Uint8Array
  sendName: string
  frameBytes: number
  gridCodes: OpticalGridCodes
  txFps: OpticalTxFps
  /** Mid-stream density ease: skip countdown and stream immediately. */
  immediate?: boolean
}): Promise<void> {
  const canvas = canvasRef.value
  if (!canvas) throw new Error('Could not start transfer display.')

  const { container, sendName, frameBytes, gridCodes, txFps, immediate } = opts
  if (!opticalPayloadFits(container.length, frameBytes)) {
    const suggestion = suggestOpticalFrameBytes(container.length)
    throw new Error(
      suggestion
        ? `Transfer is too large for the current QR density. Try Fastest or split into smaller transfers.`
        : 'Transfer is too large for the selected QR density.',
    )
  }

  activeSendPayload = { container, sendName, frameBytes, gridCodes, txFps }
  activeSendMeta.value = {
    frameBytes,
    gridCodes,
    containerBytes: container.length,
  }
  const common = {
    txFps,
    frameBytes,
    gridCodes,
    displayScale: prefs.opticalTransferDisplayScale,
    fullscreen: true as const,
  }
  sendStream = new DecimenSendStream(canvas, { ...common, displayPx: 200 })
  let lastK = 0
  let lastQrVersion: number | undefined
  let lastTxFps: OpticalTxFps = txFps
  const rateLabel = () => formatOpticalThroughput(frameBytes, lastTxFps, gridCodes)
  const gridNote = gridCodes > 1 ? ` · ${gridCodes}-grid` : ''

  await sendStream.start(
    container,
    {
      onStatus: (s) => {
        lastK = s.k
        lastQrVersion = 'qrVersion' in s ? s.qrVersion : undefined
        lastTxFps = s.txFps as OpticalTxFps
        if (sendCountdown.value != null) return
        sendStatus.value = `Streaming · QR${gridNote} · K=${s.k} · QR v${lastQrVersion ?? '?'} · ${rateLabel()}`
      },
      onProgress: (p) => {
        sendProgress.value = p
      },
      onError: (message) => {
        sendError.value = message
        stopSendStream()
      },
    },
    { holdAfterPreview: !immediate },
  )

  if (immediate) {
    await sendStream.resumeTransmission()
    sendStatus.value =
      lastK > 0
        ? `Streaming · QR${gridNote} · K=${lastK} · QR v${lastQrVersion ?? '?'} · ${rateLabel()}`
        : `Streaming ${sendName} · ${formatBytes(container.length)}`
    return
  }

  countdownSignal = createOpticalSendCountdownSignal()
  const ready = await runOpticalSendCountdown((value) => {
    sendCountdown.value = value
    sendStatus.value =
      value === 'paused'
        ? 'Paused — tap to restart countdown'
        : gridCodes > 1
          ? 'Get phones ready… Hold steady so the whole grid is visible.'
          : 'Get phones ready…'
  }, countdownSignal)
  countdownSignal = null
  sendCountdown.value = null
  if (!ready) {
    stopSendStream()
    return
  }
  await sendStream.resumeTransmission()
  sendStatus.value =
    lastK > 0
      ? `Streaming · QR${gridNote} · K=${lastK} · QR v${lastQrVersion ?? '?'} · ${rateLabel()}`
      : `Streaming ${sendName} · ${formatBytes(container.length)}`
}

function toggleSendCountdownPause(): void {
  if (sendCountdown.value == null || !countdownSignal) return
  countdownSignal.togglePause()
}

async function easeOpticalScan(): Promise<void> {
  if (!activeSendPayload || easeScanBusy.value || sendCountdown.value != null) return
  const stage = estimateOpticalStageCss({
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
  })
  const next = nextEasierOpticalSendParams({
    frameBytes: activeSendPayload.frameBytes,
    gridCodes: activeSendPayload.gridCodes,
    containerBytes: activeSendPayload.container.length,
    stageWidthCss: stage.width,
    stageHeightCss: stage.height,
    devicePixelRatio: window.devicePixelRatio || 1,
  })
  if (!next) return

  easeScanBusy.value = true
  sendError.value = null
  const payload = activeSendPayload
  const densityLabel = OPTICAL_FRAME_BYTES_LABELS[next.frameBytes]?.label ?? String(next.frameBytes)
  sendStatus.value =
    next.gridCodes !== payload.gridCodes
      ? `Retrying with easier scan (${densityLabel} · ${next.gridCodes}-grid)…`
      : `Retrying with easier scan (${densityLabel})…`
  // Fountain identity includes blockLen — new density = new session; reset progress.
  haltSendTransmission()
  streaming.value = true
  try {
    await nextTick()
    await beginOpticalSendTransmission({
      container: payload.container,
      sendName: payload.sendName,
      frameBytes: next.frameBytes,
      gridCodes: next.gridCodes,
      txFps: payload.txFps,
      immediate: true,
    })
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Could not restart with easier QR.'
    stopSendStream()
  } finally {
    easeScanBusy.value = false
  }
}

async function startSendStream(): Promise<void> {
  if (!queue.value.length) {
    sendError.value = 'Add at least one file to the queue.'
    return
  }
  stopSendStream()
  sendBusy.value = true
  sendError.value = null
  sendStatus.value = queueHasAudio.value ? 'Preparing audio…' : 'Preparing…'
  try {
    const files = await resolveSendFiles()
    const prepared = await prepareOpticalTransfer(files)
    const plan = planOpticalTransfer({
      containerBytes: prepared.container.length,
      preset: prefs.opticalTransferPreset,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio || 1,
    })
    // Open fullscreen only once packing is done — avoids an empty white QR box.
    streaming.value = true
    await nextTick()
    if (!canvasRef.value) {
      sendError.value = 'Could not start transfer display.'
      streaming.value = false
      return
    }
    await beginOpticalSendTransmission({
      container: prepared.container,
      sendName: prepared.sendName,
      frameBytes: plan.frameBytes,
      gridCodes: plan.gridCodes,
      txFps: plan.txFps,
    })
  } catch (e) {
    sendError.value = e instanceof Error ? e.message : 'Could not start transfer.'
    stopSendStream()
  } finally {
    sendBusy.value = false
  }
}

function stopReceiveCamera(): void {
  receiveActive = false
  decimenCapture?.stop()
  decimenCapture = null
  if (cameraStream) {
    for (const track of cameraStream.getTracks()) track.stop()
    cameraStream = null
  }
  const video = videoRef.value
  if (video) video.srcObject = null
}

async function refreshCameraDevices(): Promise<void> {
  cameraDevices.value = await listVideoInputDevices()
  const preferred = cameraDeviceId.value
  if (preferred && !cameraDevices.value.some((d) => d.deviceId === preferred)) {
    // Stale id — keep for now; getUserMedia may fall back.
  }
}

async function beginLiveReceive(): Promise<void> {
  if (receiveLive.value) {
    await startReceiveCamera()
    return
  }
  receiveLive.value = true
  await nextTick()
  await startReceiveCamera()
}

function stopLiveReceive(): void {
  stopReceiveCamera()
  receiveLive.value = false
}

async function onCameraDeviceChange(deviceId: string): Promise<void> {
  cameraDeviceId.value = deviceId
  if (receiveLive.value) await startReceiveCamera()
}

async function startReceiveCamera(): Promise<void> {
  stopReceiveCamera()
  receiveError.value = null
  receiveStatus.value = 'Starting camera…'
  receiveActive = true
  const preferred = cameraDeviceId.value.trim()
  try {
    try {
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: opticalVideoConstraints(preferred || null),
      })
    } catch (firstErr) {
      if (!preferred) throw firstErr
      // Preferred device unavailable — fall back to default rear camera.
      cameraStream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: opticalVideoConstraints(null),
      })
    }
  } catch {
    receiveError.value = 'Camera unavailable. Allow camera access to receive files.'
    receiveStatus.value = ''
    receiveLive.value = false
    return
  }
  await refreshCameraDevices()
  const track = cameraStream.getVideoTracks()[0]
  const activeId = track?.getSettings?.().deviceId
  if (activeId && !cameraDeviceId.value) {
    cameraDeviceId.value = activeId
  }
  await nextTick()
  const video = videoRef.value
  if (!video || !receiveActive) {
    stopReceiveCamera()
    receiveLive.value = false
    return
  }
  try {
    video.srcObject = cameraStream
    await video.play()
  } catch {
    receiveError.value = 'Could not start the camera preview.'
    stopReceiveCamera()
    receiveLive.value = false
    return
  }
  receiveStatus.value = 'Point at an animated transfer QR code'
  decimenCapture = new DecimenReceiveCapture({
    onProgress: (p) => {
      receiveStatus.value = p.label
    },
    onComplete: (file) => {
      void onReceivedFile(file)
    },
    onError: (message) => {
      receiveError.value = message
    },
  })
  decimenCapture.attachVideo(video)
  decimenCapture.start()
}

async function onReceivedFile(file: OpticalFile): Promise<void> {
  let singtagsTagId: number | null = null
  let collectionBatch: CollectionBatchManifest | null = null
  let localDocTitle: string | null = null
  let packageOpenNow = false
  if (isSingtagsCollectionFile(file)) {
    try {
      const batch = unpackSingtagsCollectionFile(file)
      collectionBatch = batch.manifest
    } catch {
      collectionBatch = null
    }
  } else if (isLocalDocTransferFile(file)) {
    try {
      if (isLocalEntryTransferFile(file)) {
        const pkg = unpackLocalEntryFile(file)
        localDocTitle = pkg.meta.title || 'Local song'
        packageOpenNow = !!pkg.meta.openNow
      } else {
        const pkg = unpackLocalDocFile(file)
        localDocTitle = pkg.meta.title || pkg.meta.filename
        packageOpenNow = !!pkg.meta.openNow
      }
    } catch {
      localDocTitle = null
    }
  } else if (isSingtagsSheetFile(file)) {
    try {
      const pkg = unpackSingtagsSheetFile(file)
      singtagsTagId = pkg.meta.id
    } catch {
      singtagsTagId = null
    }
  }
  const id = `${Date.now()}-${received.value.length}`
  const item: ReceivedItem = {
    id,
    file,
    singtagsTagId,
    collectionBatch,
    localDocTitle,
    collectionImported: false,
    localDocImported: false,
    saved: false,
  }
  received.value = [item, ...received.value]
  if (collectionBatch) {
    const sessions = new Map(collectionSessions.value)
    upsertCollectionSession(sessions, collectionBatch, id)
    collectionSessions.value = sessions
  }
  selectedReceivedIds.value = new Set([id, ...selectedReceivedIds.value])
  const batchNote = collectionBatch
    ? ` · batch ${collectionBatch.batchIndex + 1}/${collectionBatch.batchCount}`
    : ''
  receiveStatus.value = `Received ${file.name}${batchNote} · ${formatBytes(file.bytes.length)}`

  // Drop out of fullscreen receive so the received-files list is visible.
  stopLiveReceive()

  if (saveAfterTransfer.value) {
    await saveReceivedItems([item], 'save file')
  }

  const wantOpen =
    (openAfterTransfer.value || packageOpenNow) && canOpenOpticalAfterTransfer(file)

  if (localDocTitle != null) {
    await importLocalDoc(item, { openNow: wantOpen || packageOpenNow })
    return
  }

  if (wantOpen && singtagsTagId != null) {
    await importSingtagsSheet(item, { openNow: true })
    return
  }

  if (wantOpen && opticalPreviewKind(file)) {
    previewFile.value = file
    return
  }

  const importHint =
    singtagsTagId != null
      ? ' — import when ready, then open the tag'
      : opticalPreviewKind(file)
        ? ' — open or save when ready'
        : ' — save or import when ready'
  snackbar.show(`Received “${file.name}”${importHint}`, { tone: 'ok' })
}

function receivedItemCanOpen(item: ReceivedItem): boolean {
  return canOpenOpticalAfterTransfer(item.file)
}

async function openReceivedItem(item: ReceivedItem): Promise<void> {
  if (opticalPreviewKind(item.file)) {
    previewFile.value = item.file
    return
  }
  if (item.singtagsTagId != null) {
    await importSingtagsSheet(item, { openNow: true })
    return
  }
  if (item.localDocTitle != null) {
    await importLocalDoc(item, { openNow: true })
  }
}

function closeReceivedPreview(): void {
  previewFile.value = null
}

function toggleReceivedSelected(id: string): void {
  const next = new Set(selectedReceivedIds.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selectedReceivedIds.value = next
}

function toggleAllReceivedSelected(): void {
  if (allReceivedSelected.value) {
    selectedReceivedIds.value = new Set()
    return
  }
  selectedReceivedIds.value = new Set(received.value.map((item) => item.id))
}

function removeReceived(id: string): void {
  received.value = received.value.filter((item) => item.id !== id)
  const next = new Set(selectedReceivedIds.value)
  next.delete(id)
  selectedReceivedIds.value = next
}

function markReceivedSaved(ids: Iterable<string>): void {
  const saved = new Set(ids)
  received.value = received.value.map((item) =>
    saved.has(item.id) ? { ...item, saved: true } : item,
  )
}

async function saveReceivedItems(items: ReceivedItem[], label: string): Promise<void> {
  if (!items.length || saveBusy.value) return
  saveBusy.value = true
  try {
    const mode = await saveOpticalFiles(items.map((item) => item.file))
    markReceivedSaved(items.map((item) => item.id))
    snackbar.show(
      mode === 'directory'
        ? `Saved ${items.length} file${items.length === 1 ? '' : 's'} to folder`
        : `Downloaded ${items.length} file${items.length === 1 ? '' : 's'}`,
      { tone: 'ok' },
    )
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') return
    snackbar.show(e instanceof Error ? e.message : `Could not ${label}.`, { tone: 'error' })
  } finally {
    saveBusy.value = false
  }
}

async function saveAllReceived(): Promise<void> {
  await saveReceivedItems(received.value, 'save files')
}

async function saveSelectedReceived(): Promise<void> {
  await saveReceivedItems(selectedReceived.value, 'save selected files')
}

async function saveOneReceived(item: ReceivedItem): Promise<void> {
  await saveReceivedItems([item], 'save file')
}

function openImportedTag(tagId: number): void {
  void router.push(tagOpenLocation(tagId, { fullscreen: prefs.singMode }))
}

function importedTagOpenLabel(): string {
  return prefs.singMode ? 'Open fullscreen' : 'Open tag'
}

async function importSingtagsSheet(
  item: ReceivedItem,
  opts?: { openNow?: boolean },
): Promise<void> {
  if (item.singtagsTagId == null) return
  try {
    const pkg = unpackSingtagsSheetFile(item.file)
    await putTransferredTag(pkg.meta, pkg.imageBytes)
    const title = pkg.meta.title || `Tag ${pkg.meta.id}`
    if (opts?.openNow) {
      openImportedTag(pkg.meta.id)
      return
    }
    snackbar.show(`Imported “${title}”`, {
      tone: 'ok',
      ms: 8000,
      action: {
        label: importedTagOpenLabel(),
        onClick: () => openImportedTag(pkg.meta.id),
      },
    })
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not import sheet.', { tone: 'error' })
  }
}

async function importLocalDoc(
  item: ReceivedItem,
  opts?: { openNow?: boolean },
): Promise<void> {
  if (item.localDocTitle == null || item.localDocImported) return
  try {
    const result = await ingestLocalTransferFile(router, item.file, { openNow: opts?.openNow })
    if (result.status !== 'dismissed') {
      item.localDocImported = true
      received.value = [...received.value]
    }
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not import local document.', {
      tone: 'error',
    })
  }
}

function findCollectionSession(item: ReceivedItem): CollectionReceiveSession | null {
  if (!item.collectionBatch) return null
  for (const session of collectionSessions.value.values()) {
    const batch = session.batches.get(item.collectionBatch.batchIndex)
    if (batch?.itemId === item.id) return session
  }
  return null
}

async function importCollectionBatch(item: ReceivedItem): Promise<void> {
  if (!item.collectionBatch || collectionImportBusy.value) return
  collectionImportBusy.value = true
  try {
    const batch = unpackSingtagsCollectionFile(item.file)
    const result = await importCollectionBatchTags(batch)
    const session = findCollectionSession(item)
    if (session) {
      markCollectionBatchImported(session, batch.manifest.batchIndex, result.imported)
      collectionSessions.value = new Map(collectionSessions.value)
    }
    item.collectionImported = true
    received.value = [...received.value]
    const progress = session ? collectionReceiveProgress(session) : null
    const failedNote =
      result.failed.length > 0 ? ` · ${result.failed.length} failed` : ''
    snackbar.show(
      progress
        ? `Imported ${result.imported.length} tag${result.imported.length === 1 ? '' : 's'} (${progress.tagsImported}/${progress.tagsTotal} total)${failedNote}`
        : `Imported ${result.imported.length} tag${result.imported.length === 1 ? '' : 's'}${failedNote}`,
      { tone: result.failed.length ? 'error' : 'ok', ms: 3200 },
    )
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not import collection batch.', {
      tone: 'error',
    })
  } finally {
    collectionImportBusy.value = false
  }
}

function tagSummariesForImportedIds(session: CollectionReceiveSession, tagIds: number[]): TagSummary[] {
  const metaById = new Map<number, ReturnType<typeof tagSummaryFromSheetTransferMeta>>()
  for (const item of received.value) {
    if (!item.collectionBatch) continue
    const batch = session.batches.get(item.collectionBatch.batchIndex)
    if (!batch || batch.itemId !== item.id) continue
    try {
      const unpacked = unpackSingtagsCollectionFile(item.file)
      for (const tag of unpacked.tags) {
        metaById.set(tag.meta.id, tagSummaryFromSheetTransferMeta(tag.meta))
      }
    } catch {
      /* ignore malformed batches */
    }
  }
  return tagIds.map((id) => metaById.get(id) ?? catalog.getById(id) ?? tagSummaryFromSheetTransferMeta({
    v: 1,
    id,
    title: `Tag ${id}`,
    arranger: null,
    key: null,
    mime: 'image/jpeg',
    width: 0,
    height: 0,
  }))
}

async function addCollectionToLibrary(session: CollectionReceiveSession): Promise<void> {
  if (collectionImportBusy.value) return
  const tagIds = importedTagIdsForSession(session)
  if (!tagIds.length) {
    snackbar.show('Import at least one batch before adding the collection.', { tone: 'error' })
    return
  }
  collectionImportBusy.value = true
  try {
    const result = applyReceivedCollectionToLibrary(userCollections, session.collectionName, tagIds)
    await favorites.ensureLoaded()
    void favorites.starMany(tagSummariesForImportedIds(session, tagIds), { metadataOnly: true })
    const viewCollection = () => {
      void router.push({ path: '/favorites', query: { collection: result.collectionId } })
    }
    if (offline.value) {
      snackbar.show(
        `Created collection “${result.collectionName}” with ${tagIds.length} tags. Sheets saved — connect later to download tracks.`,
        {
          tone: 'ok',
          ms: 10_000,
          action: { label: 'View collection', onClick: viewCollection },
        },
      )
    } else {
      snackbar.show(`Created collection “${result.collectionName}” with ${tagIds.length} tags`, {
        tone: 'ok',
        ms: 10_000,
        action: { label: 'View collection', onClick: viewCollection },
        secondaryAction: {
          label: 'Cache audio',
          onClick: () => {
            void favorites.ensureAudioForStarred(tagIds)
          },
        },
      })
    }
  } catch (e) {
    snackbar.show(e instanceof Error ? e.message : 'Could not save collection.', { tone: 'error' })
  } finally {
    collectionImportBusy.value = false
  }
}

async function loadLocalDocsFromQuery(): Promise<boolean> {
  const raw = route.query.localDocs
  if (typeof raw !== 'string' || !raw.trim()) return false

  const ids = [...new Set(raw.split(',').map((s) => s.trim()).filter(Boolean))]
  if (!ids.length) return false

  const openNow = route.query.openNow === '1' || route.query.openNow === 'true'
  const assetPicks = decodeLocalTransferAssetQuery(
    typeof route.query.localAssets === 'string' ? route.query.localAssets : '',
  )
  tagTransferContext.value = null
  useHighRes.value = false
  highResAvailable.value = false
  collectionPrepareBusy.value = true
  collectionPrepareError.value = null
  collectionPrepareStatus.value = 'Preparing local songs…'
  tab.value = 'send'

  try {
    await localLibrary.ensureLoaded()
    const queued: QueuedFile[] = []
    let missing = 0
    for (const id of ids) {
      const entry =
        localLibrary.entries.find((d) => d.id === id) ?? (await localLibrary.getLocalEntry(id))
      if (!entry) {
        missing += 1
        continue
      }
      const allAssets = await localLibrary.reloadAssets(id)
      const pickIds = assetPicks[id]
      const assets = pickIds
        ? allAssets.filter((a) => pickIds.includes(a.id))
        : defaultOpticalTransferAssets(allAssets)
      const blobs = new Map<string, Uint8Array>()
      for (const asset of assets) {
        const blobRec = await localLibrary.getLocalAssetBlob(asset.id)
        if (!blobRec) continue
        blobs.set(asset.id, new Uint8Array(blobRec.data))
      }
      // Metadata-only is allowed when the user unchecked everything or there is no sheet.
      const packed = await packLocalEntryFile(entry, assets, blobs, { openNow })
      queued.push({
        id: nextQueueId++,
        file: new File(
          [packed.container.buffer.slice(packed.container.byteOffset, packed.container.byteOffset + packed.container.byteLength) as ArrayBuffer],
          packed.filename,
          { type: LOCAL_ENTRY_TRANSFER_MIME },
        ),
        batchLabel:
          assets.length === allAssets.length
            ? entry.title
            : `${entry.title} · ${assets.length}/${allAssets.length} files`,
      })
    }
    queue.value = queued
    refreshSendPreview()
    if (!queued.length) {
      collectionPrepareError.value = 'No My Library songs found for this transfer.'
      return true
    }
    const missNote = missing ? ` · ${missing} missing` : ''
    snackbar.show(
      `Queued ${queued.length} local song${queued.length === 1 ? '' : 's'}${missNote}`,
      { tone: missing ? 'error' : 'ok', ms: 3600 },
    )
    if (missing) {
      collectionPrepareError.value = `${missing} song${missing === 1 ? '' : 's'} could not be loaded.`
    }
  } catch (e) {
    collectionPrepareError.value =
      e instanceof Error ? e.message : 'Could not prepare local song transfer.'
  } finally {
    collectionPrepareBusy.value = false
    collectionPrepareStatus.value = ''
  }
  return true
}

async function loadCollectionFromQuery(): Promise<void> {
  if (await loadLocalDocsFromQuery()) return

  tagTransferContext.value = null
  useHighRes.value = false
  highResAvailable.value = false

  const collectionId = route.query.collection
  if (typeof collectionId === 'string' && collectionId) {
    await prepareCollectionFromId(collectionId)
    return
  }

  const tagsRaw = route.query.tags
  const nameRaw = route.query.name
  if (typeof tagsRaw === 'string' && tagsRaw) {
    const tagIds = parseTagIdList(tagsRaw)
    if (!tagIds.length) {
      collectionPrepareError.value = 'No valid tag ids in transfer link.'
      return
    }
    const collectionName =
      typeof nameRaw === 'string' && nameRaw.trim() ? nameRaw.trim() : 'Favorites'
    await prepareCollectionFromTags(collectionName, tagIds)
  }
}

async function prepareCollectionFromId(id: string): Promise<void> {
  const col = userCollections.byId(id)
  if (!col) {
    collectionPrepareError.value = 'Collection not found.'
    return
  }
  if (!col.tagIds.length) {
    collectionPrepareError.value = 'This collection has no tags to transfer.'
    return
  }
  await prepareAndQueueCollection(col.name, col.tagIds)
}

async function prepareCollectionFromTags(collectionName: string, tagIds: number[]): Promise<void> {
  await prepareAndQueueCollection(collectionName, tagIds)
}

async function prepareAndQueueCollection(collectionName: string, tagIds: number[]): Promise<void> {
  collectionPrepareBusy.value = true
  collectionPrepareError.value = null
  collectionPrepareStatus.value = 'Preparing collection…'
  tab.value = 'send'
  tagTransferContext.value = { collectionName, tagIds }
  try {
    const summaries = new Map(
      catalog.tags.filter((t) => tagIds.includes(t.id)).map((t) => [t.id, t]),
    )
    highResAvailable.value = await anyHighResTransferAvailable(tagIds, summaries)
    if (!highResAvailable.value) useHighRes.value = false
    const result = await prepareCollectionTransfer({
      collectionName,
      tagIds,
      summaries,
      quality: useHighRes.value && highResAvailable.value ? 'high' : 'standard',
      onProgress: (message) => {
        collectionPrepareStatus.value = message
      },
    })
    queue.value = result.batches.map((batch) => ({
      id: nextQueueId++,
      file: batch.file,
      batchLabel: `${batch.manifest.collectionName} · batch ${batch.manifest.batchIndex + 1}/${batch.manifest.batchCount} · ${batch.tagCount} tags`,
    }))
    refreshSendPreview()
    const skippedNote =
      result.skipped.length > 0
        ? ` · ${result.skipped.length} tag${result.skipped.length === 1 ? '' : 's'} skipped (offline)`
        : ''
    snackbar.show(
      `Queued ${result.batches.length} batch${result.batches.length === 1 ? '' : 'es'} for “${collectionName}”${skippedNote}`,
      { tone: result.skipped.length ? 'error' : 'ok', ms: 3600 },
    )
    if (result.skipped.length) {
      collectionPrepareError.value = `${result.skipped.length} tag${result.skipped.length === 1 ? '' : 's'} could not be loaded offline and were omitted.`
    }
  } catch (e) {
    collectionPrepareError.value =
      e instanceof Error ? e.message : 'Could not prepare collection transfer.'
  } finally {
    collectionPrepareBusy.value = false
    collectionPrepareStatus.value = ''
  }
}

watch(tab, (next) => {
  if (next !== 'receive') {
    stopLiveReceive()
  }
})

watch(
  () => queue.value.map((entry) => `${entry.id}:${entry.file.name}:${entry.file.size}`).join('|'),
  () => {
    kickAudioDurationProbe()
    kickAudioPrepare()
    refreshSendPreview()
  },
)

watch(audioFormat, () => {
  preparedAudioById.value = new Map()
  kickAudioPrepare()
  refreshSendPreview()
})

watch(
  () => prefs.opticalTransferPreset,
  () => {
    refreshSendPreview()
  },
)

watch(
  () =>
    [
      route.query.collection,
      route.query.tags,
      route.query.name,
      route.query.localDocs,
      route.query.localAssets,
      route.query.openNow,
    ] as const,
  () => {
    void loadCollectionFromQuery()
  },
)

watch(useHighRes, () => {
  const ctx = tagTransferContext.value
  if (!ctx || collectionPrepareBusy.value || streaming.value || sendBusy.value) return
  void prepareAndQueueCollection(ctx.collectionName, ctx.tagIds)
})

onMounted(() => {
  if (offline.value && tabFromRoute(route) !== 'receive') {
    tab.value = 'receive'
  }
  void loadCollectionFromQuery()
  if (isOpticalReceiveRoute(route)) {
    void beginLiveReceive()
  }
})

watch(
  () => [route.name, route.path, route.query.mode] as const,
  () => {
    const next = tabFromRoute(route)
    tab.value = next
    if (next === 'receive' && isOpticalReceiveRoute(route) && !receiveLive.value) {
      void beginLiveReceive()
    }
  },
)

onUnmounted(() => {
  stopSendStream()
  stopLiveReceive()
})
</script>

<template>
  <section class="optical" aria-label="Optical transfer">
    <header class="page-head">
      <h1 class="page-title">Optical transfer</h1>
      <p class="intro">
        Send or receive files and My Library songs with animated QR codes — works fully offline.
        On a fresh device, use <strong>Receive</strong> to scan from another phone. Collections
        split into independent batches so partial receive stays safe. Limit
        {{ MAX_FILE_LABEL }} per transfer.
      </p>
    </header>

    <div class="tabs" role="tablist" aria-label="Transfer mode">
      <button
        type="button"
        class="tab"
        role="tab"
        :aria-selected="tab === 'send'"
        :class="{ active: tab === 'send' }"
        @click="tab = 'send'"
      >
        Send
      </button>
      <button
        type="button"
        class="tab"
        role="tab"
        :aria-selected="tab === 'receive'"
        :class="{ active: tab === 'receive' }"
        @click="tab = 'receive'"
      >
        Receive
      </button>
    </div>

    <div v-show="tab === 'send'" class="panel" role="tabpanel" aria-label="Send files">
      <div class="queue-card">
        <div class="queue-head">
          <h2 class="section-title">Transfer queue</h2>
          <p v-if="queueSummary" class="queue-summary">{{ queueSummary }}</p>
          <p v-if="transferStatsLine" class="queue-summary transfer-stats">{{ transferStatsLine }}</p>
          <p v-if="sendPreviewError" class="err" role="alert">{{ sendPreviewError }}</p>
          <p v-if="collectionPrepareBusy" class="status">{{ collectionPrepareStatus }}</p>
          <p v-if="collectionPrepareError" class="err" role="alert">{{ collectionPrepareError }}</p>
          <p v-if="multipleCollectionBatchesQueued" class="hint">
            Multiple collection batches queued — stream the first batch, remove it, then stream the
            next. Each batch is verified independently on receive.
          </p>
          <p v-if="densityTooLow" class="err" role="alert">
            {{
              suggestedDensity
                ? `Too large for current density — try ${suggestedDensityLabel}.`
                : 'Too large for the selected density.'
            }}
          </p>
          <OpticalTransferQualityToggle
            v-if="showSendQualityToggle"
            v-model="useHighRes"
            :available="highResAvailable"
            :disabled="collectionPrepareBusy || sendBusy || streaming"
          />
          <label v-if="queueHasAudio" class="audio-format-field">
            <span class="audio-format-label">Audio format</span>
            <select
              v-model="audioFormat"
              class="audio-format-select"
              :disabled="sendBusy || streaming"
              aria-label="Audio format for transfer"
            >
              <option
                v-for="option in OPTICAL_AUDIO_FORMAT_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>

        <ul v-if="queue.length" class="queue-list">
          <li v-for="entry in queue" :key="entry.id">
            <div class="queue-meta">
              <span class="file-name">{{ entry.batchLabel ?? entry.file.name }}</span>
              <span class="file-size">{{ queueEntrySizeLabel(entry) }}</span>
            </div>
            <button
              type="button"
              class="btn btn-ghost remove"
              :disabled="sendBusy || streaming"
              @click="removeQueued(entry.id)"
            >
              Remove
            </button>
          </li>
        </ul>

        <EmptyState
          v-else
          title="No files queued yet"
          message="Add one or more files, then start the QR stream when you're ready."
        />

        <div class="queue-actions">
          <label
            class="btn file-add"
            :class="{ disabled: sendBusy || streaming }"
            :aria-disabled="sendBusy || streaming"
          >
            Add files…
            <input
              class="visually-hidden"
              type="file"
              multiple
              :disabled="sendBusy || streaming"
              @change="onFilesPicked"
            />
          </label>
          <button
            v-if="queue.length"
            type="button"
            class="btn btn-ghost"
            :disabled="sendBusy || streaming"
            @click="clearQueue"
          >
            Clear queue
          </button>
          <label v-if="!streaming" class="scan-mode-field">
            <span class="scan-mode-label">Scan mode</span>
            <select
              class="scan-mode-select"
              :value="prefs.opticalTransferPreset"
              :disabled="sendBusy"
              aria-label="Transfer scan mode"
              @change="onTransferPresetChange(($event.target as HTMLSelectElement).value)"
            >
              <option
                v-for="option in OPTICAL_TRANSFER_PRESET_OPTIONS"
                :key="option.id"
                :value="option.id"
              >
                {{ option.label }}
              </option>
            </select>
          </label>
        </div>
        <p
          v-if="!streaming && prefs.opticalTransferPreset === 'auto' && autoResolvedPresetLabel"
          class="scan-mode-hint scan-mode-auto"
          role="status"
        >
          Auto chose <strong>{{ autoResolvedPresetLabel }}</strong> for this queue.
          {{ autoResolvedDowngradeHint }}
        </p>
        <p v-else-if="!streaming && selectedDensityHint" class="scan-mode-hint">{{ selectedDensityHint }}</p>
        <p v-if="!streaming && plannedTransfer" class="scan-mode-hint">
          Planned: {{ formatOpticalPlanSummary(plannedTransfer)
          }}{{
            plannedTransfer.exceedsTarget
              ? ' (longer than this mode’s ~3–4s target — already at this mode’s max rate)'
              : ''
          }}
        </p>
      </div>

      <OpticalReceiveInvite />

      <div class="send-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="sendStreamStartDisabled"
          @click="startSendStream"
        >
          {{ sendStreamStartLabel }}
        </button>
        <button
          type="button"
          class="btn"
          :disabled="sendBusy || streaming || sendCountdown != null"
          @click="openReceiveInviteOverlay"
        >
          Receive link QR
        </button>
      </div>

      <p v-if="sendBusy && !streaming" class="status" role="status">Preparing transfer…</p>
      <p v-else-if="sendError && !streaming" class="err" role="alert">{{ sendError }}</p>

      <OpticalReceiveInviteOverlay
        :open="receiveInviteOverlayOpen"
        :url="receiveInviteHref"
        :start-disabled="sendStreamStartDisabled"
        :start-label="sendStreamStartLabel"
        @close="closeReceiveInviteOverlay"
        @start="startFromReceiveInviteOverlay"
      />

      <OpticalTransferStreamOverlay
        :open="streaming"
        :status="sendError || sendStatus"
        :progress="sendProgress"
        :countdown="sendCountdown"
        :display-scale="prefs.opticalTransferDisplayScale"
        :can-ease-scan="canEaseScan"
        :ease-scan-busy="easeScanBusy"
        @update:display-scale="onDisplayScale"
        @ease-scan="easeOpticalScan"
        @toggle-countdown-pause="toggleSendCountdownPause"
        @stop="stopSendStream"
      >
        <canvas ref="canvasRef" class="qr-canvas" aria-label="Animated file transfer QR code" />
      </OpticalTransferStreamOverlay>
    </div>

    <div v-show="tab === 'receive'" class="panel receive-panel" role="tabpanel" aria-label="Receive files">
      <div class="receive-intro-card">
        <h2 class="section-title">Receive to this device</h2>
        <p class="hint">
          Point the camera at another phone’s transfer QR stream. My Library songs and files
          import here — SingTags collection sheets can land in Favorites. No network or prior cache
          required.
        </p>
      </div>

      <div class="send-actions">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="receiveLive"
          @click="beginLiveReceive"
        >
          Start receiving
        </button>
      </div>
      <p class="hint receive-idle-hint">
        Open-after and save/download options appear while the camera is open. Received files stay
        listed here until you remove them.
      </p>

      <p v-if="!receiveLive && receiveError" class="err" role="alert">{{ receiveError }}</p>
      <p v-else-if="!receiveLive && receiveStatus" class="status" role="status">{{ receiveStatus }}</p>

      <OpticalReceiveStreamOverlay
        :open="receiveLive"
        :status="receiveStatus"
        :error="receiveError"
        :save-after="saveAfterTransfer"
        :open-after="openAfterTransfer"
        :save-after-label="saveAfterLabel"
        :camera-fit="cameraFit"
        :cameras="cameraDevices"
        :device-id="cameraDeviceId"
        @stop="stopLiveReceive"
        @update:save-after="saveAfterTransfer = $event"
        @update:open-after="openAfterTransfer = $event"
        @update:camera-fit="cameraFit = $event"
        @update:device-id="onCameraDeviceChange"
      >
        <video
          ref="videoRef"
          class="camera-video"
          :class="cameraFit === 'height' ? 'fit-height' : 'fit-all'"
          playsinline
          muted
          autoplay
        />
      </OpticalReceiveStreamOverlay>

      <div v-if="received.length" class="received">
        <div class="received-head">
          <h2 class="section-title">Received files</h2>
          <p class="queue-summary">
            {{ received.length }} file{{ received.length === 1 ? '' : 's' }} ·
            {{ formatBytes(received.reduce((sum, item) => sum + item.file.bytes.length, 0)) }} total
          </p>
        </div>

        <div class="received-toolbar">
          <label class="select-all">
            <input
              type="checkbox"
              :checked="allReceivedSelected"
              @change="toggleAllReceivedSelected"
            />
            <span>Select all</span>
          </label>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="saveBusy || !received.length"
            @click="saveAllReceived"
          >
            {{ saveAllLabel }}
          </button>
          <button
            type="button"
            class="btn"
            :disabled="saveBusy || !selectedReceived.length"
            @click="saveSelectedReceived"
          >
            {{ saveSelectedLabel }}
          </button>
        </div>

        <div v-if="collectionSessionList.length" class="collection-progress-card">
          <h3 class="section-title">Collection transfers</h3>
          <ul class="collection-progress-list">
            <li v-for="session in collectionSessionList" :key="session.key">
              <div class="collection-progress-main">
                <span class="file-name">{{ session.collectionName }}</span>
                <span class="file-size">
                  {{ collectionReceiveProgress(session).batchesReceived }}/{{
                    session.batchCount
                  }}
                  batches ·
                  {{ collectionReceiveProgress(session).tagsImported }}/{{
                    collectionReceiveProgress(session).tagsTotal
                  }}
                  tags imported
                </span>
              </div>
              <button
                type="button"
                class="btn btn-ghost"
                :disabled="collectionImportBusy || !importedTagIdsForSession(session).length"
                @click="addCollectionToLibrary(session)"
              >
                Add to collections…
              </button>
            </li>
          </ul>
        </div>

        <ul class="queue-list received-list">
          <li v-for="item in received" :key="item.id">
            <label class="received-select">
              <input
                type="checkbox"
                :checked="selectedReceivedIds.has(item.id)"
                @change="toggleReceivedSelected(item.id)"
              />
            </label>
            <div class="queue-meta">
              <span class="file-name">{{ item.file.name }}</span>
              <span class="file-size">{{ formatBytes(item.file.bytes.length) }}</span>
              <span v-if="item.collectionBatch" class="collection-badge">
                Collection batch {{ item.collectionBatch.batchIndex + 1 }}/{{
                  item.collectionBatch.batchCount
                }}
                · {{ item.collectionBatch.tagIds.length }} tags
              </span>
              <span v-if="item.localDocTitle" class="collection-badge">
                My Library · {{ item.localDocTitle }}
              </span>
              <span v-if="item.saved" class="saved-badge">Saved</span>
              <span v-if="item.collectionImported || item.localDocImported" class="saved-badge">Imported</span>
            </div>
            <div class="row-actions">
              <button
                v-if="receivedItemCanOpen(item)"
                type="button"
                class="btn btn-ghost"
                @click="openReceivedItem(item)"
              >
                Open
              </button>
              <button type="button" class="btn btn-ghost" :disabled="saveBusy" @click="saveOneReceived(item)">
                {{ saveOneLabel }}
              </button>
              <button
                v-if="item.collectionBatch"
                type="button"
                class="btn btn-ghost"
                :disabled="collectionImportBusy || item.collectionImported"
                @click="importCollectionBatch(item)"
              >
                Import tags
              </button>
              <button
                v-else-if="item.localDocTitle != null"
                type="button"
                class="btn btn-ghost"
                :disabled="item.localDocImported"
                @click="importLocalDoc(item)"
              >
                Import to My Library
              </button>
              <button
                v-else-if="item.singtagsTagId != null"
                type="button"
                class="btn btn-ghost"
                @click="importSingtagsSheet(item)"
              >
                Import to library
              </button>
              <button type="button" class="btn btn-ghost remove" @click="removeReceived(item.id)">
                Remove
              </button>
            </div>
          </li>
        </ul>
      </div>
    </div>

    <OpticalReceivedPreview
      v-if="previewFile"
      :file="previewFile"
      @close="closeReceivedPreview"
    />
  </section>
</template>

<style scoped>
.optical {
  display: grid;
  gap: 1rem;
  width: 100%;
}
.page-head {
  display: grid;
  gap: 0.35rem;
}
.page-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.intro,
.hint,
.status,
.err,
.queue-summary {
  margin: 0;
  font-size: 0.92rem;
  line-height: 1.45;
}
.intro,
.hint,
.status,
.queue-summary {
  color: var(--muted);
}
.err {
  color: var(--danger, #b00020);
}
.section-title {
  margin: 0;
  font-size: 1rem;
  font-weight: 700;
}
.tabs {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}
.tab {
  min-height: 44px;
  border-radius: var(--radius, 10px);
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.tab.active {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
  color: var(--accent-hover);
}
.panel {
  display: grid;
  gap: 0.85rem;
}
.receive-panel {
  min-height: 0;
  gap: 0.75rem;
}
.receive-intro-card {
  display: grid;
  gap: 0.35rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.receive-intro-card .section-title {
  margin: 0;
  font-size: 1rem;
}
.receive-idle-hint {
  margin: 0;
}
.queue-card {
  display: grid;
  gap: 0.75rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
}
.queue-head {
  display: grid;
  gap: 0.2rem;
}
.audio-format-field {
  display: grid;
  gap: 0.25rem;
  margin-top: 0.35rem;
  max-width: 18rem;
}
.audio-format-label {
  font-size: 0.85rem;
  font-weight: 650;
  color: var(--muted);
}
.audio-format-select {
  min-height: 44px;
  padding: 0.4rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  color: inherit;
}
.queue-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.queue-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.65rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: color-mix(in srgb, var(--bg, #f7f5f1) 35%, var(--surface));
}
.received-list li {
  align-items: flex-start;
}
.transfer-stats {
  font-weight: 600;
  color: var(--text);
}
.queue-meta {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}
.file-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.92rem;
  font-weight: 600;
}
.file-size {
  font-size: 0.8rem;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.saved-badge {
  font-size: 0.75rem;
  font-weight: 650;
  color: var(--accent);
}
.collection-badge {
  font-size: 0.78rem;
  color: var(--muted);
}
.collection-progress-card {
  display: grid;
  gap: 0.55rem;
  padding: 0.75rem 0.85rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: color-mix(in srgb, var(--accent) 6%, var(--surface));
}
.collection-progress-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.collection-progress-list li {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
  justify-content: space-between;
}
.collection-progress-main {
  display: grid;
  gap: 0.12rem;
  min-width: 0;
}
.remove {
  flex-shrink: 0;
  min-height: 36px;
  padding: 0.3rem 0.65rem;
  font-size: 0.85rem;
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 40%, var(--border));
}
.queue-actions,
.send-actions,
.row-actions,
.received-toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  align-items: center;
}
.received-head {
  display: grid;
  gap: 0.15rem;
}
.received-toolbar {
  justify-content: space-between;
}
.receive-intents {
  display: grid;
  gap: 0.45rem;
  padding: 0.65rem 0.75rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--text) 3%, var(--surface));
}
.receive-intent {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.92rem;
  font-weight: 600;
  cursor: pointer;
}
.receive-intent input {
  width: 1.1rem;
  height: 1.1rem;
}
.receive-intent-hint {
  font-size: 0.8rem;
  font-weight: 400;
}
.select-all {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.received-select {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding-top: 0.15rem;
}
.received-select input {
  width: 1rem;
  height: 1rem;
}
.file-add.disabled {
  opacity: 0.5;
  cursor: not-allowed;
  pointer-events: none;
}
.scan-mode-field {
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  margin-left: auto;
  min-width: 0;
}
.scan-mode-label {
  font-size: 0.88rem;
  font-weight: 650;
  color: var(--text);
  white-space: nowrap;
}
.scan-mode-select {
  font: inherit;
  min-height: 44px;
  padding: 0.45rem 0.65rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  max-width: 11rem;
}
.scan-mode-select:disabled {
  opacity: 0.55;
}
.scan-mode-hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.4;
}
.scan-mode-auto {
  color: var(--text);
}
.scan-mode-auto strong {
  font-weight: 700;
}
@media (max-width: 520px) {
  .scan-mode-field {
    margin-left: 0;
    width: 100%;
  }
  .scan-mode-select {
    flex: 1 1 auto;
    max-width: none;
  }
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.camera-video {
  display: block;
  background: #000;
}
.camera-video.fit-height {
  position: absolute;
  top: 0;
  left: 50%;
  height: 100%;
  width: auto;
  max-width: none;
  transform: translateX(-50%);
}
.camera-video.fit-all {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  object-position: center center;
}
.received {
  display: grid;
  gap: 0.55rem;
}
@media (min-width: 720px) {
  .optical {
    gap: 1.15rem;
  }
}
</style>
