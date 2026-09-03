<script setup lang="ts">
/**
 * Shareable link for receivers who need to open SingTags in optical receive mode.
 */
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { opticalReceiveAbsoluteHref } from '../lib/decimen/opticalTransferNav'
import { useSnackbarStore } from '../stores/snackbar'

withDefaults(
  defineProps<{
    /** Tighter copy for sheets and stream overlay. */
    compact?: boolean
  }>(),
  {
    compact: false,
  },
)

const router = useRouter()
const snackbar = useSnackbarStore()

const receiveHref = computed(() => opticalReceiveAbsoluteHref(router))

function selectUrl(event: Event): void {
  ;(event.target as HTMLInputElement).select()
}

async function copyLink(): Promise<void> {
  try {
    await navigator.clipboard.writeText(receiveHref.value)
    snackbar.show('Receive link copied', { tone: 'ok', ms: 3000 })
  } catch {
    snackbar.show('Could not copy — select the link and copy it manually.', { tone: 'error' })
  }
}
</script>

<template>
  <div class="receive-invite" :class="{ compact }">
    <p class="invite-title">
      {{ compact ? 'Receiver needs SingTags' : 'Sending to someone without SingTags?' }}
    </p>
    <p class="invite-desc">
      {{
        compact
          ? 'Share this link so they can open Receive mode and scan your QR stream.'
          : 'Share the link below. It opens optical transfer in Receive mode on their phone so they can scan your animated QR and save files locally — no catalog download required.'
      }}
    </p>
    <div class="url-row">
      <label class="url-lbl" for="optical-receive-url">Receive link</label>
      <input
        id="optical-receive-url"
        class="url-input"
        :value="receiveHref"
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
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius, 10px);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.receive-invite.compact {
  padding: 0.75rem 0.85rem;
  gap: 0.55rem;
}
.invite-title {
  margin: 0;
  font-weight: 700;
  font-size: 0.98rem;
  line-height: 1.35;
}
.compact .invite-title {
  font-size: 0.92rem;
}
.invite-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.45;
}
.compact .invite-desc {
  font-size: 0.85rem;
}
.url-row {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.url-lbl {
  flex: 0 0 auto;
  font-size: 0.85rem;
  font-weight: 600;
  white-space: nowrap;
}
.url-input {
  box-sizing: border-box;
  flex: 1 1 auto;
  min-width: 0;
  padding: 0.6rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-size: 16px;
}
.copy-btn {
  flex: 0 0 auto;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}
.copy-btn:hover {
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  color: var(--accent);
}
.copy-btn:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
