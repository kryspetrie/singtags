<script setup lang="ts">
/**
 * Tag Roll project list (Labs).
 */
import { onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { useTagRollStore } from '../stores/tagRoll'

const store = useTagRollStore()
const router = useRouter()

onMounted(() => {
  void store.refreshList()
})

async function onCreate(): Promise<void> {
  const p = await store.createProject()
  await router.push({ name: 'tag-roll-edit', params: { id: p.id } })
}

async function onDelete(id: string, title: string): Promise<void> {
  if (!confirm(`Delete “${title}”? This cannot be undone.`)) return
  await store.removeProject(id)
}

function fmtDate(ms: number): string {
  try {
    return new Date(ms).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    })
  } catch {
    return ''
  }
}
</script>

<template>
  <section class="tr-list" aria-label="Tag Roll projects">
    <header class="head">
      <div class="head-text">
        <p class="crumb">
          <RouterLink to="/labs">Labs</RouterLink>
          <span aria-hidden="true"> / </span>
          Tag Roll
        </p>
        <h1 class="title">Tag Roll</h1>
        <p class="lead">
          Sketch original tags on a piano-roll grid. Projects stay on this device.
        </p>
      </div>
      <button type="button" class="btn btn-primary" @click="onCreate">New project</button>
    </header>

    <p v-if="store.error" class="err" role="alert">{{ store.error }}</p>

    <ul v-if="store.summaries.length" class="list" role="list">
      <li v-for="s in store.summaries" :key="s.id" class="row">
        <RouterLink class="row-main" :to="{ name: 'tag-roll-edit', params: { id: s.id } }">
          <span class="row-title">{{ s.title }}</span>
          <span class="row-meta">
            {{ s.bpm }} BPM · {{ s.noteCount }} note{{ s.noteCount === 1 ? '' : 's' }} ·
            {{ fmtDate(s.updatedAt) }}
          </span>
        </RouterLink>
        <button
          type="button"
          class="btn ghost"
          :aria-label="`Delete ${s.title}`"
          @click="onDelete(s.id, s.title)"
        >
          Delete
        </button>
      </li>
    </ul>
    <p v-else-if="store.loaded" class="empty">
      No projects yet. Create one to open the piano roll.
    </p>
  </section>
</template>

<style scoped>
.tr-list {
  display: grid;
  gap: 1rem;
  max-width: 42rem;
  padding: 0.25rem 0 2rem;
}
.head {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
}
.head-text {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
}
.crumb {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
}
.crumb a {
  color: var(--accent);
}
.title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.65rem;
  line-height: 1.15;
}
.lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
.err {
  margin: 0;
  color: var(--danger, #b42318);
}
.list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.45rem;
}
.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.65rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}
.row-main {
  flex: 1 1 auto;
  min-width: 0;
  display: grid;
  gap: 0.15rem;
  text-decoration: none;
  color: inherit;
}
.row-title {
  font-weight: 650;
}
.row-meta {
  font-size: 0.82rem;
  color: var(--muted);
}
.empty {
  margin: 0;
  color: var(--muted);
}
.btn {
  min-height: 40px;
  padding: 0.4rem 0.85rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 600;
  cursor: pointer;
  text-decoration: none;
}
.btn-primary {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--on-accent, #fff);
}
.btn.ghost {
  border-color: transparent;
  background: transparent;
  font-weight: 500;
  color: var(--muted);
}
</style>
