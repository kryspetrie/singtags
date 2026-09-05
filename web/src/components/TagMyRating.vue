<script setup lang="ts">
/**
 * Condensed My Rating control: "Rate" / star-count button → hoverable star picker.
 * Origin API accepts 1–5 only; Clear removes the local rating (no 0-star publish).
 */
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import {
  normalizeRatingStars,
  type BarbershopRatingStars,
} from '../lib/barbershopTagsRate'
import { useRatingsStore } from '../stores/ratings'
import { useSnackbarStore } from '../stores/snackbar'

const props = defineProps<{
  tagId: number
}>()

const ratings = useRatingsStore()
const snackbar = useSnackbarStore()
const busy = ref(false)
const open = ref(false)
const hoverStars = ref<number | null>(null)
const rootEl = ref<HTMLElement | null>(null)

const mine = computed(() => ratings.starsFor(props.tagId))
const publishing = computed(() => ratings.publishingId === props.tagId || busy.value)

/** Filled stars while hovering, else current rating (picker highlight). */
const previewStars = computed(() => hoverStars.value ?? mine.value ?? 0)

const triggerLabel = computed(() => {
  if (mine.value == null) return 'Rate'
  return '★'.repeat(mine.value)
})

const triggerAria = computed(() =>
  mine.value != null ? `My rating: ${mine.value} of 5` : 'Rate this tag',
)

const triggerTitle = computed(() =>
  mine.value != null
    ? `My rating: ${mine.value} of 5 — tap to change (Clear removes it on this device)`
    : 'Rate this tag (saves here and sends 1–5★ to barbershoptags.com)',
)

watch(
  () => props.tagId,
  () => {
    open.value = false
    hoverStars.value = null
  },
)

function onDocPointer(e: Event): void {
  const t = e.target
  if (!(t instanceof Node) || !rootEl.value?.contains(t)) {
    open.value = false
    hoverStars.value = null
  }
}

function onKey(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    open.value = false
    hoverStars.value = null
  }
}

watch(open, async (isOpen) => {
  if (isOpen) {
    await nextTick()
    document.addEventListener('pointerdown', onDocPointer, true)
    document.addEventListener('keydown', onKey)
  } else {
    hoverStars.value = null
    document.removeEventListener('pointerdown', onDocPointer, true)
    document.removeEventListener('keydown', onKey)
  }
})

onUnmounted(() => {
  document.removeEventListener('pointerdown', onDocPointer, true)
  document.removeEventListener('keydown', onKey)
})

function toggleOpen(): void {
  if (publishing.value) return
  open.value = !open.value
}

function setHover(n: number | null): void {
  hoverStars.value = n
}

async function pick(stars: BarbershopRatingStars): Promise<void> {
  if (busy.value) return
  if (mine.value === stars) {
    const rec = ratings.get(props.tagId)
    if (!rec || rec.publishedStars === rec.stars) {
      ratings.clearRating(props.tagId)
      open.value = false
      return
    }
  }
  busy.value = true
  try {
    const result = await ratings.setRating(props.tagId, stars)
    if (!result.published && result.error) {
      snackbar.show(
        `Saved on this device. Couldn’t reach barbershoptags.com: ${result.error}`,
        { title: 'My Rating', tone: 'info', ms: 5000, placement: 'center' },
      )
    } else {
      open.value = false
    }
  } finally {
    busy.value = false
  }
}

function onStarClick(n: number): void {
  const stars = normalizeRatingStars(n)
  if (stars == null) return
  void pick(stars)
}

function clear(): void {
  ratings.clearRating(props.tagId)
  open.value = false
}
</script>

<template>
  <div ref="rootEl" class="rate-wrap" :class="{ open, busy: publishing }">
    <button
      type="button"
      class="rate-btn"
      :class="{ rated: mine != null }"
      :aria-expanded="open"
      aria-haspopup="true"
      :aria-label="triggerAria"
      :title="triggerTitle"
      :disabled="publishing"
      @click="toggleOpen"
    >
      <template v-if="mine == null">
        <span class="rate-ico" aria-hidden="true">★</span>
        <span class="rate-text">Rate</span>
      </template>
      <span v-else class="rate-stars" aria-hidden="true">{{ triggerLabel }}</span>
    </button>

    <div
      v-if="open"
      class="rate-pop"
      role="dialog"
      aria-label="Choose rating from 1 to 5 stars"
      @pointerleave="setHover(null)"
    >
      <div class="stars">
        <button
          v-for="n in 5"
          :key="n"
          type="button"
          class="star"
          :class="{ on: n <= previewStars }"
          :aria-label="`${n} star${n === 1 ? '' : 's'}`"
          :aria-pressed="mine === n"
          :disabled="publishing"
          @pointerenter="setHover(n)"
          @focus="setHover(n)"
          @click="onStarClick(n)"
        >
          ★
        </button>
      </div>
      <button
        type="button"
        class="clear"
        :disabled="publishing"
        title="Remove rating on this device (barbershoptags.com has no 0-star / unrate)"
        @pointerenter="setHover(null)"
        @click="clear"
      >
        Clear
      </button>
    </div>
  </div>
</template>

<style scoped>
.rate-wrap {
  position: relative;
  display: inline-flex;
  flex-direction: column;
  align-items: flex-end;
}
.rate-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--muted);
  font: inherit;
  font-size: 0.82rem;
  font-weight: 650;
  min-height: 40px;
  padding: 0.3rem 0.65rem;
  cursor: pointer;
  white-space: nowrap;
}
.rate-btn.rated {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
  letter-spacing: 0.02em;
}
.rate-btn:hover {
  border-color: color-mix(in srgb, var(--accent) 35%, var(--border));
  color: var(--text);
}
.rate-btn.rated:hover {
  color: var(--accent-hover);
}
.rate-btn:disabled {
  cursor: wait;
  opacity: 0.75;
}
.rate-ico {
  font-size: 1rem;
  line-height: 1;
}
.rate-stars {
  font-size: 0.95rem;
  line-height: 1;
  letter-spacing: 0.04em;
}
.rate-pop {
  position: absolute;
  top: calc(100% + 0.35rem);
  right: 0;
  z-index: 30;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.25rem 0.35rem;
  padding: 0.4rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--text) 14%, transparent);
  min-width: max-content;
}
.stars {
  display: flex;
  align-items: center;
  gap: 0.05rem;
}
.star {
  border: 0;
  background: transparent;
  color: color-mix(in srgb, var(--muted) 65%, var(--border));
  font-size: 1.35rem;
  line-height: 1;
  padding: 0.2rem 0.15rem;
  min-height: 40px;
  min-width: 1.85rem;
  cursor: pointer;
  transition: color 0.08s ease;
}
.star.on {
  color: var(--accent);
}
.star:disabled {
  cursor: wait;
}
.clear {
  border: 0;
  background: transparent;
  color: var(--muted);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 600;
  min-height: 36px;
  padding: 0.2rem 0.4rem;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
.clear:hover {
  color: var(--text);
}
</style>
