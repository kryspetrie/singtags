<script setup lang="ts">
/**
 * Edit title / credits / footer for Tag Studio sheet view.
 */
import { ref, watch } from 'vue'
import type { TagRollProject } from '../../lib/tagRoll/types'
import { useTagRollStore } from '../../stores/tagRoll'

const props = defineProps<{
  project: TagRollProject
}>()

const emit = defineEmits<{
  close: []
}>()

const store = useTagRollStore()
const title = ref('')
const subtitle = ref('')
const composer = ref('')
const arranger = ref('')
const sheetNote = ref('')

function syncFromProject(): void {
  const p = props.project
  title.value = p.title ?? ''
  subtitle.value = p.subtitle ?? ''
  composer.value = p.composer ?? ''
  arranger.value = p.arranger ?? ''
  sheetNote.value = p.sheetNote ?? ''
}

watch(
  () => props.project.id,
  () => syncFromProject(),
  { immediate: true },
)

function commit(): void {
  store.patchProject({
    title: (title.value.trim() || 'Untitled tag').slice(0, 120),
    subtitle: subtitle.value.trim().slice(0, 120),
    composer: composer.value.trim().slice(0, 120),
    arranger: arranger.value.trim().slice(0, 120),
    sheetNote: sheetNote.value.trim().slice(0, 400),
  })
  syncFromProject()
}

function onSave(): void {
  commit()
  emit('close')
}
</script>

<template>
  <section class="meta-panel" aria-label="Sheet metadata">
    <header class="head">
      <h3 class="title">Metadata</h3>
      <button type="button" class="close" title="Close" @click="emit('close')">✕</button>
    </header>
    <div class="fields">
      <label class="field">
        <span>Title</span>
        <input v-model="title" type="text" maxlength="120" aria-label="Title" @change="commit" />
      </label>
      <label class="field">
        <span>Subtitle</span>
        <input
          v-model="subtitle"
          type="text"
          maxlength="120"
          aria-label="Subtitle"
          @change="commit"
        />
      </label>
      <label class="field">
        <span>Composer</span>
        <input
          v-model="composer"
          type="text"
          maxlength="120"
          aria-label="Composer"
          @change="commit"
        />
      </label>
      <label class="field">
        <span>Arranger</span>
        <input
          v-model="arranger"
          type="text"
          maxlength="120"
          aria-label="Arranger"
          @change="commit"
        />
      </label>
      <label class="field">
        <span>Footer note</span>
        <input
          v-model="sheetNote"
          type="text"
          maxlength="400"
          aria-label="Footer note"
          @change="commit"
        />
      </label>
    </div>
    <footer class="foot">
      <button type="button" class="btn" @click="onSave">Done</button>
    </footer>
  </section>
</template>

<style scoped>
.meta-panel {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  height: 100%;
  min-height: 0;
  padding: 0.4rem 0.5rem 0.55rem;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 750;
}
.close {
  width: 1.7rem;
  height: 1.7rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  cursor: pointer;
}
.fields {
  display: grid;
  gap: 0.55rem;
  flex: 1 1 auto;
  min-height: 0;
  overflow: auto;
}
.field {
  display: grid;
  gap: 0.2rem;
  font-size: 0.78rem;
  color: var(--muted);
}
.field input {
  font: inherit;
  font-size: 0.9rem;
  color: var(--text);
  padding: 0.4rem 0.5rem;
  border-radius: 6px;
  border: 1px solid var(--border);
  background: var(--surface);
}
.foot {
  border-top: 1px solid var(--border);
  padding-top: 0.4rem;
}
.btn {
  width: 100%;
  min-height: 36px;
  font: inherit;
  font-weight: 650;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--accent);
  color: var(--on-accent, #fff);
  cursor: pointer;
}
</style>
