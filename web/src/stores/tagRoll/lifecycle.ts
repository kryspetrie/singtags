/** List, open, save, and patch Tag Studio projects. */

import { lazyFn, type StoreDeps } from './deps'

import {
  deleteTagRoll,
  listTagRolls,
  openTagRoll,
  persistTagRoll,
  persistTagRollHistory,
  putNewTagRoll,
} from '../../application/tagRoll/persist'

import {
  createEmptyTagRollProject,
  normalizeTagRollProject,
} from '../../lib/tagRoll/normalize'

import { duplicateTagRoll } from '../../application/tagRoll/duplicateProject'

import { hydrateProjectMix } from '../../lib/tagRoll/mix'

import type { TagRollProject, TagRollViewPrefs } from '../../lib/tagRoll/types'

import {
  TAG_ROLL_CELL_H_MAX,
  TAG_ROLL_CELL_H_MIN,
  TAG_ROLL_CELL_W_MAX,
  TAG_ROLL_CELL_W_MIN,
  TAG_ROLL_MIDI_MAX,
} from '../../lib/tagRoll/types'

import { effectiveSheetFormatDefault } from '../../lib/tagRoll/sheetFormatDefaults'

import { createTagRollDefaultProjects } from '../../lib/tagRoll/seedDefaultProjects'

import { ensurePolecatPitchReviewProjects } from '../../application/tagRoll/ensurePolecatPitchReviews'

import { ensurePolecatMixedSeedProjects } from '../../application/tagRoll/ensurePolecatMixedSeeds'

import {
  clearPolecatPitchSeedDismissals,
  dismissTagRollSeed,
  isTagRollLibraryInitialized,
  markTagRollLibraryInitialized,
} from '../../lib/tagRoll/seedLibraryPrefs'

import { usePreferencesStore } from '../preferences'

import { now, svc } from './runtime'

