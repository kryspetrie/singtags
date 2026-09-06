/**
 * Tag Roulette session + modes prefs.
 */
import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import {
  dealFromMode,
  type RoulettePoolContext,
  ensureBuiltinRouletteModes,
  isRouletteBuiltinModeId,
  normalizeRouletteBatchSize,
  parseRouletteMode,
  seedRouletteModes,
  slugifyModeLabel,
  type RouletteBatchOrder,
  type RouletteBatchSize,
  type RouletteMode,
  type RouletteSlice,
} from '../lib/rouletteDraw'
import type { TagSummary } from '../types/tag'

export const ROULETTE_PREFS_KEY = 'singtags.roulette.v1'
export const ROULETTE_SESSION_KEY = 'singtags.rouletteSession.v1'

export type RouletteBatchItem = {
  id: number
  title: string
  altTitle: string | null
  arranger: string | null
  collection: string | null
  classic: string | number | null
  rating: number | null
}

export type RoulettePrefsV1 = {
  schema: 'singtags.roulette.v1'
  activeModeId: string
  modes: RouletteMode[]
  /** After reel lands, open tag fullscreen (Phase 3). */
  openAutomatically: boolean
  /** @deprecated migrated into active mode */
  batchSize?: RouletteBatchSize
}

export type RouletteSessionV1 = {
  schema: 'singtags.rouletteSession.v1'
  modeId: string | null
  items: RouletteBatchItem[]
  wheelUsedIds: number[]
  sungIds: number[]
  dealtAt: string | null
}

function snapshotTag(t: TagSummary): RouletteBatchItem {
  return {
    id: t.id,
    title: (t.title && String(t.title).trim()) || `Tag #${t.id}`,
    altTitle: t.altTitle != null && String(t.altTitle).trim() ? String(t.altTitle).trim() : null,
    arranger: t.arranger ?? null,
    collection: t.collection ?? null,
    classic: t.classic ?? null,
    rating: t.rating ?? null,
  }
}

function cloneMode(m: RouletteMode): RouletteMode {
  return {
    ...m,
    slices: m.slices.map((s) => ({ ...s })),
  }
}

function defaultPrefs(): RoulettePrefsV1 {
  const modes = seedRouletteModes()
  return {
    schema: 'singtags.roulette.v1',
    activeModeId: modes[0]!.id,
    modes,
    openAutomatically: false,
  }
}

/** Legacy seed ids replaced by full-library-rating + classic-equal. */
const LEGACY_SEED_MODE_IDS = new Set(['full-library-equal', 'rehearsal-mix'])

function loadPrefs(): RoulettePrefsV1 {
  const fallback = defaultPrefs()
  try {
    const raw = localStorage.getItem(ROULETTE_PREFS_KEY)
    if (!raw) return fallback
    const o = JSON.parse(raw) as Partial<RoulettePrefsV1>
    const parsedModes = Array.isArray(o.modes)
      ? o.modes.map((m) => parseRouletteMode(m)).filter((m): m is RouletteMode => !!m)
      : []
    let modes = parsedModes.length ? parsedModes.map(cloneMode) : seedRouletteModes()
    // Migrate Phase-1 prefs that only had batchSize
    if (!parsedModes.length && o.batchSize != null) {
      const size = normalizeRouletteBatchSize(o.batchSize)
      modes = seedRouletteModes().map((m) => ({ ...m, batchSize: size }))
    }
    // Replace untouched legacy seed library with the new defaults.
    if (
      modes.length > 0 &&
      modes.every((m) => LEGACY_SEED_MODE_IDS.has(m.id)) &&
      !modes.some((m) => m.id === 'full-library-rating' || m.id === 'classic-equal')
    ) {
      const size = normalizeRouletteBatchSize(modes[0]!.batchSize)
      modes = seedRouletteModes().map((m) => ({ ...m, batchSize: size }))
    }
    modes = ensureBuiltinRouletteModes(modes)
    const activeModeId =
      typeof o.activeModeId === 'string' && modes.some((m) => m.id === o.activeModeId)
        ? o.activeModeId
        : modes[0]!.id
    return {
      schema: 'singtags.roulette.v1',
      activeModeId,
      modes,
      openAutomatically: o.openAutomatically === true,
    }
  } catch {
    return fallback
  }
}

function savePrefs(p: RoulettePrefsV1): void {
  try {
    localStorage.setItem(
      ROULETTE_PREFS_KEY,
      JSON.stringify({
        schema: p.schema,
        activeModeId: p.activeModeId,
        modes: p.modes,
        openAutomatically: p.openAutomatically,
      }),
    )
  } catch {
    /* ignore */
  }
}

function defaultSession(): RouletteSessionV1 {
  return {
    schema: 'singtags.rouletteSession.v1',
    modeId: null,
    items: [],
    wheelUsedIds: [],
    sungIds: [],
    dealtAt: null,
  }
}

