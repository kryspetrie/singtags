/** Tag Roll chrome, lanes, nav, and detected-score preference actions. */

import { type StoreDeps } from './deps'

import { watch } from 'vue'

import { DEFAULT_METRONOME_SOUND_ID, isMetronomeSoundId } from '../../audio/metronomeSamples'

import { saveDetectedInterest, type DetectedInterestLevel } from '../../lib/tagRoll/detectedInterestPrefs'

import { saveDetectedLockLeadVoicing, saveSketchLockLeadVoicing } from '../../lib/tagRoll/leadLockVoicingPrefs'

import { normalizeVoicingProfile } from '../../domain/arranging/voicingProfile'

import { clearDetectedScoreTweaks, saveDetectedScoreTweaks } from '../../lib/tagRoll/detectedScoreTweaksPrefs'

import {
  DEFAULT_DETECTED_SCORE_TWEAKS,
  normalizeDetectedScoreTweaks,
  type DetectedScoreTweaks,
} from '../../domain/arranging/detectedScoreTweaks'

import {
  DEFAULT_PRIMARY_NAV_ORDER,
  moveAvailablePrimaryNavId,
  movePrimaryNavId,
  normalizePrimaryNavHidden,
  normalizePrimaryNavOrder,
  normalizePrimaryNavPinCount,
  PRIMARY_NAV_PIN_COUNT,
  type PrimaryNavGates,
  type PrimaryNavId,
} from '../../lib/primaryNav'

import {
  PRIMARY_NAV_HIDDEN_KEY,
  PRIMARY_NAV_ORDER_KEY,
  PRIMARY_NAV_PIN_COUNT_KEY,
  PRIMARY_NAV_PIN_OVERRIDE_KEY,
  TAG_ROLL_CELL_H_KEY,
  TAG_ROLL_CELL_W_KEY,
  TAG_ROLL_CHORDS_LANE_COLLAPSED_KEY,
  TAG_ROLL_CHORD_WALK_AUTO_ADVANCE_KEY,
  TAG_ROLL_COACH_GUIDED_STEP_KEY,
  TAG_ROLL_COACH_LANE_COLLAPSED_KEY,
  TAG_ROLL_DETECTED_LANE_COLLAPSED_KEY,
  TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY,
  TAG_ROLL_LYRICS_LANE_COLLAPSED_KEY,
  TAG_ROLL_METRONOME_SOUND_KEY,
  TAG_ROLL_METRONOME_VOLUME_KEY,
  TAG_ROLL_METRONOME_VOLUME_MAX,
  TAG_ROLL_PATH_OPTIMIZE_PREFS_KEY,
  TAG_ROLL_SOUNDFONT_FAVORITES_KEY,
  TAG_ROLL_VOICING_RANGES_OPEN_KEY,
  TAG_ROLL_VOICING_RANGE_FILTER_KEY,
  type TagRollBottomLaneId,
  type TagRollPathOptimizePrefs,
  type TagRollPathOptimizeTaste,
  loadPathOptimizePrefs,
} from './storage'

