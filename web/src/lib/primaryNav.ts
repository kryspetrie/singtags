/**
 * Primary nav catalog: which pages can occupy the chrome pin slots
 * (topnav / bottom bar). Remaining available pages surface in More.
 */

/** Default pin slots (excludes the fixed More control). */
export const PRIMARY_NAV_PIN_COUNT = 5
/** Hard ceiling when overriding max menu size. */
export const PRIMARY_NAV_PIN_COUNT_MAX = 12
/** Minimum bottom-tab width before we refuse another pin (+ More). */
export const PRIMARY_NAV_BOTTOM_MIN_TAB_PX = 48

export const PRIMARY_NAV_IDS = [
  'browse',
  'recent',
  'favorites',
  'pitch-pipe',
  'roulette',
  'settings',
  'library',
  'recorder',
  'matcher',
  'tag-studio',
  'tx',
  'wireless',
  'share',
  'labs',
  'queue',
] as const

export type PrimaryNavId = (typeof PRIMARY_NAV_IDS)[number]

const PRIMARY_NAV_ID_SET = new Set<string>(PRIMARY_NAV_IDS)

export type PrimaryNavGates = {
  localLibraryEnabled: boolean
  audioRecorderEnabled: boolean
  singTogetherEnabled: boolean
  tagStudioEnabled: boolean
  opticalTransferEnabled: boolean
  webrtcTransferEnabled: boolean
  osShareTransferEnabled: boolean
}

/** Labs destinations — “Hide feature” toggles the Labs flag instead of a hide list. */
export const PRIMARY_NAV_LAB_IDS = [
  'library',
  'recorder',
  'matcher',
  'tag-studio',
  'tx',
  'wireless',
  'share',
] as const

export type PrimaryNavLabId = (typeof PRIMARY_NAV_LAB_IDS)[number]

const PRIMARY_NAV_LAB_SET = new Set<string>(PRIMARY_NAV_LAB_IDS)

export function isPrimaryNavLab(id: PrimaryNavId): id is PrimaryNavLabId {
  return PRIMARY_NAV_LAB_SET.has(id)
}

/** Settings must stay reachable; other non-lab pages can be hidden from chrome/More. */
export function canHidePrimaryNav(id: PrimaryNavId): boolean {
  return id !== 'settings'
}

/**
 * Zip export queue (Downloads & Exports) is available unless the user hid that page.
 * When false, enqueue UIs and `/queue` should be disabled.
 */
export function isZipExportQueueEnabled(hidden: readonly PrimaryNavId[]): boolean {
  return !hidden.includes('queue')
}

export type PrimaryNavItem = {
  id: PrimaryNavId
  label: string
  /** Short label for the mobile bottom tab. */
  shortLabel: string
  path: string
  /** Unicode / emoji icon for bottom tabs (Favorites uses Font Awesome separately). */
  icon: string
  /** Optional Font Awesome icon pair; when set, preferred over `icon`. */
  faIcon?: ['fas', string]
  desc: string
}

export const PRIMARY_NAV_ITEMS: Record<PrimaryNavId, PrimaryNavItem> = {
  browse: {
    id: 'browse',
    label: 'Browse',
    shortLabel: 'Browse',
    path: '/',
    icon: '⌕',
    desc: 'Search and browse the SingTags catalog',
  },
  recent: {
    id: 'recent',
    label: 'Recent',
    shortLabel: 'Recent',
    path: '/recent',
    icon: '◷',
    desc: 'Tags you opened recently',
  },
  favorites: {
    id: 'favorites',
    label: 'Favorites',
    shortLabel: 'Favorites',
    path: '/favorites',
    icon: '♥',
    faIcon: ['fas', 'heart'],
    desc: 'Starred tags and collections',
  },
  'pitch-pipe': {
    id: 'pitch-pipe',
    label: 'Pitch Pipe',
    shortLabel: 'Pitch',
    path: '/pitch-pipe',
    icon: '♪',
    desc: 'Pitch pipe and practice tones',
  },
  roulette: {
    id: 'roulette',
    label: 'Roulette',
    shortLabel: 'Roulette',
    path: '/roulette',
    icon: '◎',
    desc: 'Deal a random batch of tags',
  },
  settings: {
    id: 'settings',
    label: 'Settings',
    shortLabel: 'Settings',
    path: '/settings',
    icon: '⚙',
    desc: 'Theme, scale, cache, and offline',
  },
  library: {
    id: 'library',
    label: 'My Library',
    shortLabel: 'Library',
    path: '/library',
    icon: '▤',
    desc: 'Charts, images, and tracks on this device',
  },
  recorder: {
    id: 'recorder',
    label: 'Audio Recorder',
    shortLabel: 'Record',
    path: '/recorder',
    icon: '●',
    desc: 'Multi-take practice sessions on this device',
  },
  matcher: {
    id: 'matcher',
    label: 'Sing Together',
    shortLabel: 'Together',
    path: '/matcher',
    icon: '♫',
    desc: 'Share repertoire via QR — what can we all sing?',
  },
  'tag-studio': {
    id: 'tag-studio',
    label: 'Tag Studio',
    shortLabel: 'Studio',
    path: '/tag-studio',
    icon: '▥',
    desc: 'Piano-roll composer for original tags',
  },
  tx: {
    id: 'tx',
    label: 'Optical transfer',
    shortLabel: 'Optical',
    path: '/tx',
    icon: '▦',
    desc: 'Send or receive files via animated QR codes',
  },
  wireless: {
    id: 'wireless',
    label: 'Wireless transfer',
    shortLabel: 'Wireless',
    path: '/wireless',
    icon: '≋',
    desc: 'Same Wi‑Fi / hotspot file link (QR pairing)',
  },
  share: {
    id: 'share',
    label: 'OS Share',
    shortLabel: 'Share',
    path: '/share',
    icon: '↗',
    desc: 'Quick Share / AirDrop via the system share sheet',
  },
  labs: {
    id: 'labs',
    label: 'SingTags Labs',
    shortLabel: 'Labs',
    path: '/labs',
    icon: '⚗',
    desc: 'Experimental features and feature flags',
  },
  queue: {
    id: 'queue',
    label: 'Downloads & Exports',
    shortLabel: 'Downloads',
    path: '/queue',
    icon: '↓',
    desc: 'Download queue for sheets and learning tracks',
  },
}

