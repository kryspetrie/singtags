<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import EmptyState from '../components/EmptyState.vue'
import FilterSheet from '../components/FilterSheet.vue'
import { useStarsStore } from '../stores/stars'
import { usePracticeStore } from '../stores/practice'
import { useOnline } from '../composables/useOnline'

const stars = useStarsStore()
const practice = usePracticeStore()
const { offline } = useOnline()
const router = useRouter()
const fileInput = ref<HTMLInputElement | null>(null)
const fetchMediaOnImport = ref(false)
const backupOpen = ref(false)

const orderedRecords = computed(() => {
  const byId = new Map(stars.records.map((r) => [r.tagId, r]))
  return practice.order.map((id) => byId.get(id)).filter(Boolean)
})

onMounted(async () => {
  await stars.ensureLoaded()
  practice.syncFromStarred(stars.records.map((r) => r.tagId))
})

watch(
  () => stars.records.map((r) => r.tagId).join(','),
  () => {
    practice.syncFromStarred(stars.records.map((r) => r.tagId))
  },
)

function downloadStarredFile(): void {
  const data = stars.exportFile()
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'starred.tags'
  a.click()
  URL.revokeObjectURL(url)
}

async function onImportFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    const text = await file.text()
    await stars.importFromJson(JSON.parse(text), fetchMediaOnImport.value && !offline.value)
    backupOpen.value = false
  } catch (err) {
    stars.error = err instanceof Error ? err.message : String(err)
  } finally {
    input.value = ''
  }
}

async function refreshOne(tagId: number): Promise<void> {
  await stars.updateOfflineMedia(tagId, null)
}

function startPractice(): void {
  practice.syncFromStarred(stars.records.map((r) => r.tagId))
  const first = practice.firstId()
  if (first == null) return
  void router.push({ path: `/tag/${first}`, query: { set: 'practice' } })
}

function resetOrder(): void {
  practice.resetFromStarred(stars.records.map((r) => r.tagId))
}
</script>

<template>
  <section class="starred" aria-labelledby="starred-heading">
    <header class="head">
      <h1 id="starred-heading">Starred</h1>
      <p class="muted">
        Offline favorites on this device. Reorder the list, then start a practice set that auto-advances
        through tags.
        <RouterLink to="/settings">Offline library settings</RouterLink>
      </p>
    </header>

    <div class="actions">
      <button
        type="button"
        class="primary"
        :disabled="!stars.count"
        @click="startPractice"
      >
        Start practice
      </button>
      <button type="button" :disabled="!stars.count" @click="resetOrder">Reset order</button>
      <button
        type="button"
        class="toggle-btn"
        :class="{ on: practice.autoAdvance }"
        :aria-pressed="practice.autoAdvance"
        @click="practice.autoAdvance = !practice.autoAdvance"
      >
        Auto-advance
      </button>
      <button type="button" @click="backupOpen = true">Backup &amp; restore</button>
    </div>

    <div v-if="stars.progress" class="progress" role="status">
      <div class="bar" :style="{ width: `${Math.round(stars.progress.ratio * 100)}%` }" />
      <span>{{ stars.progress.label }}</span>
    </div>
    <p v-if="stars.lastMessage" class="ok" role="status">{{ stars.lastMessage }}</p>
    <p v-if="stars.error" class="error" role="alert">{{ stars.error }}</p>

    <EmptyState
      v-if="!stars.records.length"
      title="No starred tags yet"
      message="Star from Browse or a tag page to save for quick recall, offline use, and practice sets."
    />

    <ol v-else class="list">
      <li v-for="(r, i) in orderedRecords" :key="r!.tagId">
        <div class="reorder">
          <button
            type="button"
            :disabled="i === 0"
            :aria-label="`Move ${r!.summary.title || r!.tagId} up`"
            @click="practice.move(r!.tagId, -1)"
          >
            ↑
          </button>
          <button
            type="button"
            :disabled="i === orderedRecords.length - 1"
            :aria-label="`Move ${r!.summary.title || r!.tagId} down`"
            @click="practice.move(r!.tagId, 1)"
          >
            ↓
          </button>
        </div>
        <RouterLink :to="{ path: `/tag/${r!.tagId}`, query: { set: 'practice' } }" class="card">
          <span class="title"
            ><span class="num">{{ i + 1 }}.</span> {{ r!.summary.title || `Tag ${r!.tagId}` }}</span
          >
          <span class="meta">
            <span v-if="r!.summary.key">{{ r!.summary.key }}</span>
            <span v-if="r!.summary.arranger">{{ r!.summary.arranger }}</span>
            <span class="badge" :data-on="!!(r!.audioBlobs && Object.keys(r!.audioBlobs).length)">{{
              r!.audioBlobs && Object.keys(r!.audioBlobs).length
                ? 'Audio offline'
                : r!.offlineMedia
                  ? 'Sheets offline'
                  : 'Metadata'
            }}</span>
          </span>
        </RouterLink>
        <button
          v-if="!offline"
          type="button"
          class="refresh"
          :disabled="stars.busy"
          :aria-label="`Update offline media for ${r!.summary.title || r!.tagId}`"
          @click="refreshOne(r!.tagId)"
        >
          ↻
        </button>
        <button
          type="button"
          class="unstar"
          :aria-label="`Unstar ${r!.summary.title || r!.tagId}`"
          @click="stars.unstar(r!.tagId)"
        >
          ★
        </button>
      </li>
    </ol>

    <FilterSheet :open="backupOpen" title="Backup & restore" @close="backupOpen = false">
      <div class="backup">
        <p class="backup-desc">
          Your starred list lives in this browser only. <strong>Backup</strong> downloads a
          <code>starred.tags</code> file with your tags and practice order so you can keep a copy or
          move it to another device. <strong>Restore</strong> replaces the list on this device from
          that file. Optionally fetch sheet and audio media during restore so tags work offline right
          away.
        </p>
        <div class="backup-actions">
          <span
            class="backup-tip"
            :title="
              stars.count
                ? undefined
                : 'Star at least one tag before backing up — there’s nothing to export yet.'
            "
          >
            <button
              type="button"
              class="primary"
              :disabled="!stars.count"
              :aria-disabled="!stars.count"
              @click="downloadStarredFile"
            >
              Backup starred list
            </button>
          </span>
          <button type="button" @click="fileInput?.click()">Restore from file…</button>
          <button
            type="button"
            class="toggle-btn"
            :class="{ on: fetchMediaOnImport }"
            :aria-pressed="fetchMediaOnImport"
            :disabled="offline"
            @click="fetchMediaOnImport = !fetchMediaOnImport"
          >
            Fetch media on restore
          </button>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".tags,application/json,.json"
          class="sr"
          @change="onImportFile"
        />
      </div>
    </FilterSheet>
  </section>
