/**
 * Tag Roll project schema — beat-based piano-roll compositions.
 * @see docs/plans/tag-roll.md
 */

import type { PianoSoundEngineId } from '../../audio/pianoSamples'
import type { TagRollSoundEnvelope } from './soundEnvelope'
import { TAG_ROLL_DEFAULT_SOUND_ENVELOPE } from './soundEnvelope'

export const TAG_ROLL_SCHEMA = 'singtags.tagRoll.project.v1' as const

/** Pulses per quarter note. */
export const TAG_ROLL_PPQ = 480

/** Default snap = sixteenth note. */
export const TAG_ROLL_DEFAULT_SNAP_TICKS = TAG_ROLL_PPQ / 4

/** Default project length = 8 measures of 4/4. */
export const TAG_ROLL_DEFAULT_LENGTH_TICKS = TAG_ROLL_PPQ * 4 * 8

/** Default starting tempo. */
export const TAG_ROLL_DEFAULT_BPM = 104

/** Canned BPM choices for tempo controls (type any value; these appear in the list). */
export const TAG_ROLL_BPM_PRESETS = [
  60, 70, 75, 80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 135, 140, 150, 160,
] as const

/** Pitch range for the tote / grid (C2–B5). */
export const TAG_ROLL_MIDI_MIN = 36
export const TAG_ROLL_MIDI_MAX = 83

export type TagRollMidiGroup = 'upper' | 'lower' | 'solo'

/**
 * Barbershop clef family for sheet view:
 * - ttbb: treble-8va-bassa upper (tenor 8va), normal bass lower
 * - ssaa: normal treble upper, bass-8va-alta lower (bass 8va)
 */
export type TagRollClefFamily = 'ttbb' | 'ssaa'

export type TagRollPart = {
  id: string
  name: string
  color: string
  midiGroup: TagRollMidiGroup
  /** Single-letter hotkey to select this part (a–z). */
  hotkey?: string
}

export type TagRollNote = {
  id: string
  partId: string
  midi: number
  startTick: number
  durationTicks: number
  lyric?: string
  /**
   * Melody weight for arranging / Detected (Strong / Passing).
   * Meaningful on the melody part; ignored elsewhere.
   */
  role?: TagRollMelodyRole
}

/** Strong (pmn) / Passing (smn) / unlabeled — mirrors arrangement MelodyRole. */
export type TagRollMelodyRole = 'pmn' | 'smn' | 'unknown'

/**
 * Melody handoff between parts (Lead → Bari, etc.).
 * Drawn as a dashed center-to-center line on the piano roll / sheet cue.
 */
export type TagRollMelodyPass = {
  id: string
  fromNoteId: string
  toNoteId: string
}

/** Closed set for lead-sheet harmony sketch qualities (matches BARBERSHOP_CHORDS). */
export const HARMONY_SKETCH_QUALITIES = [
  'major',
  'minor',
  'seventh',
  'm7',
  'dim',
  'dim7',
  'half-dim',
  'aug',
  'sixth',
  'madd6',
  'ninth',
  'add9',
  'maj7',
] as const

export type HarmonySketchQuality = (typeof HARMONY_SKETCH_QUALITIES)[number]

/** Lead-sheet chord span (root + quality) before TTBB stacks. */
export type HarmonySketchSpan = {
  id: string
  startTick: number
  endTick: number
  rootPc: number
  quality: HarmonySketchQuality
  source: 'user' | 'detect' | 'coach'
  locked: boolean
  /**
   * Structural home-root (Coach pillar). Defaults to true for locked spans when
   * omitted (legacy). Unset / false = Declared chord that is not a pillar.
   */
  pillar?: boolean
}

/** Compose combines note add + edit; selection decides which. */
export type TagRollEditorMode = 'view' | 'compose' | 'lyrics'

/** View-mode surface: piano roll (default) or engraved sheet. */
export type TagRollScoreSurface = 'roll' | 'sheet'

