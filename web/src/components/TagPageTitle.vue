<script setup lang="ts">
/**
 * Tag page heading: main title with optional alt subtitle.
 * Inline “Title · Alt” when both fit on one line; otherwise alt stacks below (no interpunct).
 */
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'

const props = defineProps<{
  title: string
  altTitle?: string | null
  barbershopUrl: string
}>()

const emit = defineEmits<{
  share: []
}>()

const titleHeadRef = ref<HTMLElement | null>(null)
const headingRef = ref<HTMLElement | null>(null)
const measureRef = ref<HTMLElement | null>(null)
/** True when alt must sit on its own line (full subtitle, no ·). */
const stacked = ref(false)

const tooltip = computed(() =>
  props.altTitle ? `${props.title} · ${props.altTitle}` : props.title,
)

async function updateLayout(): Promise<void> {
  if (!props.altTitle) {
    stacked.value = false
    return
  }
  await nextTick()
  const heading = headingRef.value
  const measure = measureRef.value
  if (!heading || !measure) return
  // Intrinsic width of “Title · Alt” as one unbroken line vs space the h1 actually has.
  const need = measure.offsetWidth
  const have = heading.clientWidth
  stacked.value = need > have + 1
}

let resizeObs: ResizeObserver | null = null

onMounted(() => {
  void updateLayout()
  if (typeof ResizeObserver !== 'undefined' && titleHeadRef.value) {
    resizeObs = new ResizeObserver(() => {
      void updateLayout()
    })
    resizeObs.observe(titleHeadRef.value)
  }
})

onUnmounted(() => {
  resizeObs?.disconnect()
  resizeObs = null
})

watch(
  () => [props.title, props.altTitle] as const,
  () => {
    void updateLayout()
  },
)
</script>

<template>
  <div class="title-block">
    <div ref="titleHeadRef" class="title-head">
      <h1
        ref="headingRef"
        class="heading"
        :class="{ 'is-title-only': !altTitle || stacked }"
        :title="tooltip"
      >
        <span class="title-text">{{ title }}</span>
        <template v-if="altTitle && !stacked">
          <span class="title-sep" aria-hidden="true"> · </span>
          <span class="alt-title">{{ altTitle }}</span>
        </template>
      </h1>
      <!-- Off-document width probe: always “Title · Alt” nowrap. -->
      <span
        v-if="altTitle"
        ref="measureRef"
        class="title-measure"
        aria-hidden="true"
      >
        <span class="title-text">{{ title }}</span>
        <span class="title-sep"> · </span>
        <span class="alt-title">{{ altTitle }}</span>
      </span>
      <div class="title-actions">
        <button
          type="button"
          class="title-copy"
          aria-label="Share this tag"
          title="Share a link to this tag"
          @click="emit('share')"
        >
          Share
        </button>
        <a
          :href="barbershopUrl"
          class="btn title-ext"
          target="_blank"
          rel="noopener noreferrer"
          title="Open on barbershoptags.com"
          aria-label="Open on barbershoptags.com"
        >↗</a>
      </div>
    </div>
    <p v-if="altTitle && stacked" class="alt-title alt-title--stacked">{{ altTitle }}</p>
  </div>
</template>

<style scoped>
.title-block {
  min-width: 0;
}
.title-head {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 0.5rem 0.75rem;
  flex-wrap: wrap;
  min-width: 0;
}
.title-head h1 {
  flex: 1 1 12rem;
  min-width: 0;
  font-family: var(--font-display);
  margin: 0;
  font-size: clamp(1.35rem, 6vw, 2rem);
  line-height: 1.2;
  max-width: 100%;
  overflow-wrap: anywhere;
  white-space: normal;
}
@media (min-width: 640px) {
  .title-head h1.is-title-only {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    overflow-wrap: normal;
  }
}
.title-measure {
  position: absolute;
  left: 0;
  top: 0;
  visibility: hidden;
  pointer-events: none;
  white-space: nowrap;
  width: max-content;
  font-family: var(--font-display);
  font-size: clamp(1.35rem, 6vw, 2rem);
  line-height: 1.2;
}
.title-actions {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-shrink: 0;
}
.title-copy {
  min-height: 36px;
  padding: 0.35rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--muted);
  white-space: nowrap;
}
.title-ext {
  min-width: 36px;
  min-height: 36px;
  padding: 0.35rem;
  color: var(--accent);
  font-size: 1rem;
  line-height: 1;
}
.title-ext:hover {
  color: var(--accent-hover);
}
.title-sep {
  font-family: var(--font);
  font-size: clamp(0.95rem, 3.5vw, 1.1rem);
  font-weight: 500;
  color: var(--muted);
  white-space: pre;
}
.alt-title {
  font-family: var(--font);
  color: var(--muted);
  font-size: clamp(0.95rem, 3.5vw, 1.1rem);
  font-weight: 500;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.alt-title--stacked {
  margin: 0.2rem 0 0;
}
</style>
