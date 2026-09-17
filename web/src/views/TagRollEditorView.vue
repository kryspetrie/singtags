<script setup lang="ts">
/**
 * Tag Roll editor shell — Phase 1: grid, tote, pan, lock, cell size.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRouter } from 'vue-router'
import TagRollTote from '../components/tagRoll/TagRollTote.vue'
import TagRollViewport from '../components/tagRoll/TagRollViewport.vue'
import { useTagRollStore } from '../stores/tagRoll'

const props = defineProps<{ id: string }>()

const store = useTagRollStore()
const router = useRouter()
const viewportRef = ref<InstanceType<typeof TagRollViewport> | null>(null)
const stageH = ref(420)

const project = computed(() => store.current)
const titleDraft = ref('')

onMounted(async () => {
  const p = await store.openProject(props.id)
  if (!p) {
    await router.replace({ name: 'tag-roll' })
    return
  }
  titleDraft.value = p.title
})

onUnmounted(() => {
  void store.persistNow()
  store.clearCurrent()
})

watch(
  () => props.id,
  async (id) => {
    const p = await store.openProject(id)
    if (!p) await router.replace({ name: 'tag-roll' })
    else titleDraft.value = p.title
  },
)

function onTitleBlur(): void {
  const t = titleDraft.value.trim() || 'Untitled tag'
  titleDraft.value = t
  if (project.value && t !== project.value.title) {
    store.patchProject({ title: t })
  }
}

function onScroll(x: number, y: number): void {
  store.setScroll(x, y)
}

function onScrollY(y: number): void {
  if (!project.value) return
  store.setScroll(project.value.view.scrollX, y)
}

function onPlayhead(tick: number): void {
  store.setPlayheadTick(tick)
}
</script>

<template>
  <section v-if="project" class="tr-ed" aria-label="Tag Roll editor">
    <header class="chrome">
      <div class="chrome-left">
        <RouterLink class="back" to="/labs/tag-roll">← Projects</RouterLink>
        <input
          v-model="titleDraft"
          class="title-input"
          aria-label="Project title"
          @blur="onTitleBlur"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </div>
      <div class="chrome-right" role="group" aria-label="Grid size">
        <span class="lbl">Width</span>
        <button type="button" class="btn sm" aria-label="Narrower cells" @click="store.nudgeCellW(-2)">
          −
        </button>
        <button type="button" class="btn sm" aria-label="Wider cells" @click="store.nudgeCellW(2)">
          +
        </button>
        <span class="lbl">Height</span>
        <button type="button" class="btn sm" aria-label="Shorter cells" @click="store.nudgeCellH(-1)">
          −
        </button>
        <button type="button" class="btn sm" aria-label="Taller cells" @click="store.nudgeCellH(1)">
          +
        </button>
        <label class="lock">
          <input
            type="checkbox"
            :checked="project.view.lockPiano"
            @change="store.setLockPiano(($event.target as HTMLInputElement).checked)"
          />
          Lock piano
        </label>
      </div>
    </header>

    <p v-if="store.error" class="err" role="alert">{{ store.error }}</p>

    <div class="stage" :style="{ height: `${stageH}px` }">
      <TagRollTote
        :project="project"
        :viewport-height="viewportRef?.cssH ?? stageH"
        @scroll-y="onScrollY"
      />
      <TagRollViewport
        ref="viewportRef"
        :project="project"
        @scroll="onScroll"
        @playhead="onPlayhead"
      />
    </div>

    <p class="hint">
      Phase 1 shell — drag to pan, click to set the playhead, click tote keys to hear pitches. Note
      editing comes next.
    </p>
  </section>
  <p v-else class="loading">Loading…</p>
</template>

<style scoped>
.tr-ed {
  display: grid;
  gap: 0.65rem;
  min-height: 0;
  padding-bottom: 1.5rem;
}
.chrome {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.65rem;
}
.chrome-left {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
  min-width: 0;
}
.back {
  color: var(--accent);
  text-decoration: none;
  font-weight: 600;
  font-size: 0.9rem;
  white-space: nowrap;
}
.title-input {
  min-width: 10rem;
  max-width: min(20rem, 60vw);
  min-height: 40px;
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  font-size: 1.05rem;
}
.chrome-right {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
}
.lbl {
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
  margin-left: 0.25rem;
}
.lock {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin-left: 0.45rem;
  font-size: 0.9rem;
  font-weight: 550;
  cursor: pointer;
  user-select: none;
}
.btn {
  min-height: 36px;
  min-width: 36px;
  padding: 0.25rem 0.55rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--surface);
  color: var(--text);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.btn.sm {
  min-height: 34px;
  min-width: 34px;
}
.stage {
  display: flex;
  min-height: 280px;
  max-height: min(70vh, 640px);
  border: 1px solid var(--border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--surface);
}
.err {
  margin: 0;
  color: var(--danger, #b42318);
}
.hint,
.loading {
  margin: 0;
  color: var(--muted);
  font-size: 0.9rem;
}
</style>