/**
 * Sheet surface layout:
 * - continuous — one horizontal system strip (scroll sideways)
 * - page — wrapped systems packed into page-sized frames
 */
export type TagRollSheetLayout = 'continuous' | 'page'

/**
 * How measure widths are computed (applies to continuous and page):
 * - equal — every bar the same beat-proportional width
 * - dynamic — bar widths follow onset density (busy bars wider, sparse narrower)
 */
export type TagRollSheetMeasureSizing = 'equal' | 'dynamic'

/** Vertical space between grand-staff staves on the sheet. */
export type TagRollSheetStaveGap = 'tight' | 'normal' | 'wide'

/** SMuFL engraving font (noteheads, clefs, beams). */
export type TagRollSheetMusicFont =
  | 'bravura'
  | 'petaluma'
  | 'leland'
  | 'gonville'
  | 'finale-maestro'

/** Text font for lyrics, tempo, part names. */
export type TagRollSheetTextFont =
  | 'academico'
  | 'petaluma-text'
  | 'leland-text'
  | 'roboto-slab'
  | 'finale-maestro-text'

/** Piano-roll filter for melody / Strong–Passing chrome. */
export type TagRollRoleDisplay = 'off' | 'melody' | 'roles' | 'both'

/** Compose/Lyrics pointer: edit notes vs pan the grid (hand tool). */
export type TagRollPointerTool = 'edit' | 'pan'

export type TagRollTimeSignature = {
  /** Beats per measure (e.g. 3 or 4). */
  numerator: number
  /** Beat unit denominator (4 = quarter note). */
  denominator: number
}

export type TagRollTempoMarker = {
  id: string
  tick: number
  bpm: number
}

/** Key signature change (Mods lane); tick 0 mirrors project tonality fields. */
export type TagRollKeyMarker = {
  id: string
  tick: number
  tonality: number
  tonalityMode: 'major' | 'minor'
  preferFlats: boolean
}

export type TagRollFermata = {
  id: string
  kind: 'fermata'
  tick: number
  /** How long to hold at this point (musical ticks). */
  holdTicks: number
  /** Silence after the hold before playback continues (musical ticks). */
  gapTicks: number
}

export type TagRollTempoRamp = {
  id: string
  kind: 'rit' | 'accel'
  startTick: number
  endTick: number
  startBpm: number
  endBpm: number
}

export type TagRollExpression = TagRollFermata | TagRollTempoRamp

export type TagRollExpressionTool = 'tempo' | 'key' | 'fermata' | 'rit' | 'accel' | null

/** Subdivision delayed for swing feel (even notes of the pair). */
export type TagRollSwingUnit = 'eighth' | 'sixteenth'

/**
 * `triplet` — amount morphs straight → 2:1 shuffle.
 * `ratio` — amount morphs straight → heavier (~dotted) split.
 */
export type TagRollSwingStyle = 'ratio' | 'triplet'

/** Playback / export feel; edit grid stays straight score ticks. */
export type TagRollSwing = {
  enabled: boolean
  unit: TagRollSwingUnit
  style: TagRollSwingStyle
  /** 0 = straight, 1 = full target for style. */
  amount: number
}

export type TagRollPartMix = {
  partId: string
  /** Linear gain 0…1.5 (1 = unity). */
  volume: number
  /** Stereo pan −1…+1. */
  pan: number
  mute: boolean
  solo: boolean
}

