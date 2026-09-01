<script setup lang="ts">
const props = withDefaults(
  defineProps<{
    count: number
    toolbarLabel: string
    /** When false, hide the favorite action (e.g. on the favorites list). */
    showFavorite?: boolean
  }>(),
  {
    showFavorite: true,
  },
)

const emit = defineEmits<{
  favorite: []
  collection: []
  optical: []
  zip: []
  clear: []
}>()
</script>

<template>
  <Teleport to="body">
    <div
      v-if="count > 0"
      class="selection-bar"
      role="toolbar"
      :aria-label="toolbarLabel"
    >
      <span class="sel-count">{{ count }} selected</span>
      <button
        v-if="props.showFavorite"
        type="button"
        class="btn btn-fav"
        aria-label="Favorite selected tags"
        title="Favorite selected tags and cache for offline"
        @click="emit('favorite')"
      >
        <span aria-hidden="true">♡</span>
      </button>
      <button
        type="button"
        class="btn"
        aria-label="Add to collection"
        title="Favorite selected tags and add them to a collection"
        @click="emit('collection')"
      >
        <span class="label-long">Add to Collection</span>
        <span class="label-short">+Collection</span>
      </button>
      <button
        type="button"
        class="btn btn-optical"
        aria-label="Optical transfer"
        title="Transfer selected tags' sheets optically to another device"
        @click="emit('optical')"
      >
        <span class="label-long">Optical Transfer</span>
        <span class="label-short">
          <span class="sel-btn-ico" aria-hidden="true">⇄</span>
          Optical
        </span>
      </button>
      <button
        type="button"
        class="btn"
        aria-label="Queue download"
        title="Add selected tags' sheets and tracks to the download queue"
        @click="emit('zip')"
      >
        <span class="label-long">Queue Download</span>
        <span class="label-short">+Queue</span>
      </button>
      <slot />
      <button
        type="button"
        class="btn btn-ghost"
        title="Clear selection"
        @click="emit('clear')"
      >
        Clear
      </button>
    </div>
  </Teleport>
</template>

<style>
.selection-bar {
  container-type: inline-size;
  container-name: selection-bar;
  position: fixed;
  left: 0;
  right: 0;
  z-index: 25;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.6rem;
  background: color-mix(in srgb, var(--surface) 94%, transparent);
  border-top: 1px solid var(--border);
  box-shadow: 0 -8px 24px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(10px);
  bottom: calc(var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
}
.selection-bar .sel-count {
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin-right: auto;
  font-size: 0.88rem;
}
.selection-bar .btn {
  flex: 0 1 auto;
  min-width: 0;
  font-size: 0.88rem;
  padding: 0.45rem 0.55rem;
}
.selection-bar .label-short {
  display: none;
}
.selection-bar .label-long {
  display: inline;
}
.selection-bar .btn-fav {
  min-width: 44px;
  padding: 0.35rem 0.55rem;
  font-size: 1.15rem;
  font-weight: 700;
  line-height: 1;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--muted);
}
.selection-bar .btn-fav:hover {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.selection-bar .btn-optical .label-short {
  display: none;
  align-items: center;
  gap: 0.25rem;
}
.selection-bar .sel-btn-ico {
  font-size: 1.05em;
  line-height: 1;
}
.selection-bar .btn-remove-icon {
  min-width: 44px;
  min-height: 44px;
  padding: 0;
  font-size: 1.5rem;
  line-height: 1;
  font-weight: 400;
  color: var(--muted);
}
.selection-bar .btn-remove-icon:hover {
  color: var(--danger);
}
@container selection-bar (max-width: 34rem) {
  .selection-bar .label-long {
    display: none;
  }
  .selection-bar .label-short {
    display: inline;
  }
  .selection-bar .btn-optical .label-short {
    display: inline-flex;
  }
}
@media (min-width: 640px) {
  .selection-bar {
    gap: 0.45rem;
    padding: 0.65rem 0.75rem;
  }
  .selection-bar .sel-count {
    font-size: 0.95rem;
  }
  .selection-bar .btn {
    font-size: 0.92rem;
    padding: 0.5rem 0.75rem;
  }
}
@media (min-width: 768px) {
  .selection-bar {
    left: 50%;
    right: auto;
    transform: translateX(-50%);
    width: min(960px, calc(100% - 2rem));
    bottom: 1rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 10px 32px rgba(0, 0, 0, 0.12);
  }
}
</style>
