/**
 * Tag Roll projects — list, open, create, save (debounced).
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import {
  createEmptyTagRollProject,
  normalizeTagRollProject,
} from '../lib/tagRoll/normalize'
import type { TagRollProject, TagRollViewPrefs } from '../lib/tagRoll/types'
import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
} from '../lib/tagRoll/types'
import {
  deleteTagRollProject,
  getTagRollProject,
  listTagRollProjects,
  putTagRollProject,
  type TagRollProjectSummary,
} from '../offline/tagRollDb'

export const useTagRollStore = defineStore('tagRoll', () => {
  const summaries = ref<TagRollProjectSummary[]>([])
  const current = shallowRef<TagRollProject | null>(null)
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const notesByPartId = computed(() => {
    const p = current.value
    const map = new Map<string, TagRollProject['notes']>()
    if (!p) return map
    for (const part of p.parts) map.set(part.id, [])
    for (const n of p.notes) {
      const list = map.get(n.partId)
      if (list) list.push(n)
      else map.set(n.partId, [n])
    }
    return map
  })

  async function refreshList(): Promise<void> {
    try {
      summaries.value = await listTagRollProjects()
      loaded.value = true
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load Tag Roll projects'
      loaded.value = true
    }
  }

  async function openProject(id: string): Promise<TagRollProject | null> {
    busy.value = true
    try {
      const p = await getTagRollProject(id)
      current.value = p
      error.value = null
      return p
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to open project'
      current.value = null
      return null
    } finally {
      busy.value = false
    }
  }

  async function createProject(title?: string): Promise<TagRollProject> {
    const p = createEmptyTagRollProject({ title })
    await putTagRollProject(p)
    current.value = p
    await refreshList()
    return p
  }

  function scheduleSave(): void {
    if (!current.value) return
    if (saveTimer) clearTimeout(saveTimer)
    saveTimer = setTimeout(() => {
      saveTimer = null
      void persistNow()
    }, 400)
  }

  async function persistNow(): Promise<void> {
    const p = current.value
    if (!p) return
    try {
      const next = { ...p, updatedAt: Date.now() }
      await putTagRollProject(next)
      current.value = normalizeTagRollProject(next)
      await refreshList()
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save project'
    }
  }

  function patchProject(patch: Partial<TagRollProject>): void {
    const p = current.value
    if (!p) return
    current.value = { ...p, ...patch, updatedAt: Date.now() }
    scheduleSave()
  }

  function patchView(patch: Partial<TagRollViewPrefs>): void {
    const p = current.value
    if (!p) return
    current.value = {
      ...p,
      view: { ...p.view, ...patch },
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function nudgeCellW(delta: number): void {
    const p = current.value
    if (!p) return
    const cellW = Math.max(
      TAG_ROLL_CELL_W_MIN,
      Math.min(TAG_ROLL_CELL_W_MAX, p.view.cellW + delta),
    )
    patchView({ cellW })
  }

  function nudgeCellH(delta: number): void {
    const p = current.value
    if (!p) return
    const cellH = Math.max(
      TAG_ROLL_CELL_H_MIN,
      Math.min(TAG_ROLL_CELL_H_MAX, p.view.cellH + delta),
    )
    patchView({ cellH })
  }

  function setLockPiano(on: boolean): void {
    patchView({ lockPiano: on })
  }

  function setScroll(scrollX: number, scrollY: number): void {
    patchView({
      scrollX: Math.max(0, scrollX),
      scrollY: Math.max(0, scrollY),
    })
  }

  function setPlayheadTick(tick: number): void {
    patchView({ playheadTick: Math.max(0, Math.round(tick)) })
  }

  async function removeProject(id: string): Promise<void> {
    await deleteTagRollProject(id)
    if (current.value?.id === id) current.value = null
    await refreshList()
  }

  function clearCurrent(): void {
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    current.value = null
  }

  return {
    summaries,
    current,
    loaded,
    busy,
    error,
    notesByPartId,
    refreshList,
    openProject,
    createProject,
    persistNow,
    patchProject,
    patchView,
    nudgeCellW,
    nudgeCellH,
    setLockPiano,
    setScroll,
    setPlayheadTick,
    removeProject,
    clearCurrent,
  }
})