function loadSession(): RouletteSessionV1 {
  try {
    const raw = localStorage.getItem(ROULETTE_SESSION_KEY)
    if (!raw) return defaultSession()
    const o = JSON.parse(raw) as Partial<RouletteSessionV1>
    const items: RouletteBatchItem[] = []
    if (Array.isArray(o.items)) {
      for (const raw of o.items) {
        if (!raw || typeof raw !== 'object') continue
        const it = raw as Record<string, unknown>
        if (typeof it.id !== 'number' || !Number.isFinite(it.id)) continue
        items.push({
          id: it.id,
          title: typeof it.title === 'string' ? it.title : `Tag #${it.id}`,
          altTitle: typeof it.altTitle === 'string' ? it.altTitle : null,
          arranger: typeof it.arranger === 'string' ? it.arranger : null,
          collection: typeof it.collection === 'string' ? it.collection : null,
          classic:
            typeof it.classic === 'string' || typeof it.classic === 'number' ? it.classic : null,
          rating: typeof it.rating === 'number' ? it.rating : null,
        })
      }
    }
    const asIds = (v: unknown): number[] =>
      Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []
    return {
      schema: 'singtags.rouletteSession.v1',
      modeId: typeof o.modeId === 'string' ? o.modeId : null,
      items,
      wheelUsedIds: asIds(o.wheelUsedIds),
      sungIds: asIds(o.sungIds),
      dealtAt: typeof o.dealtAt === 'string' ? o.dealtAt : null,
    }
  } catch {
    return defaultSession()
  }
}

function saveSession(s: RouletteSessionV1): void {
  try {
    localStorage.setItem(ROULETTE_SESSION_KEY, JSON.stringify(s))
  } catch {
    /* ignore */
  }
}