export function createTagRollLifecycleActions(deps: StoreDeps) {

  const busy = deps.busy
  const clearNoteSelection = lazyFn(() => deps.clearNoteSelection)
  const current = deps.current
  const error = deps.error
  const expressionTool = deps.expressionTool
  const loaded = deps.loaded
  const pushHistory = lazyFn(() => deps.pushHistory)
  const redoStack = deps.redoStack
  const selectedExpressionId = deps.selectedExpressionId
  const selectedTupletId = deps.selectedTupletId
  const slots = deps.slots
  const summaries = deps.summaries
  const transportPlaying = deps.transportPlaying
  const tupletTool = deps.tupletTool
  const undoStack = deps.undoStack

  let saveTimer: ReturnType<typeof setTimeout> | null = null

  async function refreshList(): Promise<void> {
    try {
      const { repository, clock } = svc()
      let list = await listTagRolls(repository)
      // Only starter: Lilly Marlene (v2) on a never-used empty library.
      // No polecat / coach auto-seeds on ordinary load or reload.
      if (!list.length && !isTagRollLibraryInitialized()) {
        const seeded = createTagRollDefaultProjects(clock.now())
        for (const p of seeded) {
          await putNewTagRoll(repository, p, clock)
        }
        if (seeded.length) {
          markTagRollLibraryInitialized()
          list = await listTagRolls(repository)
        }
      }
      if (list.length) markTagRollLibraryInitialized()
      summaries.value = list
      loaded.value = true
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to load Tag Studio projects'
      loaded.value = true
    }
  }

  async function openProject(id: string): Promise<TagRollProject | null> {
    busy.value = true
    try {
      // Persist mixer / edits on the outgoing project before swapping.
      if (current.value && current.value.id !== id) await persistNow()
      const { repository } = svc()
      const p = await openTagRoll(repository, id)
      current.value = p
        ? { ...p, mix: hydrateProjectMix(p.parts, p.mix) }
        : null
      clearNoteSelection()
      selectedExpressionId.value = null
      selectedTupletId.value = null
      tupletTool.value = false
      expressionTool.value = null
      undoStack.value = []
      redoStack.value = []
      if (current.value) {
        const hist = await repository.getHistory(current.value.id)
        undoStack.value = hist.undo
        redoStack.value = hist.redo
      }
      error.value = null
      return current.value
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to open project'
      current.value = null
      return null
    } finally {
      busy.value = false
    }
  }

  async function createProject(title?: string): Promise<TagRollProject> {
    try {
      const prefs = usePreferencesStore()
      const p = createEmptyTagRollProject({ title })
      Object.assign(p.view, effectiveSheetFormatDefault('continuous'))
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
      const saved = await putNewTagRoll(svc().repository, p, svc().clock)
      current.value = saved
      clearNoteSelection()
      selectedExpressionId.value = null
      selectedTupletId.value = null
      tupletTool.value = false
      expressionTool.value = null
      undoStack.value = []
      redoStack.value = []
      await refreshList()
      return saved
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to create project'
      throw e
    }
  }

  /** True when the open chart has no musical content (safe to overwrite on import). */
  function isBlankCurrentProject(): boolean {
    const cur = current.value
    if (!cur) return false
    return (
      cur.notes.length === 0 &&
      (cur.harmonySketch?.length ?? 0) === 0 &&
      (cur.tuplets?.length ?? 0) === 0
    )
  }

  /**
   * Persist an imported project (already normalized).
   * When `replaceBlankCurrent` is set and the open project is empty, reuse its id
   * instead of creating an orphan blank chart.
   */
  async function importProject(
    project: TagRollProject,
    opts?: { replaceBlankCurrent?: boolean },
  ): Promise<TagRollProject> {
    try {
      const stamp = now()
      const cur = current.value
      const replaceBlank = !!opts?.replaceBlankCurrent && isBlankCurrentProject() && !!cur
      const p = normalizeTagRollProject({
        ...project,
        ...(replaceBlank && cur
          ? { id: cur.id, createdAt: cur.createdAt, title: project.title || cur.title }
          : { createdAt: project.createdAt || stamp }),
        updatedAt: stamp,
        localEntryId: null,
      })
      if (!p) throw new Error('Invalid project')
      const withMix = {
        ...p,
        mix: hydrateProjectMix(p.parts, p.mix),
      }
      const saved = replaceBlank
        ? await persistTagRoll(svc().repository, withMix, svc().clock)
        : await putNewTagRoll(svc().repository, withMix, svc().clock)
      if (replaceBlank) {
        await persistTagRollHistory(
          svc().repository,
          { projectId: saved.id, undo: [], redo: [] },
          svc().clock,
        )
      }
      current.value = saved
      clearNoteSelection()
      selectedExpressionId.value = null
      selectedTupletId.value = null
      tupletTool.value = false
      expressionTool.value = null
      undoStack.value = []
      redoStack.value = []
      await refreshList()
      return saved
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to import project'
      throw e
    }
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
    // Flush immediately — cancel debounce so refresh/navigate cannot drop mixer etc.
    if (saveTimer) {
      clearTimeout(saveTimer)
      saveTimer = null
    }
    const p = current.value
    if (!p) return
    // Snapshot identity — if the user mutes/edits during await, do not clobber
    // the live document with the stale normalized write-back.
    const savedId = p.id
    const savedUpdatedAt = p.updatedAt
    try {
      const next = await persistTagRoll(svc().repository, p, svc().clock)
      const normalized = normalizeTagRollProject(next)
      // Keep the live project if normalize fails — never wipe the open editor.
      // Only write back when this project is still open and unchanged mid-save.
      if (
        normalized &&
        current.value?.id === savedId &&
        current.value.updatedAt === savedUpdatedAt
      ) {
        current.value = normalized
      }
      // Refresh summaries only — never run seed re-import here (that wiped Sketch
      // after Back when lengthTicks/notes diverged from the gold JSON).
      try {
        summaries.value = await listTagRolls(svc().repository)
      } catch {
        /* ignore list refresh failures after a successful put */
      }
      error.value = null
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Failed to save project'
    }
  }

  function patchProject(patch: Partial<TagRollProject>, opts?: { history?: boolean }): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) {
      const musicalKeys: (keyof TagRollProject)[] = [
        'title',
        'bpm',
        'snapTicks',
        'lengthTicks',
        'timeSignature',
        'tempoMarkers',
        'keyMarkers',
        'expressions',
        'soundEngine',
        'pitchPipeSoundId',
        'soundfontId',
        'soundfontPatch',
        'blowPitchEnabled',
        'metronomeEnabled',
        'metronomeSwing',
        'swing',
        'midiBakeSwing',
        'soundEnvelope',
        'tonality',
        'tonalityMode',
        'preferFlats',
        'clefFamily',
        'parts',
        'notes',
        'tuplets',
        'melodyPasses',
        'harmonySketch',
        'localEntryId',
      ]
      const touchesMusic = musicalKeys.some((k) => k in patch)
      if (touchesMusic) pushHistory()
    }
    current.value = { ...p, ...patch, updatedAt: now() }
    scheduleSave()
  }

  function patchView(patch: Partial<TagRollViewPrefs>): void {
    const p = current.value
    if (!p) return
    current.value = {
      ...p,
      view: { ...p.view, ...patch },
      updatedAt: now(),
    }
    scheduleSave()
  }

  async function removeProject(id: string): Promise<void> {
    // Bundled seeds re-import on refresh unless dismissed; mark library used so
    // deleting the last project does not resurrect starter demos.
    dismissTagRollSeed(id)
    markTagRollLibraryInitialized()
    await deleteTagRoll(svc().repository, id)
    if (current.value?.id === id) current.value = null
    summaries.value = summaries.value.filter((s: any) => s.id !== id)
    await refreshList()
  }

  /**
   * Opt-in only (?resyncPolecat=1): undismiss + force-reimport polecat pitch /
   * mixed MusicXML gold seeds. Not run on ordinary load.
   */
  async function resyncPolecatPitchSeeds(): Promise<{ clearedDismissals: number }> {
    const clearedDismissals = clearPolecatPitchSeedDismissals()
    const { repository, clock } = svc()
    try {
      await ensurePolecatPitchReviewProjects(repository, clock, { force: true })
    } catch {
      /* optional bundle */
    }
    try {
      await ensurePolecatMixedSeedProjects(repository, clock, { force: true })
    } catch {
      /* optional bundle */
    }
    await refreshList()
    return { clearedDismissals }
  }

  async function duplicateProject(id: string): Promise<TagRollProject> {
    const saved = await duplicateTagRoll(svc().repository, svc().clock, id)
    await refreshList()
    return saved
  }

  async function clearCurrent(): Promise<void> {
    // Must flush before nulling — otherwise refresh cancels the debounced save
    // and mixer mute/volume/pan never reach IndexedDB.
    await persistNow()
    if (slots.historyTimer) {
      clearTimeout(slots.historyTimer)
      slots.historyTimer = null
      const p = current.value
      if (p) {
        try {
          await persistTagRollHistory(
            svc().repository,
            {
              projectId: p.id,
              undo: undoStack.value,
              redo: redoStack.value,
            },
            svc().clock,
          )
        } catch {
          /* best-effort */
        }
      }
    }
    current.value = null
    clearNoteSelection()
    selectedExpressionId.value = null
    selectedTupletId.value = null
    tupletTool.value = false
    expressionTool.value = null
    transportPlaying.value = false
    undoStack.value = []
    redoStack.value = []
  }

  function setLocalEntryId(id: string | null): void {
    patchProject({ localEntryId: id })
  }

  const actions = {
    refreshList,
    openProject,
    createProject,
    isBlankCurrentProject,
    importProject,
    scheduleSave,
    persistNow,
    patchProject,
    patchView,
    removeProject,
    resyncPolecatPitchSeeds,
    duplicateProject,
    clearCurrent,
    setLocalEntryId,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