export type TagRollViewPrefs = {
  cellW: number
  cellH: number
  scrollX: number
  scrollY: number
  lockPiano: boolean
  mode: TagRollEditorMode
  activePartId: string | null
  /** Part the harmonizer treats as the melody / chord-tone anchor (default Lead). */
  melodyPartId: string | null
  /** Playhead position in ticks. */
  playheadTick: number
  /** When true, only the active part is editable; others are faded but still play. */
  focusActivePart: boolean
  /** Tint in-key pitch rows from project tonality / mode. */
  scaleHighlight: boolean
  /**
   * Piano-roll chrome for global melody / Strong–Passing.
   * off | melody outer border | role-colored border | both (role inner + melody outer).
   */
  roleDisplay: TagRollRoleDisplay
  /** Piano-roll note boxes: show pitch name (e.g. Bb). */
  showNoteNames: boolean
  /** Piano-roll note boxes: show lyric syllable after the pitch name. */
  showNoteLyrics: boolean
  /** View mode: piano roll (default) or sheet music. */
  scoreSurface: TagRollScoreSurface
  /** Sheet surface: pixels per beat (independent of piano-roll cellW). */
  sheetZoom: number
  /** Sheet surface: show stacked lyrics under each staff. */
  sheetShowLyrics: boolean
  /** Sheet: continuous strip vs paginated pages. */
  sheetLayout: TagRollSheetLayout
  /** Sheet: equal vs dynamic (content-sized) measure widths. */
  sheetMeasureSizing: TagRollSheetMeasureSizing
  /** Sheet: outline melody / Strong–Passing in color (print-friendly when off). */
  sheetNoteColors: boolean
  /** Sheet: grand-staff gap between upper and lower clefs. */
  sheetStaveGap: TagRollSheetStaveGap
  /** Sheet: global measure-width multiplier (0.5–2). */
  sheetMeasureScale: number
  /**
   * Sheet: per-onset column spacing for dynamic measure sizing.
   * Higher = more room between notes in dense bars.
   */
  sheetNoteSpacing: number
  /** Equal sizing: stretch beats horizontally (time-proportional width). */
  sheetBeatStretch: number
  /** Multiplier on grand-staff gap (after Tight/Normal/Wide preset). */
  sheetStaveGapFine: number
  /** Page layout: vertical gap between systems. */
  sheetSystemGap: number
  /** Room above staves for tempo / expression marks. */
  sheetTopMargin: number
  /** Lyric font size (px) under staves. */
  sheetLyricSize: number
  /**
   * Per-part lyric vertical nudge in VexFlow textLine units (0 = default stack).
   * Positive moves the lyric line further below the staff.
   */
  sheetLyricOffsets: Record<string, number>
  /** Tint sounding notes during transport playback. */
  sheetPlaybackHighlight: boolean
  /** Title / credits block above the score in sheet view. */
  sheetShowEngravedHeader: boolean
  /** Footer note block below the score. */
  sheetShowEngravedFooter: boolean
  /** Left/right page padding multiplier. */
  sheetPadding: number
  /** Minimum measure width floor multiplier. */
  sheetMinBarWidth: number
  /** Clef / key / time gutter on system starts. */
  sheetClefGutter: number
  /** Equal sizing: beats → horizontal space multiplier. */
  sheetTimeFactor: number
  /** Space below the bottom staff per system. */
  sheetBottomMargin: number
  /** Page/score margins in inches (inside page frame, or strip padding when continuous). */
  sheetMarginLeftIn: number
  sheetMarginRightIn: number
  sheetMarginTopIn: number
  sheetMarginBottomIn: number
  /**
   * Scales music notation (staff line spacing, noteheads, clefs) via VexFlow stave space.
   * Independent of page size / margins.
   */
  sheetEngravingScale: number
  /**
   * Scales score content (measure widths + vertical gaps + engraving) inside the margins.
   * Page size and margins stay fixed.
   */
  sheetScoreScale: number
  /** Page layout: printable page width in inches (default Letter 8.5). */
  sheetPageWidthIn: number
  /** Page layout: printable page height in inches (default Letter 11). */
  sheetPageHeightIn: number
  /** Page layout: CSS px per inch for screen/print preview (default 96). */
  sheetPageDpi: number
  /** SMuFL music font. */
  sheetMusicFont: TagRollSheetMusicFont
  /** Text font for lyrics and labels. */
  sheetTextFont: TagRollSheetTextFont
  /** Staff line thickness multiplier. */
  sheetStaffLineWeight: number
  /** Part names at the start of each system. */
  sheetPartNames: boolean
  /** Sheet surface pan (independent of piano-roll scrollX/Y). */
  sheetScrollX: number
  sheetScrollY: number
}

