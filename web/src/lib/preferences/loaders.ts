import { normalizeMixPanSetting, type MixPanSetting } from '../../audio/multiPartMix'
import type { LibraryAudioPartsMode } from '../audioParts'
import {
  DEFAULT_PRIMARY_NAV_ORDER,
  normalizePrimaryNavHidden,
  normalizePrimaryNavOrder,
  normalizePrimaryNavPinCount,
  PRIMARY_NAV_PIN_COUNT,
  type PrimaryNavId,
} from '../primaryNav'
import {
  LIBRARY_PARTS_MODE_KEY,
  MIX_PAN_KEY,
  MIX_PAN_KEY_V1,
  MIX_SELECTED_KEY,
  PRIMARY_NAV_HIDDEN_KEY,
  PRIMARY_NAV_ORDER_KEY,
  PRIMARY_NAV_PIN_COUNT_KEY,
  SOLO_IN_FILE_KEY,
} from './keys'
import type { PartSide } from './types'

/** Read library audio parts mode from localStorage. */
export function loadPartsMode(): LibraryAudioPartsMode {
  try {
    const raw = localStorage.getItem(LIBRARY_PARTS_MODE_KEY)
    if (raw === 'all' || raw === 'mix' || raw === 'custom') return raw
  } catch {
    /* ignore */
  }
  return 'all'
}

/** Read per-part left/right map from localStorage (solo channel). */
export function loadSideMap(key: string): Record<string, PartSide> {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, PartSide> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (v === 'left' || v === 'right') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

/** Read Custom-mix pan map (v2 objects, with v1 string migration). */
export function loadMixPanMap(): Record<string, MixPanSetting> {
  try {
    const raw = localStorage.getItem(MIX_PAN_KEY) ?? localStorage.getItem(MIX_PAN_KEY_V1)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, MixPanSetting> = {}
    for (const [k, v] of Object.entries(parsed)) {
      out[k] = normalizeMixPanSetting(v)
    }
    return out
  } catch {
    return {}
  }
}

export function loadMixSelectedMap(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(MIX_SELECTED_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as Record<string, unknown>
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

export function loadPrimaryNavOrder(): PrimaryNavId[] {
  try {
    const raw = localStorage.getItem(PRIMARY_NAV_ORDER_KEY)
    if (!raw) return [...DEFAULT_PRIMARY_NAV_ORDER]
    return normalizePrimaryNavOrder(JSON.parse(raw) as unknown)
  } catch {
    return [...DEFAULT_PRIMARY_NAV_ORDER]
  }
}

export function loadPrimaryNavHidden(): PrimaryNavId[] {
  try {
    const raw = localStorage.getItem(PRIMARY_NAV_HIDDEN_KEY)
    if (!raw) return []
    return normalizePrimaryNavHidden(JSON.parse(raw) as unknown)
  } catch {
    return []
  }
}

export function loadPrimaryNavPinCount(): number {
  try {
    return normalizePrimaryNavPinCount(localStorage.getItem(PRIMARY_NAV_PIN_COUNT_KEY))
  } catch {
    return PRIMARY_NAV_PIN_COUNT
  }
}

export { SOLO_IN_FILE_KEY }
