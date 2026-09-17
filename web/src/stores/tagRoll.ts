/**
 * Tag Roll projects — list, open, create, save, note CRUD.
 */
import { defineStore } from 'pinia'
import { computed, ref, shallowRef } from 'vue'
import { newLocalId } from '../offline/localLibraryDb'
import {
  createEmptyTagRollProject,
  normalizeTagRollProject,
} from '../lib/tagRoll/normalize'
import { ensureLengthForNote, snapTick } from '../lib/tagRoll/snap'
import type {
  TagRollEditorMode,
  TagRollNote,
  TagRollPart,
  TagRollProject,
  TagRollViewPrefs,
} from '../lib/tagRoll/types'
import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_DEFAULT_SNAP_TICKS,
  TAG_ROLL_MIDI_MAX,
  TAG_ROLL_MIDI_MIN,
  TAG_ROLL_PPQ,
} from '../lib/tagRoll/types'
import {
  deleteTagRollProject,
  getTagRollProject,
  listTagRollProjects,
  putTagRollProject,
  type TagRollProjectSummary,
} from '../offline/tagRollDb'
import { usePreferencesStore } from './preferences'

export const useTagRollStore = defineStore('tagRoll', () => {
  const summaries = ref<TagRollProjectSummary[]>([])
  const current = shallowRef<TagRollProject | null>(null)
  const loaded = ref(false)
  const busy = ref(false)
  const error = ref<string | null>(null)
  const selectedNoteId = ref<string | null>(null)
  const addDurationTicks = ref(TAG_ROLL_PPQ)
  const transportPlaying = ref(false)

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  const notesByPartId = computed(() => {
    const p = current.value
    const map = new Map<string, TagRollNote[]>()
    if (!p) return map
    for (const part of p.parts) map.set(part.id, [])
    for (const n of p.notes) {
      const list = map.get(n.partId)
      if (list) list.push(n)
      else map.set(n.partId, [n])
    }
    return map
  })

  const selectedNote = computed(() => {
    const id = selectedNoteId.value
    if (!id || !current.value) return null
    return current.value.notes.find((n) => n.id === id) ?? null
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
      selectedNoteId.value = null
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
    const prefs = usePreferencesStore()
    const p = createEmptyTagRollProject({ title })
    const cellW = Math.max(
      TAG_ROLL_CELL_W_MIN,
      Math.min(TAG_ROLL_CELL_W_MAX, Math.round(prefs.tagRollCellW)),
    )
    const cellH = Math.max(
      TAG_ROLL_CELL_H_MIN,
      Math.min(TAG_ROLL_CELL_H_MAX, Math.round(prefs.tagRollCellH)),
    )
    p.view.cellW = cellW
    p.view.cellH = cellH
    p.view.scrollY = (TAG_ROLL_MIDI_MAX - 60) * cellH
    await putTagRollProject(p)
    current.value = p
    selectedNoteId.value = null
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

  function setMode(mode: TagRollEditorMode): void {
    if (mode !== 'edit') selectedNoteId.value = null
    patchView({ mode })
  }

  function setActivePart(partId: string): void {
    patchView({ activePartId: partId })
  }

  function setCellSize(cellW: number, cellH: number): void {
    const w = Math.max(TAG_ROLL_CELL_W_MIN, Math.min(TAG_ROLL_CELL_W_MAX, cellW))
    const h = Math.max(TAG_ROLL_CELL_H_MIN, Math.min(TAG_ROLL_CELL_H_MAX, cellH))
    patchView({ cellW: w, cellH: h })
    usePreferencesStore().setTagRollCellSize(w, h)
  }

  function nudgeCellW(delta: number): void {
    const p = current.value
    if (!p) return
    setCellSize(p.view.cellW + delta, p.view.cellH)
  }

  function nudgeCellH(delta: number): void {
    const p = current.value
    if (!p) return
    setCellSize(p.view.cellW, p.view.cellH + delta)
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
    const p = current.value
    const max = p?.lengthTicks ?? 0
    patchView({ playheadTick: Math.max(0, Math.min(max, Math.round(tick))) })
  }

  function setBpm(bpm: number): void {
    patchProject({ bpm: Math.max(40, Math.min(240, Math.round(bpm))) })
  }

  function setSoundEngine(soundEngine: TagRollProject['soundEngine']): void {
    patchProject({ soundEngine })
  }

  function addNote(partial: {
    midi: number
    startTick: number
    durationTicks?: number
    partId?: string
  }): TagRollNote | null {
    const p = current.value
    if (!p) return null
    const partId = partial.partId ?? p.view.activePartId ?? p.parts[0]?.id
    if (!partId) return null
    const snap = p.snapTicks || TAG_ROLL_DEFAULT_SNAP_TICKS
    const startTick = snapTick(partial.startTick, snap)
    const durationTicks = Math.max(
      snap,
      partial.durationTicks ?? addDurationTicks.value,
    )
    const midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(partial.midi)))
    const note: TagRollNote = {
      id: newLocalId('trn'),
      partId,
      midi,
      startTick,
      durationTicks,
    }
    const lengthTicks = ensureLengthForNote(p.lengthTicks, startTick, durationTicks)
    current.value = {
      ...p,
      notes: [...p.notes, note],
      lengthTicks,
      updatedAt: Date.now(),
    }
    selectedNoteId.value = note.id
    scheduleSave()
    return note
  }

  function updateNote(id: string, patch: Partial<TagRollNote>): void {
    const p = current.value
    if (!p) return
    const notes = p.notes.map((n) => {
      if (n.id !== id) return n
      const next = { ...n, ...patch }
      next.midi = Math.max(TAG_ROLL_MIDI_MIN, Math.min(TAG_ROLL_MIDI_MAX, Math.round(next.midi)))
      next.startTick = Math.max(0, Math.round(next.startTick))
      next.durationTicks = Math.max(1, Math.round(next.durationTicks))
      return next
    })
    const hit = notes.find((n) => n.id === id)
    const lengthTicks = hit
      ? ensureLengthForNote(p.lengthTicks, hit.startTick, hit.durationTicks)
      : p.lengthTicks
    current.value = { ...p, notes, lengthTicks, updatedAt: Date.now() }
    scheduleSave()
  }

  function deleteNote(id: string): void {
    const p = current.value
    if (!p) return
    current.value = {
      ...p,
      notes: p.notes.filter((n) => n.id !== id),
      updatedAt: Date.now(),
    }
    if (selectedNoteId.value === id) selectedNoteId.value = null
    scheduleSave()
  }

  function selectNote(id: string | null): void {
    selectedNoteId.value = id
    if (id && current.value?.view.mode === 'view') {
      patchView({ mode: 'edit' })
    }
  }

  function upsertHarmonyNotes(opts: {
    leadNoteId: string
    tenorMidi: number
    bariMidi: number
    bassMidi: number
  }): void {
    const p = current.value
    if (!p) return
    const lead = p.notes.find((n) => n.id === opts.leadNoteId)
    if (!lead) return
    const byName = (name: string) => p.parts.find((x) => x.name === name)
    const tenorPart = byName('Tenor')
    const bariPart = byName('Bari')
    const bassPart = byName('Bass')
    if (!tenorPart || !bariPart || !bassPart) return

    const targets: { partId: string; midi: number }[] = [
      { partId: tenorPart.id, midi: opts.tenorMidi },
      { partId: bariPart.id, midi: opts.bariMidi },
      { partId: bassPart.id, midi: opts.bassMidi },
    ]
    let notes = [...p.notes]
    for (const t of targets) {
      const idx = notes.findIndex(
        (n) =>
          n.partId === t.partId &&
          n.startTick === lead.startTick &&
          n.durationTicks === lead.durationTicks,
      )
      if (idx >= 0) {
        notes[idx] = { ...notes[idx]!, midi: t.midi }
      } else {
        notes.push({
          id: newLocalId('trn'),
          partId: t.partId,
          midi: t.midi,
          startTick: lead.startTick,
          durationTicks: lead.durationTicks,
        })
      }
    }
    current.value = { ...p, notes, updatedAt: Date.now() }
    scheduleSave()
  }

  function addPart(name: string, color: string): void {
    const p = current.value
    if (!p) return
    const part: TagRollPart = {
      id: newLocalId('trp'),
      name: name.trim() || 'Part',
      color,
      midiGroup: 'solo',
    }
    current.value = { ...p, parts: [...p.parts, part], updatedAt: Date.now() }
    scheduleSave()
  }

  function updatePart(id: string, patch: Partial<TagRollPart>): void {
    const p = current.value
    if (!p) return
    current.value = {
      ...p,
      parts: p.parts.map((x) => (x.id === id ? { ...x, ...patch } : x)),
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function removePart(id: string): void {
    const p = current.value
    if (!p || p.parts.length <= 1) return
    const parts = p.parts.filter((x) => x.id !== id)
    const notes = p.notes.filter((n) => n.partId !== id)
    const activePartId =
      p.view.activePartId === id ? parts[0]?.id ?? null : p.view.activePartId
    current.value = {
      ...p,
      parts,
      notes,
      view: { ...p.view, activePartId },
      updatedAt: Date.now(),
    }
    scheduleSave()
  }

  function setLyric(noteId: string, lyric: string | undefined): void {
    updateNote(noteId, { lyric: lyric || undefined })
  }

  function extendMeasures(count = 1): void {
    const p = current.value
    if (!p) return
    patchProject({ lengthTicks: p.lengthTicks + TAG_ROLL_PPQ * 4 * Math.max(1, count) })
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
    selectedNoteId.value = null
    transportPlaying.value = false
  }

  function setLocalEntryId(id: string | null): void {
    patchProject({ localEntryId: id })
  }

  return {
    summaries,
    current,
    loaded,
    busy,
    error,
    selectedNoteId,
    selectedNote,
    addDurationTicks,
    transportPlaying,
    notesByPartId,
    refreshList,
    openProject,
    createProject,
    persistNow,
    patchProject,
    patchView,
    setMode,
    setActivePart,
    nudgeCellW,
    nudgeCellH,
    setCellSize,
    setLockPiano,
    setScroll,
    setPlayheadTick,
    setBpm,
    setSoundEngine,
    addNote,
    updateNote,
    deleteNote,
    selectNote,
    upsertHarmonyNotes,
    addPart,
    updatePart,
    removePart,
    setLyric,
    extendMeasures,
    removeProject,
    clearCurrent,
    setLocalEntryId,
  }
})
