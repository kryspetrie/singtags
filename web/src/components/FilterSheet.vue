<script setup lang="ts">
/**
 * Reusable mobile-first bottom sheet shell with enter/leave animation and optional anchor top.
 */
import { computed, nextTick, ref, watch } from 'vue'

const props = withDefaults(
  defineProps<{
    /** Sheet open state controlled by parent. */
    open: boolean
    title: string
    /** Viewport Y of the panel top on mobile (e.g. bottom of filter chips). */
    anchorTop?: number | null
    /** Raise above fullscreen sheet chrome (default sheet is under soft-fullscreen). */
    elevated?: boolean
    /** Hide the visible title; dialog `aria-label` still uses `title`. */
    hideTitle?: boolean
    /** Hide the entire header (title + Done) — for docked desktop menus. */
    hideHeader?: boolean
    /** Mobile: full-height drawer; desktop: large centered panel. */
    fullScreen?: boolean
    /**
     * Grow the panel to its content (up to the viewport) instead of the default
     * short max-height that forces an inner scrollbar for modest menus.
     */
    fitContent?: boolean
    /**
     * Desktop: dock as a dropdown under an anchor instead of a centered modal.
     * Set `--dock-top` / `--dock-right` (or `--dock-left`) via `dockStyle`.
     */
    docked?: boolean
    /** Positioning vars for docked desktop dropdown. */
    dockStyle?: Record<string, string> | null
  }>(),
  {
    hideHeader: false,
    docked: false,
    dockStyle: null,
  },
)

defineEmits<{
  close: []
}>()

const anchored = computed(() => props.anchorTop != null && props.anchorTop >= 0)

const rootStyle = computed(() => {
  const style: Record<string, string> = {}
  if (anchored.value && props.anchorTop != null) {
    style['--sheet-anchor-top'] = `${props.anchorTop}px`
  }
  if (props.docked && props.dockStyle) {
    Object.assign(style, props.dockStyle)
  }
  return Object.keys(style).length ? style : undefined
})

/** Keep the overlay mounted until the leave animation finishes. */
const layerOpen = ref(false)
/**
 * Panel/backdrop visibility — delayed until after the layer paints so enter
 * animations actually run (Vue skips enter when Transition + child mount together).
 */
const contentOpen = ref(false)

function afterPaint(cb: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(cb)
  })
}

watch(
  () => props.open,
  async (isOpen) => {
    if (isOpen) {
      layerOpen.value = true
      contentOpen.value = false
      await nextTick()
      afterPaint(() => {
        if (props.open) contentOpen.value = true
      })
      return
    }
    contentOpen.value = false
  },
  { immediate: true },
)

