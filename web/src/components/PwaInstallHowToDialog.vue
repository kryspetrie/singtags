<script setup lang="ts">
/**
 * Illustrated how-to when the browser cannot run a one-tap install prompt
 * (iOS, or Chromium before beforeinstallprompt fires).
 */
import { computed, onUnmounted, watch } from 'vue'
import { getPwaInstallGuide, type PwaInstallPlatform } from '../lib/pwaInstallGuide'

const props = defineProps<{
  open: boolean
  /** Optional override for tests / forced platform. */
  platform?: PwaInstallPlatform
}>()

const emit = defineEmits<{
  close: []
}>()

const guide = computed(() => getPwaInstallGuide(props.platform))

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      window.addEventListener('keydown', onKeydown)
      return
    }
    window.removeEventListener('keydown', onKeydown)
  },
)

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="howto-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-howto-title"
    >
      <button type="button" class="backdrop" aria-label="Close install help" @click="emit('close')" />
      <div class="panel" tabindex="-1">
        <header class="head">
          <p class="eyebrow">Install SingTags</p>
          <h2 id="pwa-howto-title">{{ guide.title }}</h2>
          <p class="lead">{{ guide.lead }}</p>
        </header>

        <ol class="steps">
          <li v-for="(step, i) in guide.steps" :key="i">{{ step }}</li>
        </ol>

        <figure class="figure" :class="{ landscape: guide.platform === 'desktop' }">
          <img
            :src="guide.imageSrc"
            :alt="guide.imageAlt"
            :width="guide.platform === 'desktop' ? 1100 : 600"
            :height="guide.platform === 'desktop' ? 733 : 900"
            loading="lazy"
          />
        </figure>

        <p class="docs">
          <a :href="guide.docsHref" target="_blank" rel="noopener noreferrer">{{ guide.docsLabel }}</a>
        </p>

        <footer class="actions">
          <button type="button" class="btn btn-primary" @click="emit('close')">Got it</button>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.howto-root {
  position: fixed;
  inset: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + env(safe-area-inset-bottom));
}
.backdrop {
  position: absolute;
  inset: 0;
  border: 0;
  background: rgba(0, 0, 0, 0.45);
}
.panel {
  position: relative;
  width: min(100%, 26rem);
  max-height: min(90vh, 44rem);
  overflow: auto;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.15rem 1.2rem 1rem;
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.2);
  display: grid;
  gap: 0.75rem;
}
.head {
  display: grid;
  gap: 0.3rem;
}
.eyebrow {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--accent);
}
.head h2 {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.25rem;
  line-height: 1.25;
}
.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
  line-height: 1.4;
}
.steps {
  margin: 0;
  padding-left: 1.25rem;
  display: grid;
  gap: 0.35rem;
  font-size: 0.92rem;
  line-height: 1.4;
  color: var(--text);
}
.figure {
  margin: 0;
  border-radius: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--border) 35%, var(--surface));
}
.figure img {
  display: block;
  width: 100%;
  height: auto;
}
.docs {
  margin: 0;
  font-size: 0.85rem;
}
.docs a {
  color: var(--accent);
  font-weight: 600;
}
.actions {
  display: flex;
  gap: 0.5rem;
}
.actions .btn-primary {
  flex: 1;
}
</style>