export function createTagRollChromeActions(deps: StoreDeps) {

  const detectedInterest = deps.detectedInterest
  const detectedScoreTweaks = deps.detectedScoreTweaks
  const primaryNavHidden = deps.primaryNavHidden
  const primaryNavOrder = deps.primaryNavOrder
  const primaryNavPinCount = deps.primaryNavPinCount
  const primaryNavPinOverride = deps.primaryNavPinOverride
  const tagRollCellH = deps.tagRollCellH
  const tagRollCellW = deps.tagRollCellW
  const tagRollChordWalkAutoAdvance = deps.tagRollChordWalkAutoAdvance
  const tagRollChordsLaneCollapsed = deps.tagRollChordsLaneCollapsed
  const tagRollCoachGuidedStep = deps.tagRollCoachGuidedStep
  const tagRollCoachLaneCollapsed = deps.tagRollCoachLaneCollapsed
  const tagRollDetectedLaneCollapsed = deps.tagRollDetectedLaneCollapsed
  const tagRollDetectedLockLeadVoicing = deps.tagRollDetectedLockLeadVoicing
  const tagRollExpressionLaneCollapsed = deps.tagRollExpressionLaneCollapsed
  const tagRollLyricsLaneCollapsed = deps.tagRollLyricsLaneCollapsed
  const tagRollMetronomeSound = deps.tagRollMetronomeSound
  const tagRollMetronomeVolume = deps.tagRollMetronomeVolume
  const tagRollPathOptimizePrefs = deps.tagRollPathOptimizePrefs
  const tagRollSketchLockLeadVoicing = deps.tagRollSketchLockLeadVoicing
  const tagRollSoundfontFavorites = deps.tagRollSoundfontFavorites
  const tagRollVoicingRangeFilter = deps.tagRollVoicingRangeFilter
  const tagRollVoicingRangesOpen = deps.tagRollVoicingRangesOpen

  /** Remember last Tag Roll cell size for new projects. */
  function setTagRollCellSize(cellW: number, cellH: number): void {
    tagRollCellW.value = cellW
    tagRollCellH.value = cellH
  }

  /** Tag Studio metronome click sample pair (persists across projects). */
  function setTagRollMetronomeSound(id: string): void {
    tagRollMetronomeSound.value = isMetronomeSoundId(id) ? id : DEFAULT_METRONOME_SOUND_ID
  }

  /** Tag Studio metronome click volume (0–1.5, persists across projects). */
  function setTagRollMetronomeVolume(v: number): void {
    if (!Number.isFinite(v)) return
    tagRollMetronomeVolume.value = Math.min(
      TAG_ROLL_METRONOME_VOLUME_MAX,
      Math.max(0, v),
    )
  }

  /** Toggle a SoundFont instrument favorite key (`soundfontId|msb:lsb:program`). */
  function toggleTagRollSoundfontFavorite(key: string): void {
    const k = key.trim().slice(0, 96)
    if (!/^[a-z0-9-]+\|\d{1,3}:\d{1,3}:\d{1,3}$/i.test(k)) return
    const cur = tagRollSoundfontFavorites.value
    if (cur.includes(k)) {
      tagRollSoundfontFavorites.value = cur.filter((x: any) => x !== k)
      return
    }
    tagRollSoundfontFavorites.value = [k, ...cur].slice(0, 64)
  }

  function isTagRollSoundfontFavorite(key: string): boolean {
    return tagRollSoundfontFavorites.value.includes(key)
  }

  /** Collapse the Tag Studio expression (Mods) lane chrome. */
  function setTagRollExpressionLaneCollapsed(on: boolean): void {
    tagRollExpressionLaneCollapsed.value = !!on
    localStorage.setItem(TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY, on ? '1' : '0')
  }

  function setTagRollCoachLaneCollapsed(on: boolean): void {
    tagRollCoachLaneCollapsed.value = !!on
    localStorage.setItem(TAG_ROLL_COACH_LANE_COLLAPSED_KEY, on ? '1' : '0')
  }

  /** Remember the last Coach step rail page across sessions. */
  function setTagRollCoachGuidedStep(step: string): void {
    const id = String(step || 'home')
    tagRollCoachGuidedStep.value = id
    localStorage.setItem(TAG_ROLL_COACH_GUIDED_STEP_KEY, id)
  }

  function setTagRollChordWalkAutoAdvance(on: boolean): void {
    tagRollChordWalkAutoAdvance.value = !!on
    localStorage.setItem(TAG_ROLL_CHORD_WALK_AUTO_ADVANCE_KEY, on ? '1' : '0')
  }

  function setTagRollVoicingRangesOpen(on: boolean): void {
    tagRollVoicingRangesOpen.value = !!on
    localStorage.setItem(TAG_ROLL_VOICING_RANGES_OPEN_KEY, on ? '1' : '0')
  }

  function toggleTagRollVoicingRangesOpen(): void {
    setTagRollVoicingRangesOpen(!tagRollVoicingRangesOpen.value)
  }

  function setTagRollVoicingRangeFilter(on: boolean): void {
    tagRollVoicingRangeFilter.value = !!on
    localStorage.setItem(TAG_ROLL_VOICING_RANGE_FILTER_KEY, on ? '1' : '0')
  }

  function setTagRollPathOptimizePrefs(patch: Partial<TagRollPathOptimizePrefs>): void {
    const next = { ...tagRollPathOptimizePrefs.value, ...patch }
    const normalized = loadPathOptimizePrefs()
    // Re-normalize through the same clamps by round-tripping JSON shape.
    const mode =
      next.mode === 'fill' ||
      next.mode === 'revoice' ||
      next.mode === 'rechord' ||
      next.mode === 'full'
        ? next.mode
        : normalized.mode
    const cadenceBias =
      next.cadenceBias === 'off' ||
      next.cadenceBias === 'moderate' ||
      next.cadenceBias === 'strong'
        ? next.cadenceBias
        : normalized.cadenceBias
    const taste: TagRollPathOptimizeTaste =
      next.taste === 'circle' || next.taste === 'busy' || next.taste === 'classic'
        ? next.taste
        : normalized.taste
    const risk =
      typeof next.risk === 'number' && Number.isFinite(next.risk)
        ? Math.min(1, Math.max(0, next.risk))
        : typeof next.voiceLeading === 'number' && Number.isFinite(next.voiceLeading)
          ? Math.min(1, Math.max(0, 1 - next.voiceLeading))
          : 0.3
    const maxPasses = Math.min(500, Math.max(1, Math.round(Number(next.maxPasses) || 12)))
    const stopEarly = next.stopEarly !== false
    const allowWorsen = next.allowWorsen === true
    const voicingProfile = normalizeVoicingProfile(
      next.voicingProfile ?? normalized.voicingProfile,
    )
    tagRollPathOptimizePrefs.value = {
      mode,
      risk,
      cadenceBias,
      taste,
      maxPasses,
      stopEarly,
      allowWorsen,
      voicingProfile,
    }
    localStorage.setItem(
      TAG_ROLL_PATH_OPTIMIZE_PREFS_KEY,
      JSON.stringify(tagRollPathOptimizePrefs.value),
    )
  }

  function setTagRollChordsLaneCollapsed(on: boolean): void {
    tagRollChordsLaneCollapsed.value = !!on
    localStorage.setItem(TAG_ROLL_CHORDS_LANE_COLLAPSED_KEY, on ? '1' : '0')
  }

  /** @deprecated Prefer setTagRollChordsLaneCollapsed */
  function setTagRollDeclaredLaneCollapsed(on: boolean): void {
    setTagRollChordsLaneCollapsed(on)
  }

  function setTagRollDetectedLaneCollapsed(on: boolean): void {
    tagRollDetectedLaneCollapsed.value = !!on
    localStorage.setItem(TAG_ROLL_DETECTED_LANE_COLLAPSED_KEY, on ? '1' : '0')
  }

  function setTagRollLyricsLaneCollapsed(on: boolean): void {
    tagRollLyricsLaneCollapsed.value = !!on
    localStorage.setItem(TAG_ROLL_LYRICS_LANE_COLLAPSED_KEY, on ? '1' : '0')
  }

  /** Detected interest: Basic (today) / Mild (V7, ii7→V, held cadences) / Bold (+V7/V, Dom9). */
  function setDetectedInterest(level: DetectedInterestLevel): void {
    detectedInterest.value = level
    saveDetectedInterest(level)
  }

  function setTagRollSketchLockLeadVoicing(on: boolean): void {
    tagRollSketchLockLeadVoicing.value = !!on
    saveSketchLockLeadVoicing(!!on)
  }

  function setTagRollDetectedLockLeadVoicing(on: boolean): void {
    tagRollDetectedLockLeadVoicing.value = !!on
    saveDetectedLockLeadVoicing(!!on)
  }

  /** Apply Detected scoring Tweaks (normalizes unknown keys). */
  function setDetectedScoreTweaks(raw: DetectedScoreTweaks | Record<string, unknown>): void {
    const next = normalizeDetectedScoreTweaks(raw)
    detectedScoreTweaks.value = next
    saveDetectedScoreTweaks(next)
  }

  /** Restore shipped Detected scoring weights. */
  function resetDetectedScoreTweaks(): void {
    detectedScoreTweaks.value = {
      ...DEFAULT_DETECTED_SCORE_TWEAKS,
      mild: { ...DEFAULT_DETECTED_SCORE_TWEAKS.mild },
      bold: { ...DEFAULT_DETECTED_SCORE_TWEAKS.bold },
      held: { ...DEFAULT_DETECTED_SCORE_TWEAKS.held },
    }
    clearDetectedScoreTweaks()
  }

  /** Independently open/collapse a bottom lane (lanes may stack). */
  function setTagRollLaneCollapsed(lane: TagRollBottomLaneId, collapsed: boolean): void {
    const on = !!collapsed
    if (lane === 'mods') setTagRollExpressionLaneCollapsed(on)
    else if (lane === 'coach') setTagRollCoachLaneCollapsed(on)
    else if (lane === 'chords') setTagRollChordsLaneCollapsed(on)
    else if (lane === 'lyrics') setTagRollLyricsLaneCollapsed(on)
    else setTagRollDetectedLaneCollapsed(on)
  }

  function toggleTagRollLane(lane: TagRollBottomLaneId): void {
    if (lane === 'mods') setTagRollExpressionLaneCollapsed(!tagRollExpressionLaneCollapsed.value)
    else if (lane === 'coach') setTagRollCoachLaneCollapsed(!tagRollCoachLaneCollapsed.value)
    else if (lane === 'chords') setTagRollChordsLaneCollapsed(!tagRollChordsLaneCollapsed.value)
    else if (lane === 'lyrics') setTagRollLyricsLaneCollapsed(!tagRollLyricsLaneCollapsed.value)
    else setTagRollDetectedLaneCollapsed(!tagRollDetectedLaneCollapsed.value)
  }

  /**
   * @deprecated Prefer setTagRollLaneCollapsed / toggleTagRollLane (independent stacking).
   * Kept so existing open-coach call sites still expand Coach without closing others.
   */
  function openTagRollBottomLane(which: 'mods' | 'coach' | null): void {
    if (which === 'mods') setTagRollExpressionLaneCollapsed(false)
    else if (which === 'coach') setTagRollCoachLaneCollapsed(false)
    else {
      setTagRollExpressionLaneCollapsed(true)
      setTagRollCoachLaneCollapsed(true)
    }
  }

  /** Replace the primary-nav preference order (normalized). */
  function setPrimaryNavOrder(order: readonly PrimaryNavId[]): void {
    primaryNavOrder.value = normalizePrimaryNavOrder(order)
  }

  /** Move one primary-nav destination within the preference order. */
  function movePrimaryNav(id: PrimaryNavId, toIndex: number): void {
    primaryNavOrder.value = movePrimaryNavId(primaryNavOrder.value, id, toIndex)
  }

  /** Move among currently available destinations (Settings reorder UI). */
  function moveAvailablePrimaryNav(
    id: PrimaryNavId,
    toAvailableIndex: number,
    gates: PrimaryNavGates,
  ): void {
    primaryNavOrder.value = moveAvailablePrimaryNavId(
      primaryNavOrder.value,
      id,
      toAvailableIndex,
      gates,
      primaryNavHidden.value,
    )
  }

  /** Hide or show a non-lab primary-nav page (Labs use feature flags instead). */
  function setPrimaryNavHidden(id: PrimaryNavId, hide: boolean): void {
    const next = new Set(normalizePrimaryNavHidden(primaryNavHidden.value))
    if (hide) next.add(id)
    else next.delete(id)
    primaryNavHidden.value = normalizePrimaryNavHidden([...next])
  }

  /** Toggle overriding the default 5 pin slots. */
  function setPrimaryNavPinOverride(on: boolean): void {
    primaryNavPinOverride.value = on
    if (on && primaryNavPinCount.value < PRIMARY_NAV_PIN_COUNT) {
      primaryNavPinCount.value = PRIMARY_NAV_PIN_COUNT
    }
  }

  /** Preferred pin-slot count when override is on. */
  function setPrimaryNavPinCount(count: number): void {
    primaryNavPinCount.value = normalizePrimaryNavPinCount(count)
  }

  /** Nudge preferred pin count when override is on. */
  function nudgePrimaryNavPinCount(delta: number): void {
    setPrimaryNavPinCount(primaryNavPinCount.value + delta)
  }

  /** Restore the default primary-nav order, clears hides, and resets pin override. */
  function resetPrimaryNavOrder(): void {
    primaryNavOrder.value = [...DEFAULT_PRIMARY_NAV_ORDER]
    primaryNavHidden.value = []
    primaryNavPinOverride.value = false
    primaryNavPinCount.value = PRIMARY_NAV_PIN_COUNT
  }

  const actions = {
    setTagRollCellSize,
    setTagRollMetronomeSound,
    setTagRollMetronomeVolume,
    toggleTagRollSoundfontFavorite,
    isTagRollSoundfontFavorite,
    setTagRollExpressionLaneCollapsed,
    setTagRollCoachLaneCollapsed,
    setTagRollCoachGuidedStep,
    setTagRollChordWalkAutoAdvance,
    setTagRollVoicingRangesOpen,
    toggleTagRollVoicingRangesOpen,
    setTagRollVoicingRangeFilter,
    setTagRollPathOptimizePrefs,
    setTagRollChordsLaneCollapsed,
    setTagRollDeclaredLaneCollapsed,
    setTagRollDetectedLaneCollapsed,
    setTagRollLyricsLaneCollapsed,
    setDetectedInterest,
    setTagRollSketchLockLeadVoicing,
    setTagRollDetectedLockLeadVoicing,
    setDetectedScoreTweaks,
    resetDetectedScoreTweaks,
    setTagRollLaneCollapsed,
    toggleTagRollLane,
    openTagRollBottomLane,
    setPrimaryNavOrder,
    movePrimaryNav,
    moveAvailablePrimaryNav,
    setPrimaryNavHidden,
    setPrimaryNavPinOverride,
    setPrimaryNavPinCount,
    nudgePrimaryNavPinCount,
    resetPrimaryNavOrder,
  }
  Object.assign(deps, actions)

  function bindWatches(): void {

    watch(
      tagRollCellW,
      (v) => {
        try {
          localStorage.setItem(TAG_ROLL_CELL_W_KEY, String(v))
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )

    watch(
      tagRollCellH,
      (v) => {
        try {
          localStorage.setItem(TAG_ROLL_CELL_H_KEY, String(v))
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )

    watch(
      tagRollMetronomeSound,
      (v) => {
        try {
          localStorage.setItem(TAG_ROLL_METRONOME_SOUND_KEY, v)
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )

    watch(
      tagRollMetronomeVolume,
      (v) => {
        try {
          localStorage.setItem(TAG_ROLL_METRONOME_VOLUME_KEY, String(v))
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )

    watch(
      tagRollSoundfontFavorites,
      (v) => {
        try {
          localStorage.setItem(TAG_ROLL_SOUNDFONT_FAVORITES_KEY, JSON.stringify(v))
        } catch {
          /* ignore */
        }
      },
      { deep: true, flush: 'sync' },
    )

    watch(
      tagRollExpressionLaneCollapsed,
      (v) => {
        try {
          localStorage.setItem(TAG_ROLL_EXPRESSION_LANE_COLLAPSED_KEY, v ? '1' : '0')
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )

    watch(
      primaryNavOrder,
      (v) => {
        try {
          localStorage.setItem(PRIMARY_NAV_ORDER_KEY, JSON.stringify(normalizePrimaryNavOrder(v)))
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync', deep: true },
    )

    watch(
      primaryNavHidden,
      (v) => {
        try {
          localStorage.setItem(PRIMARY_NAV_HIDDEN_KEY, JSON.stringify(normalizePrimaryNavHidden(v)))
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync', deep: true },
    )

    watch(
      primaryNavPinOverride,
      (v) => {
        try {
          localStorage.setItem(PRIMARY_NAV_PIN_OVERRIDE_KEY, v ? '1' : '0')
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )

    watch(
      primaryNavPinCount,
      (v) => {
        try {
          localStorage.setItem(
            PRIMARY_NAV_PIN_COUNT_KEY,
            String(normalizePrimaryNavPinCount(v)),
          )
        } catch {
          /* ignore */
        }
      },
      { flush: 'sync' },
    )
  }

  return { actions, bindWatches }

}