export type TagRollProject = {
  schema: typeof TAG_ROLL_SCHEMA
  id: string
  title: string
  /** Optional subtitle under the title on the sheet. */
  subtitle: string
  /** Left credit on the sheet (below subtitle). */
  composer: string
  /** Right credit on the sheet (below subtitle). */
  arranger: string
  /** Optional footer note under the score. */
  sheetNote: string
  /** Starting / legacy BPM; kept in sync with the tempo marker at tick 0. */
  bpm: number
  ppq: typeof TAG_ROLL_PPQ
  snapTicks: number
  lengthTicks: number
  timeSignature: TagRollTimeSignature
  tempoMarkers: TagRollTempoMarker[]
  /** Key signature changes over time; tick 0 matches tonality / tonalityMode / preferFlats. */
  keyMarkers: TagRollKeyMarker[]
  expressions: TagRollExpression[]
  soundEngine: PianoSoundEngineId
  /**
   * Pitch-pipe synth voice: built-in `mellow` / `bright`, or a Sound Lab library id.
   * Also used for the blow-pitch intro (even when `soundEngine` is `samples`).
   */
  pitchPipeSoundId: string
  /**
   * When true, play/export a one-measure centered pitch-pipe tonic immediately
   * before the first measure that contains notes. Decay finishes before notes.
   */
  blowPitchEnabled: boolean
  /** Click the arrangement meter during live playback (downbeat vs other beats). */
  metronomeEnabled: boolean
  /**
   * When metronome + swing are on, also click swing-unit subdivisions (swung “ands”).
   * Playhead rate already warps wall-clock, so crossing those ticks sounds swung.
   */
  metronomeSwing: boolean
  /**
   * Swing / shuffle feel for playback + MP3 bounce.
   * MIDI can optionally bake swung ticks into the exported score.
   */
  swing: TagRollSwing
  /**
   * When true (default), MIDI export rewrites note times with swing baked in.
   * Ignored when swing is off.
   */
  midiBakeSwing: boolean
  /** Attack / note-off decay for built-in synth & samples. */
  soundEnvelope: TagRollSoundEnvelope
  /** Pitch-class root (0=C … 11=B) — scale highlight + blow-pitch tonic. */
  tonality: number
  /** Major vs minor feel for scale highlight / engraved key. Default major. */
  tonalityMode: 'major' | 'minor'
  preferFlats: boolean
  /** TTBB (tenor 8va) or SSAA (bass 8va) clefs for sheet view. Default ttbb. */
  clefFamily: TagRollClefFamily
  parts: TagRollPart[]
  /** Per-part mute/solo/pan/volume. */
  mix: TagRollPartMix[]
  notes: TagRollNote[]
  /** Cross-part melody handoffs (dashed lines on the roll). */
  melodyPasses: TagRollMelodyPass[]
  /**
   * Lead-sheet style harmony sketch (root + quality over time).
   * Locked spans are authoritative; detect fills holes only.
   */
  harmonySketch: HarmonySketchSpan[]
  localEntryId: string | null
  view: TagRollViewPrefs
  createdAt: number
  updatedAt: number
}

export { TAG_ROLL_DEFAULT_SOUND_ENVELOPE }
export type { TagRollSoundEnvelope }

/** Default TTBB palette (not shared with learning-track UI today). */
export const TAG_ROLL_DEFAULT_PARTS: readonly Omit<TagRollPart, 'id'>[] = [
  { name: 'Tenor', color: '#c45c26', midiGroup: 'upper', hotkey: 't' },
  { name: 'Lead', color: '#1d6a9f', midiGroup: 'upper', hotkey: 'l' },
  { name: 'Bari', color: '#2f7d4a', midiGroup: 'lower', hotkey: 'r' },
  { name: 'Bass', color: '#5b3d8f', midiGroup: 'lower', hotkey: 'b' },
]