/** Default order: current primary five, then More destinations. */
export const DEFAULT_PRIMARY_NAV_ORDER: readonly PrimaryNavId[] = [
  'browse',
  'recent',
  'favorites',
  'pitch-pipe',
  'roulette',
  'settings',
  'library',
  'recorder',
  'matcher',
  'tag-studio',
  'tx',
  'wireless',
  'share',
  'labs',
  'queue',
]

export function isPrimaryNavId(raw: unknown): raw is PrimaryNavId {
  return typeof raw === 'string' && PRIMARY_NAV_ID_SET.has(raw)
}

/** Normalize a persisted hide list (non-lab ids only; Settings never hidden). */
export function normalizePrimaryNavHidden(raw: unknown): PrimaryNavId[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<PrimaryNavId>()
  const out: PrimaryNavId[] = []
  for (const v of raw) {
    if (!isPrimaryNavId(v) || seen.has(v)) continue
    if (isPrimaryNavLab(v) || !canHidePrimaryNav(v)) continue
    seen.add(v)
    out.push(v)
  }
  return out
}

/** Whether a nav page is currently available (Labs flags + optional hide list). */
export function isPrimaryNavAvailable(
  id: PrimaryNavId,
  gates: PrimaryNavGates,
  hidden: readonly PrimaryNavId[] = [],
): boolean {
  switch (id) {
    case 'library':
      return gates.localLibraryEnabled
    case 'recorder':
      return gates.audioRecorderEnabled
    case 'matcher':
      return gates.singTogetherEnabled
    case 'tag-studio':
      return gates.tagStudioEnabled
    case 'tx':
      return gates.opticalTransferEnabled
    case 'wireless':
      return gates.webrtcTransferEnabled
    case 'share':
      return gates.osShareTransferEnabled
    default:
      return !hidden.includes(id)
  }
}

/**
 * Normalize a persisted order: keep known ids in order, append any missing
 * defaults, drop unknowns / dupes.
 */
