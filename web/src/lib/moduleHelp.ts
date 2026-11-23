/**
 * Help-page copy for SingTags modules (primary nav tabs + More destinations).
 * Short `blurb` is the intended-use sentence; `detail` expands when useful.
 */
import {
  PRIMARY_NAV_ITEMS,
  isPrimaryNavLab,
  type PrimaryNavId,
} from './primaryNav'

export type ModuleHelpKind = 'core' | 'labs' | 'mode'

export type ModuleHelpEntry = {
  id: string
  title: string
  /** Path to open when available; null for non-routable modes. */
  path: string | null
  kind: ModuleHelpKind
  /** Primary nav id when this entry maps to a pin/More destination. */
  navId?: PrimaryNavId
  blurb: string
  detail?: string
}

/** Always-on modules (and utilities that are not Labs-gated). */
const CORE_ORDER = [
  'browse',
  'recent',
  'favorites',
  'pitch-pipe',
  'roulette',
  'help',
  'recorder',
  'tx',
  'queue',
  'settings',
  'labs',
] as const satisfies readonly PrimaryNavId[]

/** Labs-gated modules — enable under SingTags Labs. */
const LABS_ORDER = [
  'tag-studio',
  'library',
  'matcher',
  'tuner',
  'wireless',
] as const satisfies readonly PrimaryNavId[]

const CORE_HELP: Record<
  (typeof CORE_ORDER)[number],
  { blurb: string; detail?: string }
> = {
  browse: {
    blurb: 'Search and browse the weekly SingTags catalog mirror.',
    detail:
      'Open a tag to play learning tracks, view the sheet, star it, or queue downloads. This is the main repertoire entry point.',
  },
  recent: {
    blurb: 'Jump back to tags you opened lately on this device.',
  },
  favorites: {
    blurb: 'Starred tags and collections for quick recall and offline caching.',
    detail: 'Star from a tag page or Browse; favorites can keep sheets and lo-fi tracks on-device.',
  },
  'pitch-pipe': {
    blurb: 'Give starting pitches and practice tones without leaving SingTags.',
    detail: 'Use before a tag or in rehearsal when you just need a reliable pitch reference.',
  },
  roulette: {
    blurb: 'Deal a random batch of tags for warmups, sectionals, or “what next?”',
  },
  help: {
    blurb: 'Overview of every module and tab — what each one is for.',
    detail: 'You can pin, reorder, or hide Help in Settings → Navigation like other pages.',
  },
  recorder: {
    blurb: 'Capture multi-take practice sessions on this device.',
    detail: 'Handy for self-rehearsal takes you want to keep local — not a cloud studio.',
  },
  tx: {
    blurb: 'Send or receive files with animated QR codes (screen → camera).',
    detail:
      'Best when devices cannot share a network. Pair with Optical receive (/rx) on the other device.',
  },
  queue: {
    blurb: 'Build a zip of sheet music and learning tracks across several tags.',
    detail: 'Add from Browse/Recent/Favorites multiselect, a tag’s Download section, or My Library export.',
  },
  settings: {
    blurb: 'Theme, scale, offline caches, and which pages sit in the nav vs More.',
  },
  labs: {
    blurb: 'Turn optional experiments on or off so the main app stays quiet until you want them.',
    detail: 'Labs flags gate Tag Studio, My Library, Sing Together, Digital Tuner, Wireless transfer, and Drive sync.',
  },
}

const LABS_HELP: Record<(typeof LABS_ORDER)[number], { blurb: string; detail?: string }> = {
  'tag-studio': {
    blurb: 'Piano-roll composer for writing and editing original tags.',
    detail:
      'Compose parts, lyrics, harmony sketch, sheet layout, and tuplets. Export MIDI / MusicXML / audio or save into My Library.',
  },
  library: {
    blurb: 'Charts, images, and tracks you keep on this device (and optional Drive sync).',
    detail: 'Your own repertoire shelf — not the public catalog. Good for personal charts and Tag Studio saves.',
  },
  matcher: {
    blurb: 'Share repertoire via QR and see what everyone in the room can sing.',
    detail: 'Compare favorites / library sets across phones without emailing lists.',
  },
  tuner: {
    blurb: 'On-device pitch tuner for solo practice and rehearsal glance.',
    detail: 'Mic audio stays on your device. Tune, FFT, and spectrogram surfaces live under Labs.',
  },
  wireless: {
    blurb: 'Same Wi‑Fi / hotspot file link with QR pairing (faster than optical when the network works).',
  },
}

const MODE_HELP: ModuleHelpEntry[] = [
  {
    id: 'sing-mode',
    title: 'Sing mode',
    path: null,
    kind: 'mode',
    blurb: 'When on, Browse / Recent / Favorites open tags straight into sheet fullscreen.',
    detail: 'Toggle from More. Turn off when you want the full tag page (player, downloads, share).',
  },
  {
    id: 'offline-mode',
    title: 'Offline mode',
    path: null,
    kind: 'mode',
    blurb: 'Force cached content only — pauses live catalog fetches and downloads.',
    detail: 'Toggle from More. Useful on a plane or weak venue Wi‑Fi after sheets/tracks are cached.',
  },
]

function entryForNav(
  id: PrimaryNavId,
  help: { blurb: string; detail?: string },
): ModuleHelpEntry {
  const item = PRIMARY_NAV_ITEMS[id]
  return {
    id,
    title: item.label,
    path: item.path,
    kind: isPrimaryNavLab(id) ? 'labs' : 'core',
    navId: id,
    blurb: help.blurb,
    detail: help.detail,
  }
}

export function coreModuleHelp(): ModuleHelpEntry[] {
  return CORE_ORDER.map((id) => entryForNav(id, CORE_HELP[id]))
}

export function labsModuleHelp(): ModuleHelpEntry[] {
  return LABS_ORDER.map((id) => entryForNav(id, LABS_HELP[id]))
}

export function modeModuleHelp(): ModuleHelpEntry[] {
  return MODE_HELP
}

/** Flat list in display order for tests / search. */
export function allModuleHelp(): ModuleHelpEntry[] {
  return [...coreModuleHelp(), ...labsModuleHelp(), ...modeModuleHelp()]
}
