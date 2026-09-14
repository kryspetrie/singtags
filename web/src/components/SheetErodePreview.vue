<script setup lang="ts">
/**
 * Live Smile (classic #13 / tag 1) preview for sheet erode settings.
 */
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { mediaUrl } from '../lib/mediaUrl'
import {
  SHEET_ERODE_PREVIEW_PATH,
  processSheetImageUrl,
  sheetErodeFilterParams,
  type SheetErodeLevel,
} from '../lib/sheetErode'

const props = defineProps<{
  level: SheetErodeLevel
  invert: boolean
}>()

const previewUrl = ref<string | null>(null)
const busy = ref(false)
const error = ref<string | null>(null)
let objectUrl: string | null = null
let gen = 0

const sourceUrl = mediaUrl(SHEET_ERODE_PREVIEW_PATH)

function revoke(): void {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl)
    objectUrl = null
  }
}

async function refresh(): Promise<void> {
  const my = ++gen
  busy.value = true
  error.value = null
  try {
    const params = sheetErodeFilterParams(props.level)
    const next = await processSheetImageUrl(sourceUrl, {
      params,
      invert: props.invert,
      maxEdge: 720,
    })
    if (my !== gen) {
      if (next !== sourceUrl) URL.revokeObjectURL(next)
      return
    }
    revoke()
    if (next !== sourceUrl) objectUrl = next
    previewUrl.value = next
  } catch (e) {
    if (my !== gen) return
    error.value = e instanceof Error ? e.message : String(e)
    previewUrl.value = sourceUrl
  } finally {
    if (my === gen) busy.value = false
  }
}

watch(
  () => [props.level, props.invert] as const,
  () => {
    void refresh()
  },
)

onMounted(() => {
  void refresh()
})

onUnmounted(() => {
  gen++
  revoke()
})
</script>

<template>
  <div class="erode-preview" aria-label="Smile sheet erode preview">
    <div class="erode-preview-head">
      <span class="erode-preview-title">Preview · Smile (Classic #13)</span>
      <span v-if="busy" class="erode-preview-busy" aria-live="polite">Updating…</span>
    </div>
    <div class="erode-preview-frame">
      <img
        v-if="previewUrl"
        :src="previewUrl"
        alt="Smile sheet music with current erode settings"
        class="erode-preview-img"
        :class="{ 'inverted-bg': invert }"
        draggable="false"
      />
      <p v-if="error" class="erode-preview-err" role="status">{{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.erode-preview {
  display: grid;
  gap: 0.45rem;
  margin-top: 0.75rem;
}
.erode-preview-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.35rem 0.75rem;
}
.erode-preview-title {
  font-size: 0.82rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.erode-preview-busy {
  font-size: 0.85rem;
  color: var(--accent);
  font-weight: 600;
}
.erode-preview-frame {
  position: relative;
  border: 1px solid var(--border);
  border-radius: 10px;
  overflow: hidden;
  background: #fff;
  max-height: 16rem;
}
.erode-preview-img {
  display: block;
  width: 100%;
  height: auto;
  max-height: 16rem;
  object-fit: contain;
  object-position: top center;
  background: #fff;
}
.erode-preview-img.inverted-bg {
  background: #000;
}
.erode-preview-err {
  margin: 0;
  padding: 0.55rem 0.7rem;
  font-size: 0.88rem;
  color: var(--danger);
}
</style>
