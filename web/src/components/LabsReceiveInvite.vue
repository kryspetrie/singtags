<script setup lang="ts">
/**
 * Copyable receive invite link for Labs transfer pages (Wireless / OS Share).
 */
import { useSnackbarStore } from '../stores/snackbar'

const props = withDefaults(
  defineProps<{
    url: string
    title?: string
    description?: string
  }>(),
  {
    title: 'Sending to someone without this screen open?',
    description:
      'Share the link below. It opens Receive and starts the fullscreen flow on their phone.',
  },
)

const snackbar = useSnackbarStore()

function selectUrl(event: Event): void {
  ;(event.target as HTMLInputElement).select()
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.url)
    snackbar.show('Receive link copied', { tone: 'ok', ms: 3000 })
  } catch {
    snackbar.show('Could not copy — select the link and copy it manually.', { tone: 'error' })
  }
}
</script>

<template>
  <div class="receive-invite">
    <p class="invite-title">{{ title }}</p>
    <p class="invite-desc">{{ description }}</p>
    <div class="url-row">
      <label class="url-lbl" for="labs-receive-url">Receive link</label>
      <input
        id="labs-receive-url"
        class="url-input"
        :value="url"
        readonly
        @focus="selectUrl"
      />
      <button
        type="button"
        class="copy-btn"
        aria-label="Copy receive link"
        title="Copy receive link"
        @click="copyLink"
      >
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false">
          <rect x="9" y="9" width="11" height="11" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
          <path
            d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          />
        </svg>
      </button>
    </div>
  </div>
</template>

<style scoped>
.receive-invite {
  display: grid;
  gap: 0.35rem;
  padding: 0.85rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.invite-title {
  margin: 0;
  font-weight: 700;
  font-size: 0.95rem;
}
.invite-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.4;
}
.url-row {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 0.4rem;
  align-items: center;
  margin-top: 0.25rem;
}
.url-lbl {
  grid-column: 1 / -1;
  font-size: 0.8rem;
  font-weight: 650;
  color: var(--muted);
}
.url-input {
  min-width: 0;
  min-height: 40px;
  padding: 0.4rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg, #fff);
  font: inherit;
  font-size: 0.82rem;
}
.copy-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: inherit;
  cursor: pointer;
}
</style>
