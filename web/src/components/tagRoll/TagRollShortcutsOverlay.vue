<script setup lang="ts">
/**
 * Full-viewport keyboard shortcut reference for Tag Studio.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { TAG_ROLL_SHORTCUTS, tagRollTip } from '../../lib/tagRoll/shortcuts'

const props = defineProps<{
  open: boolean
}>()

const emit = defineEmits<{
  close: []
}>()

const closeBtn = ref<HTMLButtonElement | null>(null)

const GROUP_LABELS: Record<(typeof TAG_ROLL_SHORTCUTS)[number]['group'], string> = {
  modes: 'Modes',
  transport: 'Transport & playhead',
  edit: 'Editing & selection',
  duration: 'Note length',
  parts: 'Parts',
  harmonize: 'Harmonize',
  nav: 'Navigate the roll',
}

const GROUP_ORDER: Array<(typeof TAG_ROLL_SHORTCUTS)[number]['group']> = [
  'transport',
  'edit',
  'duration',
  'parts',
  'modes',
  'harmonize',
  'nav',
]

const groups = computed(() => {
  const map = new Map<string, typeof TAG_ROLL_SHORTCUTS[number][]>()
  for (const s of TAG_ROLL_SHORTCUTS) {
    const list = map.get(s.group) ?? []
    list.push(s)
    map.set(s.group, list)
  }
  return GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    id: g,
    title: GROUP_LABELS[g],
    items: map.get(g)!,
  }))
})

function onKey(e: KeyboardEvent): void {
  if (!props.open) return
  if (e.key === 'Escape') {
    e.preventDefault()
    e.stopPropagation()
    emit('close')
  }
}

watch(
  () => props.open,
  (open) => {
    if (typeof document === 'undefined') return
    document.body.style.overflow = open ? 'hidden' : ''
    if (open) {
      requestAnimationFrame(() => closeBtn.value?.focus())
    }
  },
)

onMounted(() => {
  window.addEventListener('keydown', onKey, true)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKey, true)
  if (typeof document !== 'undefined') document.body.style.overflow = ''
})
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="sh-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="tag-roll-shortcuts-title"
      @click.self="emit('close')"
    >
      <div class="sh-sheet">
        <header class="sh-head">
          <div class="sh-intro">
            <h2 id="tag-roll-shortcuts-title" class="sh-title">Keyboard shortcuts</h2>
            <p class="sh-lead">
              Space plays or stops back to the origin; Enter pauses in place.
              Tag Studio is keyboard-first — parts, lengths, transport, and selection without
              leaving the roll.
            </p>
          </div>
          <button
            ref="closeBtn"
            type="button"
            class="sh-close"
            :aria-label="tagRollTip('Close', 'Esc')"
            :title="tagRollTip('Close', 'Esc')"
            @click="emit('close')"
          >
            ✕
          </button>
        </header>

        <div class="sh-grid">
          <section v-for="g in groups" :key="g.id" class="sh-group">
            <h3 class="sh-sec">{{ g.title }}</h3>
            <ul class="sh-list" role="list">
              <li v-for="s in g.items" :key="s.id" class="sh-row">
                <kbd class="sh-kbd">{{ s.keys }}</kbd>
                <span class="sh-label">{{ s.label }}</span>
              </li>
            </ul>
          </section>
        </div>

        <footer class="sh-foot">
          <span>Press <kbd class="sh-kbd inline">Esc</kbd> or click outside to close</span>
        </footer>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.sh-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: grid;
  place-items: stretch;
  padding: clamp(0.5rem, 2vw, 1.25rem);
  background: color-mix(in srgb, #0c0a08 55%, transparent);
  backdrop-filter: blur(4px);
}
.sh-sheet {
  display: grid;
  grid-template-rows: auto 1fr auto;
  gap: 1rem;
  width: min(72rem, 100%);
  height: min(100%, 100dvh - 1rem);
  margin: 0 auto;
  padding: clamp(1rem, 2.5vw, 1.75rem);
  border-radius: 16px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 18px 48px color-mix(in srgb, #000 28%, transparent);
  overflow: hidden;
}
.sh-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.sh-intro {
  min-width: 0;
}
.sh-title {
  margin: 0 0 0.35rem;
  font-size: clamp(1.35rem, 2.4vw, 1.85rem);
  font-weight: 750;
  letter-spacing: -0.02em;
}
.sh-lead {
  margin: 0;
  max-width: 40rem;
  font-size: 0.95rem;
  line-height: 1.45;
  color: var(--muted);
}
.sh-close {
  flex: 0 0 auto;
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--bg, var(--surface));
  color: var(--text);
  font: inherit;
  font-size: 1.15rem;
  cursor: pointer;
}
.sh-close:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.sh-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16.5rem, 1fr));
  gap: 1rem 1.35rem;
  min-height: 0;
  overflow: auto;
  padding-right: 0.15rem;
}
.sh-group {
  display: grid;
  gap: 0.45rem;
  align-content: start;
  padding: 0.75rem 0.85rem;
  border-radius: 12px;
  border: 1px solid color-mix(in srgb, var(--border) 85%, transparent);
  background: color-mix(in srgb, var(--bg, var(--surface)) 55%, var(--surface));
}
.sh-sec {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 750;
  color: var(--accent);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.sh-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.35rem;
}
.sh-row {
  display: grid;
  grid-template-columns: minmax(5.5rem, auto) 1fr;
  align-items: center;
  gap: 0.65rem;
  font-size: 0.92rem;
  line-height: 1.3;
}
.sh-kbd {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.7rem;
  padding: 0.2rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
  box-shadow: 0 1px 0 color-mix(in srgb, #000 8%, transparent);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 0.78rem;
  font-weight: 700;
  white-space: nowrap;
}
.sh-kbd.inline {
  min-height: 1.4rem;
  padding: 0.1rem 0.35rem;
  font-size: 0.72rem;
}
.sh-label {
  color: var(--text);
}
.sh-foot {
  display: flex;
  justify-content: center;
  padding-top: 0.15rem;
  font-size: 0.85rem;
  color: var(--muted);
}
@media (max-width: 640px) {
  .sh-overlay {
    padding: 0;
  }
  .sh-sheet {
    width: 100%;
    height: 100%;
    border-radius: 0;
  }
  .sh-row {
    grid-template-columns: minmax(4.5rem, auto) 1fr;
  }
}
</style>
