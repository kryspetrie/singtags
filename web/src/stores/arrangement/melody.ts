/** Melody note edits for the arrangement store. */

import { lazyFn, type StoreDeps } from './deps'

import { syncStackAfterMelodyEdit } from '../../domain/arranging/syncStacks'

import {
  applyEmbellishmentSeed,
  findEmbellishmentSeeds,
  melodyWithLyric,
} from '../../domain/arranging/embellishments'

import { snapTick } from '../../domain/arranging/snap'

import { type MelodyEvent } from '../../domain/arranging/types'

export function createArrangementMelodyActions(deps: StoreDeps) {

  const addDurationTicks = deps.addDurationTicks
  const candidates = deps.candidates
  const current = deps.current
  const lengthTicks = deps.lengthTicks
  const mutate = lazyFn(() => deps.mutate)
  const persist = lazyFn(() => deps.persist)
  const refreshQa = lazyFn(() => deps.refreshQa)
  const replaceCurrent = lazyFn(() => deps.replaceCurrent)
  const selectedMelodyId = deps.selectedMelodyId
  const selectedPillarId = deps.selectedPillarId
  const services = deps.services
  const snapTicks = deps.snapTicks
  const snapshotBeforeChange = lazyFn(() => deps.snapshotBeforeChange)
  const touch = lazyFn(() => deps.touch)

  function addMelodyNote(partial: {
    midi: number
    startTick: number
    durationTicks?: number
    role?: MelodyEvent['role']
    lyric?: string
  }): MelodyEvent | null {
    const p = current.value
    if (!p) return null
    snapshotBeforeChange()
    const startTick = snapTick(partial.startTick, snapTicks.value)
    const durationTicks = partial.durationTicks ?? addDurationTicks.value
    const note: MelodyEvent = {
      id: services.idGen.next('mel'),
      midi: partial.midi,
      startTick,
      durationTicks,
      role: partial.role ?? 'unknown',
      lyric: partial.lyric,
    }
    p.melody.push(note)
    const end = startTick + durationTicks
    if (end + 480 * 4 > lengthTicks.value) {
      lengthTicks.value = Math.ceil((end + 480 * 4) / (480 * 4)) * (480 * 4)
    }
    selectedMelodyId.value = note.id
    touch(p)
    void persist()
    refreshQa()
    return note
  }

  function updateMelodyNote(
    id: string,
    patch: Partial<Pick<MelodyEvent, 'midi' | 'startTick' | 'durationTicks' | 'role' | 'lyric'>>,
    opts?: { recordHistory?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    const prev = p.melody.find((x: any) => x.id === id)
    if (!prev) return
    if (opts?.recordHistory !== false) snapshotBeforeChange()
    const next = { ...prev }
    if (patch.midi != null) next.midi = patch.midi
    if (patch.startTick != null) next.startTick = snapTick(patch.startTick, snapTicks.value)
    if (patch.durationTicks != null) {
      next.durationTicks = Math.max(snapTicks.value, patch.durationTicks)
    }
    if (patch.role != null) next.role = patch.role
    if (patch.lyric != null) next.lyric = patch.lyric
    p.melody = p.melody.map((n: any) => (n.id === id ? next : n))
    p.stacks = syncStackAfterMelodyEdit(
      { ...p, melody: p.melody },
      prev,
      next,
      { idGen: services.idGen, rankerDeps: services.rankerDeps },
    )
    touch(p)
    void persist()
    refreshQa()
  }

  function setLyric(noteId: string, lyric: string): void {
    mutate((p: any) => {
      p.melody = melodyWithLyric(p.melody, noteId, lyric)
    })
  }

  function listEmbellishmentSeeds() {
    const p = current.value
    return p ? findEmbellishmentSeeds(p) : []
  }

  function applySwipeSeed(seedId: string): boolean {
    const p = current.value
    if (!p) return false
    const seed = findEmbellishmentSeeds(p).find((s) => s.id === seedId)
    if (!seed?.suggestedStack) return false
    replaceCurrent(applyEmbellishmentSeed(p, seed))
    return true
  }

  function deleteMelodyNote(id: string): void {
    mutate((p: any) => {
      p.melody = p.melody.filter((n: any) => n.id !== id)
      p.stacks = p.stacks.filter((s: any) => p.melody.some((n: any) => n.startTick === s.startTick))
    })
    if (selectedMelodyId.value === id) {
      selectedMelodyId.value = null
      candidates.value = []
    }
  }

  function clearMelody(): void {
    mutate((p: any) => {
      p.melody = []
      p.pillars = []
      p.stacks = []
    })
    selectedMelodyId.value = null
    selectedPillarId.value = null
    candidates.value = []
  }

  const actions = {
    addMelodyNote,
    updateMelodyNote,
    setLyric,
    listEmbellishmentSeeds,
    applySwipeSeed,
    deleteMelodyNote,
    clearMelody,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
