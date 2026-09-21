import { createHarmonicityScorer } from '../domain/arranging/harmonicity/harmonicityScore'
import { createCandidateRanker } from '../domain/arranging/harmonize'
import { createFixRegistry } from '../domain/arranging/qa'
import { createIndexedDbRepository } from '../adapters/arranging/persistence/indexedDbRepository'
import {
  createBrowserIdGenerator,
  createSystemClock,
} from '../adapters/arranging/persistence/systemServices'
import { createArrangementMidiExporter } from '../adapters/arranging/midi/arrangementMidiExporter'
import { createArrangementMusicXmlExporter } from '../adapters/arranging/musicxml/createMusicXmlExporter'
import { createWebAudioPreview } from '../adapters/arranging/audio/webAudioPreview'
import { createAbcjsNotationRenderer } from '../adapters/arranging/notation/abcjsRenderer'
import type { ArrangementRepository } from '../ports/ArrangementRepository'
import type { AudioPreview } from '../ports/AudioPreview'
import type { Clock } from '../ports/Clock'
import type { IdGenerator } from '../ports/IdGenerator'
import type { ArrangementMidiExporter } from '../ports/ArrangementMidiExporter'
import type { ArrangementMusicXmlExporter } from '../ports/ArrangementMusicXmlExporter'
import type { NotationRenderer } from '../ports/NotationRenderer'
import type { RankerDeps } from '../domain/arranging/harmonize'

export type ArrangingServices = {
  idGen: IdGenerator
  clock: Clock
  repository: ArrangementRepository
  midiExporter: ArrangementMidiExporter
  musicXmlExporter: ArrangementMusicXmlExporter
  /** Fresh preview per caller (dispose on unmount). */
  createAudioPreview: () => AudioPreview
  /** abcjs (or test double) for Learn-panel notation. */
  notationRenderer: NotationRenderer
  rankerDeps: RankerDeps
  fixRegistry: ReturnType<typeof createFixRegistry>
}

export function createArrangingServices(overrides: Partial<ArrangingServices> = {}): ArrangingServices {
  const harmonicity = createHarmonicityScorer()
  const rankerDeps: RankerDeps = {
    harmonicity,
    ...overrides.rankerDeps,
  }
  return {
    idGen: overrides.idGen ?? createBrowserIdGenerator(),
    clock: overrides.clock ?? createSystemClock(),
    repository: overrides.repository ?? createIndexedDbRepository(),
    midiExporter: overrides.midiExporter ?? createArrangementMidiExporter(),
    musicXmlExporter: overrides.musicXmlExporter ?? createArrangementMusicXmlExporter(),
    createAudioPreview: overrides.createAudioPreview ?? createWebAudioPreview,
    notationRenderer: overrides.notationRenderer ?? createAbcjsNotationRenderer(),
    rankerDeps,
    fixRegistry: overrides.fixRegistry ?? createFixRegistry(),
  }
}

let root: ArrangingServices | null = null

export function getArrangingServices(): ArrangingServices {
  if (!root) root = createArrangingServices()
  return root
}

export function setArrangingServicesForTests(services: ArrangingServices | null): void {
  root = services
}

export { createCandidateRanker }
