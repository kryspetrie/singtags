<script setup lang="ts">
/**
 * Local Library Add Song modal — choose how to add, then pick files when needed.
 * Combined mode continues into LocalLibraryCombineStaging for role/part review.
 */
import { ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'

export type LocalImportMode = 'combined' | 'separate' | 'empty'

const props = defineProps<{
  open: boolean
  opticalEnabled?: boolean
}>()

const emit = defineEmits<{
  close: []
  pick: [payload: { mode: LocalImportMode; files: File[] }]
  empty: []
}>()

const prefs = usePreferencesStore()
const mode = ref<LocalImportMode>('combined')
const fileInput = ref<HTMLInputElement | null>(null)

watch(
  () => props.open,
  (on) => {
    if (on) mode.value = 'combined'
  },
)

function choose(next: LocalImportMode): void {
  mode.value = next
  if (next === 'empty') {
    emit('empty')
    return
  }
  fileInput.value?.click()
}

function onFiles(e: Event): void {
  const input = e.target as HTMLInputElement
  const files = input.files ? [...input.files] : []
  input.value = ''
  if (!files.length) return
  emit('pick', { mode: mode.value, files })
}
</script>

<template>
  <div
    v-if="open"
    class="modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="import-title"
    @click.self="emit('close')"
  >
    <div class="panel">
      <header class="head">
        <h2 id="import-title" class="title">Add Song</h2>
        <button type="button" class="btn btn-ghost" aria-label="Close" @click="emit('close')">
          ✕
        </button>
      </header>

      <div class="body">
        <p class="lead">
          Add PDF sheet music and learning tracks on this device — or create an empty song for
          pitch and lyric cues only. Files stay in your browser — not uploaded.
        </p>
        <div class="choices">
          <button type="button" class="choice primary" @click="choose('combined')">
            <span class="choice-title">New song from files</span>
            <span class="choice-desc"
              >Recommended — one song with sheet + tracks. Review parts before saving.</span
            >
          </button>
          <button type="button" class="choice" @click="choose('empty')">
            <span class="choice-title">Empty song</span>
            <span class="choice-desc"
              >No files — title, key, and lyric hint only. Great for set lists that don’t need sheet
              music.</span
            >
          </button>
          <button type="button" class="choice" @click="choose('separate')">
            <span class="choice-title">Separate songs</span>
            <span class="choice-desc">Each file becomes its own song.</span>
          </button>
        </div>
        <p v-if="opticalEnabled ?? prefs.opticalTransferEnabled" class="receive">
          Receiving from another device?
          <RouterLink class="link" to="/rx" @click="emit('close')">Open optical receive</RouterLink>
        </p>
      </div>

      <input
        ref="fileInput"
        class="visually-hidden"
        type="file"
        multiple
        accept="application/pdf,image/*,audio/*,.pdf,.mp3,.wav,.m4a,.aac,.ogg,.png,.jpg,.jpeg,.webp"
        @change="onFiles"
      />
    </div>
  </div>
</template>

<style scoped>
.modal {
  position: fixed;
  inset: 0;
  z-index: 80;
  display: grid;
  place-items: end center;
  padding: 0;
  background: color-mix(in srgb, var(--text) 35%, transparent);
}
@media (min-width: 640px) {
  .modal {
    place-items: center;
    padding: 1.25rem;
  }
}
.panel {
  width: min(28rem, 100%);
  max-height: min(92dvh, 40rem);
  overflow: auto;
  border-radius: 16px 16px 0 0;
  background: var(--surface);
  border: 1px solid var(--border);
  border-bottom: 0;
  box-shadow: 0 -8px 32px color-mix(in srgb, var(--text) 18%, transparent);
}
@media (min-width: 640px) {
  .panel {
    border-radius: 16px;
    border-bottom: 1px solid var(--border);
    box-shadow: 0 12px 40px color-mix(in srgb, var(--text) 18%, transparent);
  }
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  background: var(--surface);
  z-index: 1;
}
.title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
}
.body {
  padding: 1rem;
  display: grid;
  gap: 0.85rem;
}
.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.choices {
  display: grid;
  gap: 0.55rem;
}
.choice {
  display: grid;
  gap: 0.2rem;
  text-align: left;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--bg) 55%, var(--surface));
  color: inherit;
  font: inherit;
  cursor: pointer;
}
.choice:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.choice.primary {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, var(--surface));
}
.choice-title {
  font-weight: 700;
  font-size: 0.98rem;
}
.choice-desc {
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
.receive {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.link {
  color: var(--accent);
  font-weight: 600;
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
.btn-ghost {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 1.1rem;
  line-height: 1;
  padding: 0.25rem 0.4rem;
  border-radius: 8px;
  cursor: pointer;
}
.btn-ghost:hover {
  color: var(--text);
  background: color-mix(in srgb, var(--border) 45%, transparent);
}
</style>
