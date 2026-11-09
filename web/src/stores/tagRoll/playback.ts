/** Tempo, expression, tuplet, key, and sound actions for Tag Studio. */

import { lazyFn, type StoreDeps } from './deps'

import { ensureLengthForTick, snapTick } from '../../lib/tagRoll/snap'

import { clampSoundfontPatchToBank } from '../../audio/soundfontPresets'

import { normalizeSoundEnvelope } from '../../lib/tagRoll/soundEnvelope'

import { measureTicks, upsertRampEndMarker } from '../../lib/tagRoll/tempoMap'

import type {
  TagRollExpression,
  TagRollExpressionTool,
  TagRollKeyMarker,
  TagRollProject,
  TagRollTempoMarker,
  TagRollTimeSignature,
  TagRollTuplet,
} from '../../lib/tagRoll/types'

import {
  assertNoTupletOverlap,
  createTupletContainer,
  deleteTupletContainer,
  syncMemberTupletTags,
  TUPLET_PRESETS,
} from '../../lib/tagRoll/tupletContainers'

import { applyTupletDraft, type TupletEditorDraft } from '../../lib/tagRoll/tupletEditor'

import { TAG_ROLL_DEFAULT_SNAP_TICKS } from '../../lib/tagRoll/types'

import { now, svc } from './runtime'

