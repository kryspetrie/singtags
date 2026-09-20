import { createAudioBounce } from '../adapters/tagRoll/audioBounce'
import { createIndexedDbTagRollRepository } from '../adapters/tagRoll/indexedDbRepository'
import { createLocalLibraryIngest } from '../adapters/tagRoll/libraryIngest'
import { createMidiExporter } from '../adapters/tagRoll/midiExporter'
import { createMusicXmlExporter } from '../adapters/tagRoll/musicXmlExporter'
import {
  createBrowserIdGenerator,
  createSystemClock,
} from '../adapters/system/systemServices'
import type { AudioBounce } from '../ports/AudioBounce'
import type { Clock } from '../ports/Clock'
import type { IdGenerator } from '../ports/IdGenerator'
import type { LibraryIngest } from '../ports/LibraryIngest'
import type { MidiExporter } from '../ports/MidiExporter'
import type { MusicXmlExporter } from '../ports/MusicXmlExporter'
import type { TagRollRepository } from '../ports/TagRollRepository'

/** Wired Tag Studio services (production defaults + test overrides). */
export type TagStudioServices = {
  idGen: IdGenerator
  clock: Clock
  repository: TagRollRepository
  midiExporter: MidiExporter
  musicXmlExporter: MusicXmlExporter
  audioBounce: AudioBounce
  libraryIngest: LibraryIngest
}

export function createTagStudioServices(
  overrides: Partial<TagStudioServices> = {},
): TagStudioServices {
  return {
    idGen: overrides.idGen ?? createBrowserIdGenerator(),
    clock: overrides.clock ?? createSystemClock(),
    repository: overrides.repository ?? createIndexedDbTagRollRepository(),
    midiExporter: overrides.midiExporter ?? createMidiExporter(),
    musicXmlExporter: overrides.musicXmlExporter ?? createMusicXmlExporter(),
    audioBounce: overrides.audioBounce ?? createAudioBounce(),
    libraryIngest: overrides.libraryIngest ?? createLocalLibraryIngest(),
  }
}

let root: TagStudioServices | null = null

export function getTagStudioServices(): TagStudioServices {
  if (!root) root = createTagStudioServices()
  return root
}

/** Replace the composition root (tests). Pass `null` to reset to lazy production. */
export function setTagStudioServicesForTests(services: TagStudioServices | null): void {
  root = services
}
