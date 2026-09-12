<script setup lang="ts">
/**
 * Modal for Labs Audio Recorder capture prefs (and optional Quick Record defaults).
 */
import { computed } from 'vue'
import {
  RECORDER_BITRATE_PRESETS,
  type RecorderCapturePrefs,
  type RecorderChannels,
} from '../types/recorder'
import { recorderMimeChoices } from '../audio/recorderCapture'
import LabelPillsInput from './LabelPillsInput.vue'

const props = defineProps<{
  open: boolean
  modelValue: RecorderCapturePrefs
  /** Disable capture fields while a take is recording. */
  disabled?: boolean
  /** Optional input device list (session page). */
  devices?: MediaDeviceInfo[]
  /** When set, show Quick Record auto labels/notes. */
  showQuickDefaults?: boolean
  quickLabels?: string[]
  quickNotes?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [RecorderCapturePrefs]
  'update:quickLabels': [string[]]
  'update:quickNotes': [string]
  close: []
  change: []
}>()

const mimeChoices = computed(() => recorderMimeChoices())

function patch(partial: Partial<RecorderCapturePrefs>): void {
  emit('update:modelValue', { ...props.modelValue, ...partial })
  emit('change')
}

function onChannels(e: Event): void {
  const v = Number((e.target as HTMLSelectElement).value) === 2 ? 2 : 1
  patch({ channels: v as RecorderChannels })
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="modal-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="recorder-settings-title"
      @keydown.escape.prevent="emit('close')"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <header class="head">
          <h2 id="recorder-settings-title" class="title">Recording settings</h2>
          <button type="button" class="btn ghost" aria-label="Close" @click="emit('close')">✕</button>
        </header>

        <div class="body">
          <p v-if="showQuickDefaults" class="tip muted">
            Capture format is the default for New and Quick Record. Auto labels/notes apply to Quick
            Record only.
          </p>
          <p v-else class="tip muted">Used for new takes in this session.</p>

          <div v-if="showQuickDefaults" class="quick-block">
            <label class="field">
              Auto labels
              <LabelPillsInput
                :model-value="quickLabels ?? []"
                placeholder="e.g. lead, then Enter"
                aria-label="Auto labels"
                @update:model-value="emit('update:quickLabels', $event)"
                @change="emit('change')"
              />
            </label>
            <label class="field">
              Auto notes
              <textarea
                :value="quickNotes ?? ''"
                rows="2"
                maxlength="2000"
                placeholder="Optional notes for every Quick Record session"
                @input="emit('update:quickNotes', ($event.target as HTMLTextAreaElement).value)"
                @change="emit('change')"
              />
            </label>
          </div>

          <div class="capture-grid">
            <label class="field">
              Processing
              <span class="select-shell">
                <select
                  :value="modelValue.processing"
                  :disabled="disabled"
                  @change="
                    patch({
                      processing:
                        ($event.target as HTMLSelectElement).value === 'voice' ? 'voice' : 'music',
                    })
                  "
                >
                  <option value="music">Music (raw)</option>
                  <option value="voice">Voice call</option>
                </select>
              </span>
            </label>
            <label class="field">
              Format
              <span class="select-shell">
                <select
                  :value="modelValue.mimeType"
                  :disabled="disabled"
                  @change="patch({ mimeType: ($event.target as HTMLSelectElement).value })"
                >
                  <option
                    v-for="m in mimeChoices"
                    :key="m.value"
                    :value="m.value"
                    :disabled="!m.supported"
                  >
                    {{ m.label }}{{ m.supported ? '' : ' (unsupported)' }}
                  </option>
                </select>
              </span>
            </label>
            <label class="field">
              Bitrate
              <span class="select-shell">
                <select
                  :value="modelValue.bitRate"
                  :disabled="disabled"
                  @change="patch({ bitRate: Number(($event.target as HTMLSelectElement).value) })"
                >
                  <option v-for="b in RECORDER_BITRATE_PRESETS" :key="b" :value="b">
                    {{ Math.round(b / 1000) }} kbps
                  </option>
                </select>
              </span>
            </label>
            <label class="field">
              Channels
              <span class="select-shell">
                <select :value="modelValue.channels" :disabled="disabled" @change="onChannels">
                  <option :value="1">Mono</option>
                  <option :value="2">Stereo</option>
                </select>
              </span>
            </label>
            <label v-if="devices?.length" class="field field-span">
              Input
              <span class="select-shell">
                <select
                  :value="modelValue.deviceId"
                  :disabled="disabled"
                  @change="patch({ deviceId: ($event.target as HTMLSelectElement).value })"
                >
                  <option value="">Default</option>
                  <option v-for="d in devices" :key="d.deviceId" :value="d.deviceId">
                    {{ d.label || d.deviceId }}
                  </option>
                </select>
              </span>
            </label>
          </div>
        </div>

        <div class="actions">
          <button type="button" class="btn primary" @click="emit('close')">Done</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-root {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  padding: 1rem;
  padding-bottom: calc(1rem + var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
  overflow: hidden;
  overscroll-behavior: none;
  touch-action: none;
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
  cursor: pointer;
}
.panel {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: min(26rem, 100%);
  max-width: 100%;
  min-width: 0;
  max-height: min(
    calc(100dvh - 2rem - var(--bottom-nav-h, 3.75rem) - env(safe-area-inset-bottom)),
    40rem
  );
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
  overscroll-behavior: contain;
  touch-action: auto;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex: 0 0 auto;
  min-width: 0;
  padding: 1.1rem 1.25rem 0.75rem;
}
.title {
  margin: 0;
  min-width: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.25;
  overflow-wrap: anywhere;
}
.body {
  display: grid;
  gap: 0.75rem;
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: 0 1.25rem 0.85rem;
  overflow-x: hidden;
  overflow-y: auto;
  overscroll-behavior: contain;
  -webkit-overflow-scrolling: touch;
}
.tip {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.quick-block,
.capture-grid {
  display: grid;
  gap: 0.65rem;
  min-width: 0;
  width: 100%;
}
@media (min-width: 420px) {
  .capture-grid {
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .field-span {
    grid-column: 1 / -1;
  }
}
.field {
  display: grid;
  gap: 0.3rem;
  min-width: 0;
  width: 100%;
  font-size: 0.85rem;
  color: var(--muted);
}
.select-shell {
  display: block;
  min-width: 0;
  width: 100%;
  max-width: 100%;
  overflow: hidden;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
}
.select-shell select,
.field textarea {
  box-sizing: border-box;
  display: block;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  font: inherit;
  font-size: 16px;
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  padding: 0.35rem 0.5rem;
  background: var(--bg);
  color: var(--text);
}
.select-shell select {
  /* Keep long device labels from widening the dialog. */
  appearance: none;
  background-image: linear-gradient(45deg, transparent 50%, var(--muted) 50%),
    linear-gradient(135deg, var(--muted) 50%, transparent 50%);
  background-position:
    calc(100% - 14px) calc(50% - 2px),
    calc(100% - 9px) calc(50% - 2px);
  background-size:
    5px 5px,
    5px 5px;
  background-repeat: no-repeat;
  padding-right: 1.75rem;
}
.field textarea {
  border: 1px solid var(--border);
  min-height: 4rem;
  resize: vertical;
}
.actions {
  display: flex;
  justify-content: flex-end;
  flex: 0 0 auto;
  min-width: 0;
  padding: 0 1.25rem 1.15rem;
}
.btn {
  flex: 0 0 auto;
  min-height: 40px;
  padding: 0.35rem 0.85rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  color: inherit;
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  color: var(--muted);
}
.btn.primary {
  background: var(--accent);
  border-color: var(--accent);
  color: #fff;
}
.muted {
  color: var(--muted);
}
</style>