export function createTagRollPlaybackActions(deps: StoreDeps) {

  const chordsLaneFocused = deps.chordsLaneFocused
  const clearNoteSelection = lazyFn(() => deps.clearNoteSelection)
  const clearSketchSelection = lazyFn(() => deps.clearSketchSelection)
  const current = deps.current
  const expressionTool = deps.expressionTool
  const patchProject = lazyFn(() => deps.patchProject)
  const patchView = lazyFn(() => deps.patchView)
  const pointerTool = deps.pointerTool
  const pushHistory = lazyFn(() => deps.pushHistory)
  const scheduleSave = lazyFn(() => deps.scheduleSave)
  const selectedExpressionId = deps.selectedExpressionId
  const selectedTupletId = deps.selectedTupletId
  const tupletTool = deps.tupletTool

  function setPlayheadTick(tick: number, opts?: { snap?: boolean }): void {
    const p = current.value
    const max = p?.lengthTicks ?? 0
    let next = Math.max(0, Math.min(max, tick))
    if (opts?.snap !== false && p) {
      const grid = p.snapTicks || TAG_ROLL_DEFAULT_SNAP_TICKS
      next = Math.max(0, Math.min(max, snapTick(next, grid)))
    } else {
      next = Math.round(next)
    }
    patchView({ playheadTick: next })
  }

  function setBpm(bpm: number): void {
    const p = current.value
    if (!p) return
    const next = Math.max(20, Math.min(320, Math.round(bpm)))
    pushHistory()
    const markers = [...p.tempoMarkers]
    const zeroIdx = markers.findIndex((m) => m.tick === 0)
    if (zeroIdx >= 0) {
      markers[zeroIdx] = { ...markers[zeroIdx]!, bpm: next }
    } else {
      markers.unshift({ id: svc().idGen.next('trt'), tick: 0, bpm: next })
    }
    current.value = {
      ...p,
      bpm: next,
      tempoMarkers: markers,
      updatedAt: now(),
    }
    scheduleSave()
  }

  function setSnapTicks(snapTicks: number): void {
    patchProject({ snapTicks: Math.max(1, Math.round(snapTicks)) })
  }

  function setTimeSignature(ts: TagRollTimeSignature): void {
    patchProject({
      timeSignature: {
        numerator: Math.max(1, Math.min(16, Math.round(ts.numerator))),
        denominator: ts.denominator,
      },
    })
  }

  function setTempoAtTick(tick: number, bpm: number): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const snapped = snapTick(tick, p.snapTicks)
    const nextBpm = Math.max(20, Math.min(320, Math.round(bpm)))
    const markers = p.tempoMarkers.filter((m: any) => m.tick !== snapped)
    markers.push({ id: svc().idGen.next('trt'), tick: snapped, bpm: nextBpm })
    markers.sort((a: any, b: any) => a.tick - b.tick)
    current.value = {
      ...p,
      bpm: snapped === 0 ? nextBpm : p.bpm,
      tempoMarkers: markers,
      updatedAt: now(),
    }
    scheduleSave()
  }

  function updateTempoMarker(
    id: string,
    patch: Partial<TagRollTempoMarker>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const tempoMarkers = p.tempoMarkers.map((m: any) => {
      if (m.id !== id) return m
      return {
        ...m,
        ...patch,
        tick: Math.max(0, Math.round(patch.tick ?? m.tick)),
        bpm: Math.max(20, Math.min(320, Math.round(patch.bpm ?? m.bpm))),
      }
    })
    tempoMarkers.sort((a: any, b: any) => a.tick - b.tick)
    const zero = tempoMarkers.find((m: any) => m.tick === 0)
    current.value = {
      ...p,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: now(),
    }
    scheduleSave()
  }

  function updateTempoMarkerLive(id: string, patch: Partial<TagRollTempoMarker>): void {
    updateTempoMarker(id, patch, { history: false })
  }

  function deleteTempoMarker(id: string): void {
    const p = current.value
    if (!p) return
    const target = p.tempoMarkers.find((m: any) => m.id === id)
    if (!target || target.tick === 0) return
    pushHistory()
    current.value = {
      ...p,
      tempoMarkers: p.tempoMarkers.filter((m: any) => m.id !== id),
      updatedAt: now(),
    }
    if (selectedExpressionId.value === id) selectedExpressionId.value = null
    scheduleSave()
  }

  function syncMarkersForExpressions(
    markers: TagRollTempoMarker[],
    expressions: TagRollExpression[],
  ): TagRollTempoMarker[] {
    // Drop prior ramp sticky markers, then re-apply from current expressions.
    let next = markers.filter((m) => !m.id.startsWith('trt-ramp-'))
    for (const e of expressions) {
      if (e.kind === 'rit' || e.kind === 'accel') {
        next = upsertRampEndMarker(next, e)
      }
    }
    return next
  }

  function addExpression(expr: TagRollExpression): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const expressions = [...p.expressions, expr]
    const tempoMarkers = syncMarkersForExpressions(p.tempoMarkers, expressions)
    const zero = tempoMarkers.find((m) => m.tick === 0)
    current.value = {
      ...p,
      expressions,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: now(),
    }
    selectedExpressionId.value = expr.id
    clearNoteSelection()
    scheduleSave()
  }

  function updateExpression(
    id: string,
    patch: Partial<TagRollExpression>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const expressions = p.expressions.map((e: any) => {
      if (e.id !== id) return e
      return { ...e, ...patch } as TagRollExpression
    })
    const tempoMarkers = syncMarkersForExpressions(p.tempoMarkers, expressions)
    const zero = tempoMarkers.find((m) => m.tick === 0)
    current.value = {
      ...p,
      expressions,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: now(),
    }
    scheduleSave()
  }

  function updateExpressionLive(id: string, patch: Partial<TagRollExpression>): void {
    updateExpression(id, patch, { history: false })
  }

  function deleteExpression(id: string): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const expressions = p.expressions.filter((e: any) => e.id !== id)
    const tempoMarkers = syncMarkersForExpressions(p.tempoMarkers, expressions)
    const zero = tempoMarkers.find((m) => m.tick === 0)
    current.value = {
      ...p,
      expressions,
      tempoMarkers,
      bpm: zero?.bpm ?? p.bpm,
      updatedAt: now(),
    }
    if (selectedExpressionId.value === id) selectedExpressionId.value = null
    scheduleSave()
  }

  function selectExpression(id: string | null): void {
    selectedExpressionId.value = id
    if (id) clearNoteSelection()
  }

  function setExpressionTool(tool: TagRollExpressionTool): void {
    expressionTool.value = tool
  }

  function setTupletTool(on: boolean): void {
    tupletTool.value = !!on
    if (on) {
      pointerTool.value = 'edit'
      if (current.value?.view.mode !== 'compose') patchView({ mode: 'compose' })
    }
  }

  function selectTuplet(id: string | null): void {
    selectedTupletId.value = id
    if (id) {
      clearNoteSelection()
      selectedExpressionId.value = null
      chordsLaneFocused.value = false
      clearSketchSelection()
    }
  }

  function addTuplet(input: {
    startTick: number
    spanTicks: number
    partId?: string
    actualNotes?: number
    normalNotes?: number
  }): TagRollTuplet | null {
    const p = current.value
    if (!p) return null
    const partId = input.partId ?? p.view.activePartId ?? p.parts[0]?.id
    if (!partId) return null
    const snap = p.snapTicks || TAG_ROLL_DEFAULT_SNAP_TICKS
    const startTick = snapTick(input.startTick, snap)
    const endTick = snapTick(input.startTick + input.spanTicks, snap)
    const spanTicks = Math.max(snap, endTick - startTick)
    // Reject spans that cross a barline (Phase 4 policy applied at create).
    const mTicks = measureTicks(p.timeSignature)
    if (Math.floor(startTick / mTicks) !== Math.floor((startTick + spanTicks - 1) / mTicks)) {
      return null
    }
    const ratio = {
      actualNotes: input.actualNotes ?? TUPLET_PRESETS.triplet.actualNotes,
      normalNotes: input.normalNotes ?? TUPLET_PRESETS.triplet.normalNotes,
    }
    const candidate = createTupletContainer({
      partId,
      startTick,
      spanTicks,
      ...ratio,
    })
    if (!assertNoTupletOverlap(p.tuplets ?? [], candidate)) return null
    pushHistory()
    const lengthTicks = ensureLengthForTick(
      p.lengthTicks,
      startTick + spanTicks,
      mTicks,
    )
    current.value = {
      ...p,
      tuplets: [...(p.tuplets ?? []), candidate],
      lengthTicks,
      updatedAt: now(),
    }
    selectTuplet(candidate.id)
    scheduleSave()
    return candidate
  }

  function patchTuplet(
    id: string,
    patch: Partial<Pick<TagRollTuplet, 'startTick' | 'spanTicks' | 'actualNotes' | 'normalNotes' | 'partId'>>,
    opts?: { history?: boolean },
  ): boolean {
    const p = current.value
    if (!p) return false
    const cur = (p.tuplets ?? []).find((t: any) => t.id === id)
    if (!cur) return false
    const next: TagRollTuplet = {
      ...cur,
      ...patch,
      startTick: Math.max(0, Math.round(patch.startTick ?? cur.startTick)),
      spanTicks: Math.max(1, Math.round(patch.spanTicks ?? cur.spanTicks)),
      actualNotes: Math.max(2, Math.round(patch.actualNotes ?? cur.actualNotes)),
      normalNotes: Math.max(1, Math.round(patch.normalNotes ?? cur.normalNotes)),
      partId: patch.partId ?? cur.partId,
    }
    if (!assertNoTupletOverlap(p.tuplets ?? [], next, { ignoreId: id })) return false
    const mTicks = measureTicks(p.timeSignature)
    if (
      Math.floor(next.startTick / mTicks) !==
      Math.floor((next.startTick + next.spanTicks - 1) / mTicks)
    ) {
      return false
    }
    if (opts?.history !== false) pushHistory()
    let notes = p.notes
    if (
      next.actualNotes !== cur.actualNotes ||
      next.normalNotes !== cur.normalNotes
    ) {
      notes = syncMemberTupletTags(notes, next)
    }
    const lengthTicks = ensureLengthForTick(
      p.lengthTicks,
      next.startTick + next.spanTicks,
      mTicks,
    )
    current.value = {
      ...p,
      tuplets: (p.tuplets ?? []).map((t: any) => (t.id === id ? next : t)),
      notes,
      lengthTicks,
      updatedAt: now(),
    }
    scheduleSave()
    return true
  }

  function patchTupletLive(
    id: string,
    patch: Partial<Pick<TagRollTuplet, 'startTick' | 'spanTicks'>>,
  ): boolean {
    return patchTuplet(id, patch, { history: false })
  }

  function removeTuplet(id: string, opts?: { removeMembers?: boolean }): void {
    const p = current.value
    if (!p) return
    if (!(p.tuplets ?? []).some((t: any) => t.id === id)) return
    pushHistory()
    const out = deleteTupletContainer(p.tuplets ?? [], p.notes, id, {
      removeMembers: opts?.removeMembers,
    })
    current.value = {
      ...p,
      tuplets: out.tuplets,
      notes: out.notes,
      updatedAt: now(),
    }
    if (selectedTupletId.value === id) selectedTupletId.value = null
    scheduleSave()
  }

  function deleteSelectedTuplet(): boolean {
    const id = selectedTupletId.value
    if (!id) return false
    removeTuplet(id)
    return true
  }

  function applyTupletEditorDraft(draft: TupletEditorDraft): boolean {
    const p = current.value
    if (!p) return false
    if (!(p.tuplets ?? []).some((t: any) => t.id === draft.tupletId)) return false
    pushHistory()
    const out = applyTupletDraft(p.notes, p.tuplets ?? [], draft, {
      newNoteId: () => svc().idGen.next('trn'),
    })
    current.value = {
      ...p,
      notes: out.notes,
      tuplets: out.tuplets,
      updatedAt: now(),
    }
    scheduleSave()
    return true
  }

  function setSoundEngine(soundEngine: TagRollProject['soundEngine']): void {
    patchProject({ soundEngine })
  }

  function setPitchPipeSoundId(pitchPipeSoundId: string): void {
    const id = pitchPipeSoundId.trim().slice(0, 64) || 'mellow'
    patchProject({ pitchPipeSoundId: id })
  }

  function setSoundfontId(soundfontId: TagRollProject['soundfontId']): void {
    const p = current.value
    if (!p) {
      patchProject({ soundfontId })
      return
    }
    // Switching banks: keep patch when still valid, else fall back to Grand / program 0.
    patchProject({
      soundfontId,
      soundfontPatch: clampSoundfontPatchToBank(soundfontId, p.soundfontPatch),
    })
  }

  function setSoundfontPatch(soundfontPatch: TagRollProject['soundfontPatch']): void {
    const p = current.value
    if (!p) return
    patchProject({
      soundfontPatch: clampSoundfontPatchToBank(p.soundfontId, soundfontPatch),
    })
  }

  function setBlowPitchEnabled(blowPitchEnabled: boolean): void {
    patchProject({ blowPitchEnabled: !!blowPitchEnabled })
  }

  function setMetronomeEnabled(metronomeEnabled: boolean): void {
    patchProject({ metronomeEnabled: !!metronomeEnabled })
  }

  function setMetronomeSwing(metronomeSwing: boolean): void {
    patchProject({ metronomeSwing: !!metronomeSwing })
  }

  function setSwing(patch: Partial<TagRollProject['swing']>): void {
    const p = current.value
    if (!p) return
    const prev = p.swing ?? { enabled: false, unit: 'eighth' as const, style: 'triplet' as const, amount: 0 }
    const next = {
      ...prev,
      ...patch,
      unit: patch.unit === 'sixteenth' ? 'sixteenth' as const : patch.unit === 'eighth' ? 'eighth' as const : prev.unit,
      style: patch.style === 'ratio' ? 'ratio' as const : patch.style === 'triplet' ? 'triplet' as const : prev.style,
      amount:
        patch.amount != null && Number.isFinite(patch.amount)
          ? Math.min(1, Math.max(0, Number(patch.amount)))
          : prev.amount,
      enabled: patch.enabled != null ? !!patch.enabled : prev.enabled,
    }
    if (next.enabled && !(next.amount > 0)) next.amount = 2 / 3
    if (!next.enabled) next.amount = 0
    patchProject({ swing: next })
  }

  function setMidiBakeSwing(midiBakeSwing: boolean): void {
    patchProject({ midiBakeSwing: !!midiBakeSwing })
  }

  function setTonality(
    tonality: number,
    preferFlats?: boolean,
    tonalityMode?: 'major' | 'minor',
  ): void {
    const p = current.value
    if (!p) return
    const pc = ((Math.round(tonality) % 12) + 12) % 12
    const mode = tonalityMode === 'minor' || tonalityMode === 'major'
      ? tonalityMode
      : p.tonalityMode ?? 'major'
    const flats = preferFlats != null ? preferFlats : p.preferFlats
    setKeyAtTick(0, { tonality: pc, preferFlats: flats, tonalityMode: mode })
  }

  /**
   * Upsert a key signature change at tick (tick 0 updates project.tonality fields).
   */
  function setKeyAtTick(
    tick: number,
    opts: { tonality: number; preferFlats: boolean; tonalityMode: 'major' | 'minor' },
  ): void {
    const p = current.value
    if (!p) return
    pushHistory()
    const snapped = snapTick(tick, p.snapTicks)
    const pc = ((Math.round(opts.tonality) % 12) + 12) % 12
    const mode = opts.tonalityMode === 'minor' ? 'minor' : 'major'
    const flats = !!opts.preferFlats
    const markers = (p.keyMarkers ?? []).filter((m: any) => m.tick !== snapped)
    markers.push({
      id: svc().idGen.next('trk'),
      tick: snapped,
      tonality: pc,
      tonalityMode: mode,
      preferFlats: flats,
    })
    markers.sort((a: any, b: any) => a.tick - b.tick)
    const zero = markers.find((m: any) => m.tick === 0)
    current.value = {
      ...p,
      keyMarkers: markers,
      ...(snapped === 0 || zero
        ? {
            tonality: zero?.tonality ?? pc,
            tonalityMode: zero?.tonalityMode ?? mode,
            preferFlats: zero?.preferFlats ?? flats,
          }
        : {}),
      updatedAt: now(),
    }
    scheduleSave()
  }

  function updateKeyMarker(
    id: string,
    patch: Partial<TagRollKeyMarker>,
    opts?: { history?: boolean },
  ): void {
    const p = current.value
    if (!p) return
    if (opts?.history !== false) pushHistory()
    const keyMarkers = (p.keyMarkers ?? []).map((m: any) => {
      if (m.id !== id) return m
      return {
        ...m,
        ...patch,
        tick: Math.max(0, Math.round(patch.tick ?? m.tick)),
        tonality: ((Math.round(patch.tonality ?? m.tonality) % 12) + 12) % 12,
        tonalityMode:
          patch.tonalityMode === 'minor' || patch.tonalityMode === 'major'
            ? patch.tonalityMode
            : m.tonalityMode,
        preferFlats: patch.preferFlats ?? m.preferFlats,
      }
    })
    keyMarkers.sort((a: any, b: any) => a.tick - b.tick)
    const zero = keyMarkers.find((m: any) => m.tick === 0)
    current.value = {
      ...p,
      keyMarkers,
      ...(zero
        ? {
            tonality: zero.tonality,
            tonalityMode: zero.tonalityMode,
            preferFlats: zero.preferFlats,
          }
        : {}),
      updatedAt: now(),
    }
    scheduleSave()
  }

  function updateKeyMarkerLive(id: string, patch: Partial<TagRollKeyMarker>): void {
    updateKeyMarker(id, patch, { history: false })
  }

  function deleteKeyMarker(id: string): void {
    const p = current.value
    if (!p) return
    const target = (p.keyMarkers ?? []).find((m: any) => m.id === id)
    if (!target || target.tick === 0) return
    pushHistory()
    current.value = {
      ...p,
      keyMarkers: (p.keyMarkers ?? []).filter((m: any) => m.id !== id),
      updatedAt: now(),
    }
    scheduleSave()
  }

  function setSoundEnvelope(patch: Partial<TagRollProject['soundEnvelope']>): void {
    const p = current.value
    if (!p) return
    patchProject({
      soundEnvelope: normalizeSoundEnvelope({
        attackSec: patch.attackSec ?? p.soundEnvelope.attackSec,
        decaySec: patch.decaySec ?? p.soundEnvelope.decaySec,
        phraseDecaySec: patch.phraseDecaySec ?? p.soundEnvelope.phraseDecaySec,
      }),
    })
  }

  const actions = {
    setPlayheadTick,
    setBpm,
    setSnapTicks,
    setTimeSignature,
    setTempoAtTick,
    updateTempoMarker,
    updateTempoMarkerLive,
    deleteTempoMarker,
    syncMarkersForExpressions,
    addExpression,
    updateExpression,
    updateExpressionLive,
    deleteExpression,
    selectExpression,
    setExpressionTool,
    setTupletTool,
    selectTuplet,
    addTuplet,
    patchTuplet,
    patchTupletLive,
    removeTuplet,
    deleteSelectedTuplet,
    applyTupletEditorDraft,
    setSoundEngine,
    setPitchPipeSoundId,
    setSoundfontId,
    setSoundfontPatch,
    setBlowPitchEnabled,
    setMetronomeEnabled,
    setMetronomeSwing,
    setSwing,
    setMidiBakeSwing,
    setTonality,
    setKeyAtTick,
    updateKeyMarker,
    updateKeyMarkerLive,
    deleteKeyMarker,
    setSoundEnvelope,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {}

  return { actions, bindWatches }

}