export function normalizePrimaryNavOrder(raw: unknown): PrimaryNavId[] {
  const seen = new Set<PrimaryNavId>()
  const out: PrimaryNavId[] = []
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (!isPrimaryNavId(v) || seen.has(v)) continue
      seen.add(v)
      out.push(v)
    }
  }
  for (const id of DEFAULT_PRIMARY_NAV_ORDER) {
    if (seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** Available pages in preference order. */
export function availablePrimaryNavOrder(
  order: readonly PrimaryNavId[],
  gates: PrimaryNavGates,
  hidden: readonly PrimaryNavId[] = [],
): PrimaryNavId[] {
  return order.filter((id) => isPrimaryNavAvailable(id, gates, hidden))
}

/** Clamp a preferred pin-slot count (1…MAX). */
export function normalizePrimaryNavPinCount(raw: unknown): number {
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(n)) return PRIMARY_NAV_PIN_COUNT
  return Math.max(1, Math.min(PRIMARY_NAV_PIN_COUNT_MAX, Math.round(n)))
}

/**
 * How many pin slots fit in the mobile bottom bar (excluding More).
 * Uses a minimum tab width so labels/icons do not crush together.
 */
export function maxBottomNavPins(barWidthPx: number): number {
  if (!(barWidthPx > 0)) return PRIMARY_NAV_PIN_COUNT
  const slots = Math.floor(barWidthPx / PRIMARY_NAV_BOTTOM_MIN_TAB_PX)
  return Math.max(1, Math.min(PRIMARY_NAV_PIN_COUNT_MAX, slots - 1))
}

/** Preferred count limited by what the current chrome can physically hold. */
export function resolvePrimaryNavPinCount(preferred: number, fitCapacity: number): number {
  const pref = normalizePrimaryNavPinCount(preferred)
  const fit = Math.max(1, Math.floor(fitCapacity))
  return Math.max(1, Math.min(pref, fit, PRIMARY_NAV_PIN_COUNT_MAX))
}

/**
 * How many leading pin buttons fit beside a fixed More control given widths (px).
 * Drops from the right; always returns at least 1 when any pin is offered.
 */
export function fitNavPinsToWidth(
  pinWidthsPx: readonly number[],
  moreWidthPx: number,
  gapPx: number,
  availablePx: number,
): number {
  if (!pinWidthsPx.length) return 1
  if (!(availablePx > 0) || !(moreWidthPx >= 0)) return 1
  const gap = Math.max(0, gapPx)
  let used = moreWidthPx
  let count = 0
  for (const w of pinWidthsPx) {
    const next = used + gap + Math.max(0, w)
    if (next > availablePx + 0.5) break
    used = next
    count += 1
  }
  return Math.max(1, count)
}

/** First `pinCount` available pages for the chrome bars. */
export function pinnedPrimaryNavIds(
  order: readonly PrimaryNavId[],
  gates: PrimaryNavGates,
  hidden: readonly PrimaryNavId[] = [],
  pinCount: number = PRIMARY_NAV_PIN_COUNT,
): PrimaryNavId[] {
  const n = normalizePrimaryNavPinCount(pinCount)
  return availablePrimaryNavOrder(order, gates, hidden).slice(0, n)
}

/** Available pages after the pin slots — shown in More. */
export function morePrimaryNavIds(
  order: readonly PrimaryNavId[],
  gates: PrimaryNavGates,
  hidden: readonly PrimaryNavId[] = [],
  pinCount: number = PRIMARY_NAV_PIN_COUNT,
): PrimaryNavId[] {
  const n = normalizePrimaryNavPinCount(pinCount)
  return availablePrimaryNavOrder(order, gates, hidden).slice(n)
}

/**
 * Map a route name to its primary-nav id (including nested library/recorder routes).
 */
export function primaryNavIdForRouteName(name: unknown): PrimaryNavId | null {
  if (typeof name !== 'string') return null
  switch (name) {
    case 'home':
      return 'browse'
    case 'recent':
      return 'recent'
    case 'favorites':
      return 'favorites'
    case 'pitch-pipe':
      return 'pitch-pipe'
    case 'roulette':
      return 'roulette'
    case 'settings':
      return 'settings'
    case 'library':
    case 'library-doc':
    case 'library-playlist':
      return 'library'
    case 'recorder':
    case 'recorder-session':
    case 'recorder-take-edit':
      return 'recorder'
    case 'matcher':
      return 'matcher'
    case 'tag-studio':
    case 'tag-studio-edit':
      return 'tag-studio'
    case 'tx':
    case 'rx':
      return 'tx'
    case 'wireless-transfer':
    case 'wireless-rx':
      return 'wireless'
    case 'os-share-transfer':
    case 'os-share-rx':
      return 'share'
    case 'labs':
    case 'labs-pitch-pipe-sound':
      return 'labs'
    case 'queue':
      return 'queue'
    default:
      return null
  }
}

/** Move `id` to `toIndex` within `order` (clamped). */
export function movePrimaryNavId(
  order: readonly PrimaryNavId[],
  id: PrimaryNavId,
  toIndex: number,
): PrimaryNavId[] {
  const next = normalizePrimaryNavOrder(order)
  const from = next.indexOf(id)
  if (from < 0) return next
  const clamped = Math.max(0, Math.min(next.length - 1, toIndex))
  if (from === clamped) return next
  next.splice(from, 1)
  next.splice(clamped, 0, id)
  return next
}

/**
 * Reorder among currently available destinations only; gated/hidden ids keep
 * their relative slots in the full preference order.
 */
export function moveAvailablePrimaryNavId(
  order: readonly PrimaryNavId[],
  id: PrimaryNavId,
  toAvailableIndex: number,
  gates: PrimaryNavGates,
  hidden: readonly PrimaryNavId[] = [],
): PrimaryNavId[] {
  const full = normalizePrimaryNavOrder(order)
  const available = availablePrimaryNavOrder(full, gates, hidden)
  const from = available.indexOf(id)
  if (from < 0) return full
  const nextAvail = [...available]
  nextAvail.splice(from, 1)
  const clamped = Math.max(0, Math.min(nextAvail.length, toAvailableIndex))
  nextAvail.splice(clamped, 0, id)
  let ai = 0
  return full.map((x) => (isPrimaryNavAvailable(x, gates, hidden) ? nextAvail[ai++]! : x))
}