</template>

<style scoped>
.head h1 {
  font-family: var(--font-display);
  margin: 0 0 0.35rem;
  font-size: clamp(1.6rem, 5vw, 2rem);
}
.muted {
  color: var(--muted);
  margin: 0 0 1rem;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 1rem;
  align-items: center;
}
.actions button {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
}
.actions .primary,
.backup-actions .primary {
  background: var(--accent);
  color: #fff;
  border-color: var(--accent);
}
.backup-actions .primary:disabled {
  background: color-mix(in srgb, var(--muted) 35%, var(--surface));
  color: var(--muted);
  border-color: var(--border);
  cursor: not-allowed;
  opacity: 1;
}
.backup-tip {
  display: inline-flex;
}
.backup-tip:has(button:disabled) {
  cursor: not-allowed;
}
.toggle-btn {
  min-height: 48px;
  padding: 0.55rem 1rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
  font-weight: 600;
}
.toggle-btn.on {
  background: color-mix(in srgb, var(--accent) 16%, var(--surface));
  border-color: var(--accent);
  color: var(--accent-hover);
}
.toggle-btn:disabled {
  opacity: 0.5;
}
.backup {
  display: grid;
  gap: 1rem;
  padding: 0.25rem 0 0.5rem;
}
.backup-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.95rem;
  line-height: 1.45;
}
.backup-desc strong {
  color: var(--text);
  font-weight: 600;
}
.backup-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  align-items: center;
}
.backup-actions button {
  min-height: 44px;
  padding: 0.55rem 0.9rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: var(--surface);
  font: inherit;
}
.progress {
  display: grid;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
  font-size: 0.9rem;
  color: var(--muted);
}
.bar {
  height: 4px;
  border-radius: 2px;
  background: var(--accent);
}
.list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: grid;
  gap: 0.5rem;
}
li {
  display: grid;
  grid-template-columns: auto 1fr auto auto;
  gap: 0.4rem;
  align-items: stretch;
}
.reorder {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.reorder button {
  min-width: 40px;
  min-height: 36px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
}
.reorder button:disabled {
  opacity: 0.35;
}
.card {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.9rem 1rem;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: inherit;
  text-decoration: none;
  min-height: 44px;
}
.title {
  font-weight: 600;
}
.num {
  color: var(--muted);
  font-weight: 500;
  margin-right: 0.15rem;
}
.meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
  color: var(--muted);
  font-size: 0.9rem;
}
.badge {
  color: var(--muted);
}
.badge[data-on='true'] {
  color: var(--accent);
  font-weight: 600;
}
.refresh,
.unstar {
  min-width: 44px;
  min-height: 44px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
  color: var(--accent);
  font-size: 1.2rem;
}
.ok {
  color: var(--accent);
}
.error {
  color: var(--danger);
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
}
code {
  font-size: 0.9em;
}
</style>
