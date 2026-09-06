<script setup lang="ts">
/**
 * Prominent offline entry point: receive My Library / ad-hoc files optically.
 */
import { RouterLink } from 'vue-router'
import TransferButtonLabel from './TransferButtonLabel.vue'
import { opticalReceiveRoute } from '../lib/decimen/opticalTransferNav'

defineProps<{
  /** Smaller copy for tight layouts (e.g. app banner). */
  compact?: boolean
}>()
</script>

<template>
  <div class="offline-transfer-prompt" :class="{ compact }">
    <p class="prompt-title">
      {{ compact ? 'Receive files offline' : 'Transfer without the network' }}
    </p>
    <p class="prompt-desc">
      {{
        compact
          ? 'Scan animated QR codes from another device — My Library songs and files save on this phone.'
          : 'Send or receive My Library songs and files via animated QR codes. Nothing requires a catalog download or network.'
      }}
    </p>
    <RouterLink
      :to="opticalReceiveRoute"
      class="btn btn-primary prompt-action"
      aria-label="Receive with optical transfer"
    >
      <TransferButtonLabel />
    </RouterLink>
  </div>
</template>

<style scoped>
.offline-transfer-prompt {
  display: grid;
  gap: 0.65rem;
  margin-top: 0.85rem;
  padding: 0.85rem 0.9rem;
  text-align: left;
  border: 1px solid color-mix(in srgb, var(--accent) 35%, var(--border));
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.offline-transfer-prompt.compact {
  margin-top: 0;
  padding: 0;
  border: 0;
  background: transparent;
  text-align: inherit;
  gap: 0.45rem;
}
.prompt-title {
  margin: 0;
  font-weight: 700;
  font-size: 0.98rem;
  line-height: 1.35;
}
.prompt-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.45;
}
.compact .prompt-desc {
  font-size: 0.88rem;
}
.prompt-action {
  justify-self: start;
}
.compact .prompt-action {
  margin-top: 0.15rem;
}
</style>
