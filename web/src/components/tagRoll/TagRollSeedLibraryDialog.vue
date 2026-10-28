<script setup lang="ts">
/**
 * Pick Lilly Marlene and golden songs to add to the Tag Studio library.
 */
import { computed, ref, watch } from 'vue'
import type { LibrarySeedOffer } from '../../lib/tagRoll/librarySeeds'

const props = defineProps<{
  open: boolean
  offers: readonly LibrarySeedOffer[]
  presentIds: readonly string[]
  busy: boolean
  loadError: string
}>()

const emit = defineEmits<{
  close: []
  load: [ids: string[]]
}>()

const selected = ref<Set<string>>(new Set())

watch(
  () => props.open,
  (on) => {
    if (on) selected.value = new Set()
  },
)

const present = computed(() => new Set(props.presentIds))
const tags = computed(() => props.offers.filter((o) => o.kind === 'tag'))
const songs = computed(() => props.offers.filter((o) => o.kind === 'golden'))
const availableIds = computed(() =>
  props.offers.filter((o) => !present.value.has(o.id)).map((o) => o.id),
)
const selectedCount = computed(
  () => availableIds.value.filter((id) => selected.value.has(id)).length,
)

function toggle(id: string): void {
  if (present.value.has(id) || props.busy) return
  const next = new Set(selected.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  selected.value = next
}

function selectAllSongs(): void {
  const next = new Set(selected.value)
  for (const offer of songs.value) {
    if (!present.value.has(offer.id)) next.add(offer.id)
  }
  selected.value = next
}

function clearSongs(): void {
  const songIds = new Set(songs.value.map((o) => o.id))
  selected.value = new Set([...selected.value].filter((id) => !songIds.has(id)))
}

function submit(): void {
  const ids = availableIds.value.filter((id) => selected.value.has(id))
  if (!ids.length || props.busy) return
  emit('load', ids)
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="seed-root"
      role="dialog"
      aria-modal="true"
      aria-labelledby="seed-library-title"
      @keydown.escape.prevent="emit('close')"
    >
      <button type="button" class="backdrop" aria-label="Close" @click="emit('close')" />
      <div class="panel">
        <h2 id="seed-library-title" class="title">Load into library</h2>
        <p class="lead">
          Choose Lilly Marlene and any golden songs. Charts already in the library stay as they
          are.
        </p>
        <p v-if="loadError" class="err" role="alert">{{ loadError }}</p>

        <div class="scroll">
        <section v-if="tags.length" class="group" aria-label="Tag">
          <h3>Tag</h3>
          <ul>
            <li v-for="offer in tags" :key="offer.id">
              <label :class="{ here: present.has(offer.id) }">
                <input
                  type="checkbox"
                  :checked="present.has(offer.id) || selected.has(offer.id)"
                  :disabled="present.has(offer.id) || busy"
                  @change="toggle(offer.id)"
                />
                <span class="name">{{ offer.label }}</span>
                <span v-if="present.has(offer.id)" class="here-label">In library</span>
              </label>
            </li>
          </ul>
        </section>

        <section class="group" aria-label="Golden songs">
          <div class="group-head">
            <h3>Golden songs</h3>
            <div class="group-actions">
              <button type="button" class="text-btn" :disabled="busy" @click="selectAllSongs">
                Select all
              </button>
              <button type="button" class="text-btn" :disabled="busy" @click="clearSongs">
                Clear
              </button>
            </div>
          </div>
          <p v-if="!songs.length" class="muted">No golden songs are available.</p>
          <ul v-else>
            <li v-for="offer in songs" :key="offer.id">
              <label :class="{ here: present.has(offer.id) }">
                <input
                  type="checkbox"
                  :checked="present.has(offer.id) || selected.has(offer.id)"
                  :disabled="present.has(offer.id) || busy"
                  @change="toggle(offer.id)"
                />
                <span class="name">{{ offer.label }}</span>
                <span v-if="present.has(offer.id)" class="here-label">In library</span>
              </label>
            </li>
          </ul>
        </section>
        </div>

        <div class="actions">
          <button type="button" class="btn" :disabled="busy" @click="emit('close')">Cancel</button>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="busy || selectedCount === 0"
            @click="submit"
          >
            {{ busy ? 'Adding…' : selectedCount ? `Add ${selectedCount}` : 'Add' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
.seed-root {
  position: fixed;
  inset: 0;
  z-index: 110;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  padding-bottom: calc(1rem + var(--bottom-nav-h, 3.75rem) + env(safe-area-inset-bottom));
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
  width: min(28rem, 100%);
  max-height: min(
    36rem,
    calc(100dvh - 2rem - var(--bottom-nav-h, 3.75rem) - env(safe-area-inset-bottom))
  );
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1.1rem 1.15rem 1.15rem;
  border-radius: var(--radius, 12px);
  border: 1px solid var(--border);
  background: var(--surface);
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.2);
}
.title,
.lead,
.err,
.actions {
  flex: none;
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.15rem;
  line-height: 1.25;
}
.lead,
.muted {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}
.err {
  margin: 0;
  color: var(--danger, #b42318);
  font-size: 0.9rem;
}
.scroll {
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
  display: grid;
  gap: 0.75rem;
}
.group {
  display: grid;
  gap: 0.35rem;
}
.group-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}
.group h3 {
  margin: 0;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--muted);
}
.group-actions {
  display: flex;
  gap: 0.65rem;
}
.text-btn {
  border: 0;
  background: none;
  padding: 0;
  color: var(--accent);
  font: inherit;
  font-size: 0.85rem;
  font-weight: 600;
  cursor: pointer;
}
.text-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
ul {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.15rem;
}
label {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.4rem;
  padding: 0.15rem 0.2rem;
  cursor: pointer;
}
label.here {
  cursor: default;
  color: var(--muted);
}
input {
  width: 1.05rem;
  height: 1.05rem;
  margin: 0;
  accent-color: var(--accent);
}
.name {
  flex: 1 1 auto;
  min-width: 0;
}
.here-label {
  font-size: 0.78rem;
  color: var(--muted);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.5rem;
}
</style>