export const TAG_ROLL_DEFAULT_TIME_SIGNATURE: TagRollTimeSignature = {
  numerator: 4,
  denominator: 4,
}

export const TAG_ROLL_DEFAULT_CLEF_FAMILY: TagRollClefFamily = 'ttbb'

export const TAG_ROLL_DEFAULT_VIEW: TagRollViewPrefs = {
  cellW: 28,
  cellH: 14,
  scrollX: 0,
  scrollY: 0,
  lockPiano: false,
  mode: 'compose',
  activePartId: null,
  melodyPartId: null,
  playheadTick: 0,
  focusActivePart: false,
  scaleHighlight: true,
  /** Opt-in chrome — roll stays clean until Marks / Roles turns filters on. */
  roleDisplay: 'off',
  showNoteNames: true,
  showNoteLyrics: true,
  scoreSurface: 'roll',
  sheetZoom: 40,
  sheetShowLyrics: true,
  sheetLayout: 'continuous',
  sheetMeasureSizing: 'equal',
  sheetNoteColors: true,
  sheetStaveGap: 'tight',
  sheetMeasureScale: 1,
  sheetNoteSpacing: 1,
  sheetBeatStretch: 1,
  sheetStaveGapFine: 0.85,
  sheetSystemGap: 0.65,
  sheetTopMargin: 0.85,
  sheetLyricSize: 11,
  sheetLyricOffsets: {},
  sheetPlaybackHighlight: true,
  sheetShowEngravedHeader: true,
  sheetShowEngravedFooter: true,
  sheetPadding: 1,
  sheetMinBarWidth: 1,
  sheetClefGutter: 0.9,
  sheetTimeFactor: 1,
  sheetBottomMargin: 0.75,
  sheetMarginLeftIn: 0.3,
  sheetMarginRightIn: 0.3,
  sheetMarginTopIn: 0.3,
  sheetMarginBottomIn: 0.3,
  sheetEngravingScale: 0.9,
  sheetScoreScale: 0.95,
  sheetPageWidthIn: 8.5,
  sheetPageHeightIn: 11,
  sheetPageDpi: 96,
  sheetMusicFont: 'bravura',
  sheetTextFont: 'academico',
  sheetStaffLineWeight: 1,
  sheetPartNames: false,
  sheetScrollX: 0,
  sheetScrollY: 0,
}

export const TAG_ROLL_CELL_W_MIN = 20
/** High enough that fill-width floors never pin zoom at the ceiling. */
export const TAG_ROLL_CELL_W_MAX = 640
export const TAG_ROLL_CELL_H_MIN = 8
export const TAG_ROLL_CELL_H_MAX = 32

export const TAG_ROLL_SHEET_ZOOM_MIN = 16
export const TAG_ROLL_SHEET_ZOOM_MAX = 160

/** Ruler height (px) — taller in compose so playhead scrubbing is easier. */
export const TAG_ROLL_RULER_H = 16
export const TAG_ROLL_RULER_H_COMPOSE = 28

/**
 * Pitch-plane header reservation for the legacy top Chords strip (removed —
 * Declared/Detected are bottom lanes). Kept at 0-sum for any leftover imports.
 */
export const TAG_ROLL_HARMONY_STRIP_CHROME_H = 0
export const TAG_ROLL_HARMONY_STRIP_LANE_H = 0
export const TAG_ROLL_HARMONY_STRIP_DETECT_H = 0
export const TAG_ROLL_HARMONY_STRIP_H = 0

export const TAG_ROLL_TIME_SIGNATURE_PRESETS: readonly TagRollTimeSignature[] = [
  { numerator: 4, denominator: 4 },
  { numerator: 3, denominator: 4 },
  { numerator: 2, denominator: 4 },
  { numerator: 6, denominator: 8 },
  { numerator: 5, denominator: 4 },
]
