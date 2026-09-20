<script setup lang="ts">
/**
 * Tag Studio project list.
 */
import { onMounted } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import { tagRollTip } from '../lib/tagRoll/shortcuts'
import { useTagRollStore } from '../stores/tagRoll'
import { useSnackbarStore } from '../stores/snackbar'

const store = useTagRollStore()
const router = useRouter()
const snackbar = useSnackbarStore()

onMounted(() => {
  void store.refreshList()
})

async function onCreate(): Promise<void> {
  try {
    const p = await store.createProject()
    await router.push({ name: 'tag-studio-edit', params: { id: p.id } })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Failed to create project'
    snackbar.show(msg, { title: 'Error', tone: 'error', ms: 4000 })
    console.error('Failed to create project:', e)
  }
}

async function onDelete(id: string, title: string): Promise<void> {
  snackbar.show(`"${title}" deleted`, { title: 'Project deleted', tone: 'ok', ms: 2000 })
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
  <section class="tr-list" aria-label="Tag Studio projects">
    <header class="head">
      <div class="head-text">
        <p class="crumb">
          <RouterLink to="/labs">Labs</RouterLink>
          <span aria-hidden="true"> → </span>
          Tag Studio
        </p>
        <h1 class="title">Tag Studio</h1>
        <p class="lead">
          Create and arrange custom tag arrangements on a piano-roll grid.
        </p>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        :title="tagRollTip('Create a new Tag Studio project')"
        @click="onCreate"
      >
        New project
      </button>
    </header>

    <p v-if="store.error" class="err" role="alert">{{ store.error }}</p>

    <ul v-if="store.summaries.length" class="list" role="list">
      <li v-for="s in store.summaries" :key="s.id" class="row">
        <RouterLink
          class="row-main"
          :to="{ name: 'tag-studio-edit', params: { id: s.id } }"
          :title="tagRollTip(`Open ${s.title}`)"
        >
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
          :title="tagRollTip(`Delete ${s.title}`)"
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
  font-size: 0.85rem;
  color: var(--muted);
}
.empty {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
}
</style>