export const useRouletteStore = defineStore('roulette', () => {
  const initialPrefs = loadPrefs()
  const initialSession = loadSession()

  const modes = ref<RouletteMode[]>(initialPrefs.modes.map(cloneMode))
  const activeModeId = ref(initialPrefs.activeModeId)
  const openAutomatically = ref(initialPrefs.openAutomatically)

  const items = ref<RouletteBatchItem[]>(initialSession.items)
  const wheelUsedIds = ref<number[]>(initialSession.wheelUsedIds)
  const sungIds = ref<number[]>(initialSession.sungIds)
  const dealtAt = ref<string | null>(initialSession.dealtAt)
  const dealStatus = ref<string | null>(null)
  const lastDealModeId = ref<string | null>(initialSession.modeId)

  const sungSet = computed(() => new Set(sungIds.value))
  const wheelUsedSet = computed(() => new Set(wheelUsedIds.value))

  const activeMode = computed((): RouletteMode => {
    return (
      modes.value.find((m) => m.id === activeModeId.value) ??
      modes.value[0] ??
      seedRouletteModes()[0]!
    )
  })

  const batchSize = computed(() => activeMode.value.batchSize)

  function persistPrefs(): void {
    savePrefs({
      schema: 'singtags.roulette.v1',
      activeModeId: activeModeId.value,
      modes: modes.value.map(cloneMode),
      openAutomatically: openAutomatically.value,
    })
  }

  function persistSession(): void {
    saveSession({
      schema: 'singtags.rouletteSession.v1',
      modeId: lastDealModeId.value,
      items: items.value,
      wheelUsedIds: wheelUsedIds.value,
      sungIds: sungIds.value,
      dealtAt: dealtAt.value,
    })
  }

  watch([modes, activeModeId, openAutomatically], () => persistPrefs(), {
    deep: true,
    flush: 'sync',
  })
  watch([items, wheelUsedIds, sungIds, dealtAt, lastDealModeId], () => persistSession(), {
    deep: true,
    flush: 'sync',
  })

  const isBuiltinActive = computed(() => isRouletteBuiltinModeId(activeModeId.value))

  function setActiveModeId(id: string): void {
    if (!modes.value.some((m) => m.id === id)) return
    activeModeId.value = id
  }

  function setOpenAutomatically(on: boolean): void {
    openAutomatically.value = on
  }

  function updateActiveMode(patch: Partial<RouletteMode>): void {
    const idx = modes.value.findIndex((m) => m.id === activeModeId.value)
    if (idx < 0) return
    const cur = modes.value[idx]!
    const builtin = isRouletteBuiltinModeId(cur.id)
    const next: RouletteMode = {
      ...cur,
      ...patch,
      id: cur.id,
      slices: patch.slices ? patch.slices.map((s) => ({ ...s })) : cur.slices.map((s) => ({ ...s })),
    }
    if (builtin) {
      // Built-ins: only curve + score + batch size may change; pools/weights/label stay locked.
      const seed = seedRouletteModes().find((m) => m.id === cur.id)!
      next.label = seed.label
      next.batchSize =
        patch.batchSize != null
          ? normalizeRouletteBatchSize(patch.batchSize)
          : normalizeRouletteBatchSize(cur.batchSize)
      next.batchOrder = seed.batchOrder
      next.slices = seed.slices.map((seedSlice, i) => {
        const incoming = next.slices[i]
        return {
          ...seedSlice,
          score: incoming?.score ?? seedSlice.score,
          curve: incoming?.curve ?? seedSlice.curve,
        }
      })
    } else {
      if (patch.batchSize != null) next.batchSize = normalizeRouletteBatchSize(patch.batchSize)
      if (patch.slices) next.slices = next.slices.map((s) => ({ ...s }))
    }
    const copy = modes.value.map(cloneMode)
    copy[idx] = next
    modes.value = copy
  }

  function setBatchSize(n: RouletteBatchSize): void {
    updateActiveMode({ batchSize: normalizeRouletteBatchSize(n) })
  }

  function setBatchOrder(order: RouletteBatchOrder): void {
    if (isBuiltinActive.value) return
    updateActiveMode({ batchOrder: order })
  }

  function setSlices(slices: RouletteSlice[]): void {
    if (isBuiltinActive.value) {
      const seed = seedRouletteModes().find((m) => m.id === activeModeId.value)
      if (!seed) return
      updateActiveMode({
        slices: seed.slices.map((seedSlice, i) => ({
          ...seedSlice,
          score: slices[i]?.score ?? seedSlice.score,
          curve: slices[i]?.curve ?? seedSlice.curve,
        })),
      })
      return
    }
    updateActiveMode({ slices })
  }

  function renameActiveMode(label: string): void {
    if (isBuiltinActive.value) return
    const trimmed = label.trim()
    if (!trimmed) return
    updateActiveMode({ label: trimmed })
  }

  function blankCustomMode(): RouletteMode {
    return {
      id: 'new-mode',
      label: 'New mode',
      batchSize: 10,
      batchOrder: 'random',
      slices: [{ weightPct: 100, pool: 'all', score: 'uniform', curve: 'equal' }],
    }
  }

  /** Create a custom mode. Pass `from` to duplicate; omit for a blank multi-slice-capable mode. */
  function addMode(from?: RouletteMode): void {
    const base = from ? cloneMode(from) : blankCustomMode()
    let label = from ? `${from.label} copy` : 'New mode'
    let id = slugifyModeLabel(label)
    let n = 2
    while (modes.value.some((m) => m.id === id) || isRouletteBuiltinModeId(id)) {
      id = `${slugifyModeLabel(label)}-${n++}`
    }
    if (modes.value.some((m) => m.label === label)) label = `${label} (${n - 1})`
    modes.value = [...modes.value.map(cloneMode), { ...base, id, label }]
    activeModeId.value = id
  }

  function deleteActiveMode(): boolean {
    if (isBuiltinActive.value) return false
    if (modes.value.length <= 1) return false
    const id = activeModeId.value
    const next = modes.value.filter((m) => m.id !== id).map(cloneMode)
    modes.value = next
    activeModeId.value = next[0]!.id
    return true
  }

  /** Deal from the active mode; clears sung + picked. Pass pool ctx for Favorites / groups. */
  function dealBatch(
    tags: readonly TagSummary[],
    rng?: () => number,
    poolCtx: RoulettePoolContext = {},
  ): RouletteBatchItem[] {
    const mode = activeMode.value
    const result = dealFromMode(tags, mode, rng, poolCtx)
    items.value = result.tags.map(snapshotTag)
    wheelUsedIds.value = []
    sungIds.value = []
    dealtAt.value = new Date().toISOString()
    lastDealModeId.value = mode.id
    dealStatus.value = result.status
    return items.value
  }

  function markSung(id: number): void {
    if (!items.value.some((it) => it.id === id)) return
    if (sungIds.value.includes(id)) return
    sungIds.value = [...sungIds.value, id]
  }

  function markWheelUsed(id: number): void {
    if (!items.value.some((it) => it.id === id)) return
    if (wheelUsedIds.value.includes(id)) return
    wheelUsedIds.value = [...wheelUsedIds.value, id]
  }

  function resetBatch(): void {
    sungIds.value = []
    wheelUsedIds.value = []
  }

  function isSung(id: number): boolean {
    return sungSet.value.has(id)
  }

  function isWheelUsed(id: number): boolean {
    return wheelUsedSet.value.has(id)
  }

  return {
    modes,
    activeModeId,
    activeMode,
    batchSize,
    openAutomatically,
    items,
    wheelUsedIds,
    sungIds,
    dealtAt,
    dealStatus,
    lastDealModeId,
    setActiveModeId,
    setOpenAutomatically,
    setBatchSize,
    setBatchOrder,
    setSlices,
    renameActiveMode,
    updateActiveMode,
    addMode,
    deleteActiveMode,
    isBuiltinActive,
    dealBatch,
    markSung,
    markWheelUsed,
    resetBatch,
    isSung,
    isWheelUsed,
  }
})