function onPanelAfterLeave(): void {
  if (!props.open) layerOpen.value = false
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="layerOpen"
      class="sheet-root"
      :class="{
        anchored,
        elevated,
        fullScreen: fullScreen,
        fitContent: fitContent,
        docked: docked,
      }"
      :style="rootStyle"
      :role="docked ? 'menu' : 'dialog'"
      :aria-modal="docked ? undefined : 'true'"
      :aria-label="title"
      :aria-hidden="!open"
    >
      <Transition name="sheet-fade">
        <button
          v-if="contentOpen"
          type="button"
          class="backdrop"
          aria-label="Close"
          @click="$emit('close')"
        />
      </Transition>
      <Transition
        :name="docked ? 'sheet-dock' : 'sheet-slide'"
        @after-leave="onPanelAfterLeave"
      >
        <div v-if="contentOpen" class="panel">
          <header
            v-if="!hideHeader"
            class="head"
            :class="{ 'head-titleless': hideTitle }"
          >
            <h2 v-if="!hideTitle">{{ title }}</h2>
            <button type="button" class="btn btn-primary" @click="$emit('close')">Done</button>
          </header>
          <div class="body">
            <slot />
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.sheet-root {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  pointer-events: none;
}
.sheet-root.elevated {
  z-index: 90;
}
.backdrop {
  pointer-events: auto;
  position: absolute;
  /* Dim everything except the sticky title bar and bottom nav. */
  top: var(--header-h, 3.5rem);
  left: 0;
  right: 0;
  bottom: calc(var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
  border: 0;
  background: rgba(0, 0, 0, 0.4);
}
.sheet-root.elevated .backdrop {
  top: 0;
  bottom: 0;
}
.sheet-root.elevated .panel {
  margin-bottom: calc(0.75rem + env(safe-area-inset-bottom));
}
.sheet-root.fullScreen.elevated .panel {
  margin-bottom: 0;
}
.sheet-root.fullScreen.elevated .backdrop {
  top: 0;
  bottom: 0;
}
.panel {
  pointer-events: auto;
  position: relative;
  z-index: 1;
  max-height: min(70vh, 28rem);
  margin-bottom: calc(var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
  background: var(--surface);
  border-radius: 16px 16px 0 0;
  padding: 0.75rem 1rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.12);
}
.sheet-root.fullScreen .panel {
  max-height: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.sheet-root.fullScreen .body {
  flex: 1;
  min-height: 0;
}

.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.head h2 {
  margin: 0;
  font-size: 1.05rem;
  font-family: var(--font-display);
}
.head-titleless {
  justify-content: flex-end;
}
.body {
  overflow: auto;
  -webkit-overflow-scrolling: touch;
  min-height: 0;
  flex: 1;
  /* Room for chip borders and :focus-visible outlines without clipping. */
  padding: 0.5rem 0.45rem;
  margin: 0;
}

/* Modest menus (e.g. More): grow with content; only scroll if near viewport height.
 * Prefer % of the fixed inset root over 100dvh — CSS zoom on <html> skews dvh. */
.sheet-root.fitContent .panel {
  max-height: calc(
    100% - var(--bottom-nav-h, 3.75rem) - env(safe-area-inset-bottom) - 0.75rem
  );
}
.sheet-root.fitContent.elevated .panel {
  max-height: calc(100% - env(safe-area-inset-bottom) - 1.5rem);
}
.sheet-root.fitContent .body {
  flex: 0 1 auto;
  /* Scroll only if the panel hits the viewport cap; otherwise size to content. */
  overflow: auto;
  min-height: 0;
}

.sheet-fade-enter-active {
  animation: sheet-fade-in 0.28s ease;
}
.sheet-fade-leave-active {
  animation: sheet-fade-out 0.28s ease;
}
@keyframes sheet-fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}
@keyframes sheet-fade-out {
  from {
    opacity: 1;
  }
  to {
    opacity: 0;
  }
}

.sheet-slide-enter-active {
  animation: sheet-slide-in 0.34s cubic-bezier(0.22, 1, 0.36, 1);
}
.sheet-slide-leave-active {
  animation: sheet-slide-out 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}
@keyframes sheet-slide-in {
  from {
    transform: translateY(100%);
  }
  to {
    transform: translateY(0);
  }
}
@keyframes sheet-slide-out {
  from {
    transform: translateY(0);
  }
  to {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet-fade-enter-active,
  .sheet-fade-leave-active,
  .sheet-slide-enter-active,
  .sheet-slide-leave-active {
    animation-duration: 0.01ms;
  }
}

/* Mobile: panel fills from filter chips down to the top of the bottom nav. */
@media (max-width: 767px) {
  .sheet-root.anchored {
    justify-content: stretch;
  }
  .sheet-root.anchored .panel {
    position: absolute;
    top: var(--sheet-anchor-top, var(--header-h, 3.5rem));
    left: 0;
    right: 0;
    bottom: calc(var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
    margin-bottom: 0;
    max-height: none;
    height: auto;
    border-radius: 12px 12px 0 0;
  }
  .sheet-root.fullScreen {
    justify-content: stretch;
  }
  .sheet-root.fullScreen .panel {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    margin-bottom: 0;
    max-height: none;
    height: auto;
    border-radius: 0;
    padding: max(0.65rem, env(safe-area-inset-top)) 0.85rem
      max(0.85rem, env(safe-area-inset-bottom)) 0.85rem;
  }
  .sheet-root.fullScreen .head {
    padding-bottom: 0.45rem;
    border-bottom: 1px solid var(--border);
  }
}
@media (min-width: 768px) {
  .backdrop {
    bottom: 0;
  }
  .sheet-root {
    justify-content: center;
    align-items: center;
    padding: 1rem;
  }
  .panel {
    width: min(420px, 100%);
    max-height: 70vh;
    margin-bottom: 0;
    border-radius: var(--radius);
  }
  .sheet-root.fitContent .panel {
    max-height: min(85vh, 40rem);
  }
  .sheet-root.fullScreen {
    padding: 1.25rem;
  }
  .sheet-root.fullScreen .panel {
    width: min(960px, 94vw);
    height: min(88vh, calc(100% - 2.5rem));
    max-height: none;
    border-radius: calc(var(--radius, 10px) + 2px);
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.18);
  }

  /* Docked dropdown (e.g. desktop More) — not a centered modal. */
  .sheet-root.docked {
    justify-content: flex-start;
    align-items: stretch;
    padding: 0;
    pointer-events: none;
  }
  .sheet-root.docked .backdrop {
    pointer-events: auto;
    top: 0;
    bottom: 0;
    background: transparent;
  }
  .sheet-root.docked .panel {
    pointer-events: auto;
    position: absolute;
    top: var(--dock-top, calc(var(--header-h, 3.5rem) + 0.35rem));
    right: var(--dock-right, 0.75rem);
    left: auto;
    width: min(22rem, calc(100vw - 1.5rem));
    max-height: min(80vh, 36rem);
    margin: 0;
    padding: 0.55rem 0.55rem 0.65rem;
    border-radius: 12px;
    border: 1px solid var(--border);
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.14);
  }
  .sheet-root.docked.fitContent .panel {
    max-height: min(80vh, 36rem);
  }
  .sheet-root.docked .body {
    padding: 0.25rem 0.15rem;
  }
  .sheet-root.docked.elevated .panel {
    margin-bottom: 0;
  }

  @keyframes sheet-slide-in {
    from {
      transform: translateY(1.25rem) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }
  @keyframes sheet-slide-out {
    from {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    to {
      transform: translateY(1.25rem) scale(0.98);
      opacity: 0;
    }
  }

  .sheet-root.docked .panel {
    transform-origin: top right;
  }
  .sheet-dock-enter-active {
    animation: sheet-dock-in 0.2s cubic-bezier(0.22, 1, 0.36, 1);
  }
  .sheet-dock-leave-active {
    animation: sheet-dock-out 0.16s cubic-bezier(0.22, 1, 0.36, 1);
  }
  @keyframes sheet-dock-in {
    from {
      transform: translateY(-0.35rem) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }
  @keyframes sheet-dock-out {
    from {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
    to {
      transform: translateY(-0.35rem) scale(0.98);
      opacity: 0;
    }
  }
}

@media (prefers-reduced-motion: reduce) {
  .sheet-dock-enter-active,
  .sheet-dock-leave-active {
    animation-duration: 0.01ms;
  }
}
</style>
