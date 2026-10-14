<script setup lang="ts">
/**
 * Coach Optimize — mode-first Path Optimizer (one operation, matching controls).
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { midiPitchLabel } from '../../lib/tagRoll/keySignature'
import { voicingDisplayLabel } from '../../lib/tagRoll/harmonizer/inversionLabel'
import { useTagRollStore } from '../../stores/tagRoll'
import type {
  PathOptimizeMode,
  PathOptimizeReport,
  PathOptimizeTaste,
} from '../../application/arranging/PathOptimize'
import {
  PATH_OPTIMIZE_MAX_PASSES,
  PATH_OPTIMIZE_TASTE_PRESETS,
  tastePreset,
} from '../../application/arranging/PathOptimize'
import {
  applyRevoiceAlternative,
  listRevoiceAlternatives,
  type RevoiceAlternative,
} from '../../domain/arranging/revoiceUnderProfile'
import {
  voicingProfileFromPreset,
  type VoicingPresetId,
  type VoicingProfile,
} from '../../domain/arranging/voicingProfile'
import type { VoicingPitches } from '../../domain/arranging/chords/chords'
import { useArrangementStore } from '../../stores/arrangement'
import { usePreferencesStore } from '../../stores/preferences'

const props = defineProps<{
  status: string | null
  canRun: boolean
  lastReport: PathOptimizeReport | null
  /** Selection present on the roll → Optimize uses that range; else whole song. */
  hasSelection: boolean
  busy?: boolean
  progressFraction?: number
  progressLabel?: string | null
}>()

const emit = defineEmits<{
  run: [
    opts: {
      mode: PathOptimizeMode
      risk: number
      cadenceBias: 'off' | 'moderate' | 'strong'
      taste: PathOptimizeTaste
      maxPasses?: number
      stopEarly?: boolean
      allowWorsen?: boolean
      /** True when repeating the same mode (Run again). */
      explore?: boolean
    },
  ]
  hearVoicing: [midi: VoicingPitches]
  /** Ghost-note preview on the roll (same as Harmonize/Coach Suggest). */
  previewVoicing: [midi: VoicingPitches, startTick: number, durationTicks: number]
  clearVoicingPreview: []
}>()

const prefs = usePreferencesStore()
const arrStore = useArrangementStore()
const mode = ref<PathOptimizeMode>(prefs.tagRollPathOptimizePrefs.mode)
const risk = ref(prefs.tagRollPathOptimizePrefs.risk ?? 0.2)
/** 0–1 UI mirror of off / moderate / strong. */
const cadenceStrength = ref(0.55)
const taste = ref<PathOptimizeTaste>(prefs.tagRollPathOptimizePrefs.taste ?? 'classic')
const maxPasses = ref(prefs.tagRollPathOptimizePrefs.maxPasses)
const stopEarly = ref(prefs.tagRollPathOptimizePrefs.stopEarly !== false)
const allowWorsen = ref(!!prefs.tagRollPathOptimizePrefs.allowWorsen)
const showAdvanced = ref(false)
const tagStore = useTagRollStore()
const voicingProfile = ref<VoicingProfile>(
  prefs.tagRollPathOptimizePrefs.voicingProfile ?? voicingProfileFromPreset('ttbb'),
)
const rangesOpen = computed(() => prefs.tagRollVoicingRangesOpen)
const preferFlats = computed(() => tagStore.current?.preferFlats ?? false)
const inversionIdx = ref(0)
const exploreWalkSeed = ref(0)
const tastePresets = PATH_OPTIMIZE_TASTE_PRESETS
const autoAdvance = computed({
  get: () => prefs.tagRollChordWalkAutoAdvance,
  set: (on: boolean) => prefs.setTagRollChordWalkAutoAdvance(on),
})

const presetChips: { id: VoicingPresetId; label: string }[] = [
  { id: 'ttbb', label: 'TTBB' },
  { id: 'satb', label: 'SATB' },
  { id: 'ssaa', label: 'SSAA' },
  { id: 'custom', label: 'Custom' },
]

type ModeCard = {
  id: PathOptimizeMode
  label: string
  /** Short verb for the primary Run button. */
  runVerb: string
  blurb: string
}

const modes: ModeCard[] = [
  {
    id: 'fill',
    label: 'Fill empty',
    runVerb: 'Fill empties',
    blurb: 'Write stacks only where Lead has no known chord. Keeps existing chords.',
  },
  {
    id: 'revoice',
    label: 'Revoice',
    runVerb: 'Revoice',
    blurb: 'Keep root and quality; place Bass/Bari/Tenor in ensemble ranges (Lead stays on the melody).',
  },
  {
    id: 'rechord',
    label: 'Rechord',
    runVerb: 'Rechord',
    blurb: 'Allow root and quality changes within the ranker. Voice placement follows your taste settings.',
  },
  {
    id: 'full',
    label: 'Full path',
    runVerb: 'Run full path',
    blurb: 'Fill empties, then rechord, then revoice — the complete optimize pass.',
  },
]

const activeMode = computed(() => modes.find((m) => m.id === mode.value) ?? modes[0]!)

/** Chord-choice knobs (taste / adventure / cadence). */
const showChordTaste = computed(
  () => mode.value === 'fill' || mode.value === 'rechord' || mode.value === 'full',
)
/** Ensemble ranges + inversion walk. */
const showVoicing = computed(() => mode.value === 'revoice' || mode.value === 'full')
/** Multi-pass / stop-early matter for path search modes. */
const showPassControls = computed(
  () => mode.value === 'fill' || mode.value === 'rechord' || mode.value === 'full',
)

const walkTick = computed(() => {
  const melId = arrStore.selectedMelodyId
  const mel = arrStore.current?.melody.find((m) => m.id === melId)
  if (mel) return mel.startTick
  const stacks = arrStore.current?.stacks ?? []
  return stacks[0]?.startTick ?? 0
})

const walkStack = computed(() => {
  const p = arrStore.current
  if (!p) return null
  const tick = walkTick.value
  return (
    [...p.stacks]
      .filter((s) => s.startTick <= tick && tick < s.startTick + Math.max(1, s.durationTicks))
      .sort((a, b) => b.startTick - a.startTick)[0] ??
    p.stacks.find((s) => s.startTick === tick) ??
    null
  )
})

const inversionAlts = computed((): RevoiceAlternative[] => {
  if (!showVoicing.value) return []
  const p = arrStore.current
  if (!p || !walkStack.value) return []
  return listRevoiceAlternatives(p, walkTick.value, voicingProfile.value, {
    exploreSeed: exploreWalkSeed.value || undefined,
    limit: 12,
  })
})

watch(inversionAlts, () => {
  inversionIdx.value = Math.min(inversionIdx.value, Math.max(0, inversionAlts.value.length - 1))
})

watch(
  () => prefs.tagRollPathOptimizePrefs.voicingProfile,
  (p) => {
    if (p) voicingProfile.value = p
  },
  { deep: true },
)

watch(showVoicing, (on) => {
  if (!on) emit('clearVoicingPreview')
})

const rangeSummary = computed(() => {
  const p = voicingProfile.value
  const flats = preferFlats.value
  const parts = (['bass', 'bari', 'lead', 'tenor'] as const)
    .map((id) => {
      const b = p.parts[id]
      return `${id[0]!.toUpperCase()} ${midiPitchLabel(b.min, flats)}–${midiPitchLabel(b.max, flats)}`
    })
    .join(' · ')
  return `${parts} · center ${midiPitchLabel(p.pitchCenter, flats)} · span ≤${p.maxOuterSpan}`
})

function altChipLabel(alt: RevoiceAlternative): string {
  const inv = voicingDisplayLabel(alt.voicing) || alt.voicing
  return `${inv} · ${alt.spread ? 'open' : 'closed'}`
}

function previewAlt(alt: RevoiceAlternative): void {
  const stack = walkStack.value
  if (!stack) return
  emit('previewVoicing', alt.midi, stack.startTick, Math.max(1, stack.durationTicks))
  emit('hearVoicing', alt.midi)
}

function cadenceBiasFromStrength(s: number): 'off' | 'moderate' | 'strong' {
  if (s <= 0.25) return 'off'
  if (s <= 0.65) return 'moderate'
  return 'strong'
}

function strengthFromCadenceBias(b: 'off' | 'moderate' | 'strong'): number {
  if (b === 'off') return 0
  if (b === 'moderate') return 0.55
  return 1
}

const cadenceBias = computed(() => cadenceBiasFromStrength(cadenceStrength.value))

const riskLabel = computed(() => {
  if (risk.value <= 0.35) return 'Basic'
  if (risk.value >= 0.75) return 'Risky'
  return 'Balanced'
})

const cadenceLabel = computed(() => {
  const b = cadenceBias.value
  if (b === 'off') return 'Off'
  if (b === 'moderate') return 'Moderate'
  return 'Strong'
})

const scopeHint = computed(() =>
  props.hasSelection ? 'Scope: selection on the roll' : 'Scope: whole song',
)

/** Same mode as the last report → primary button is Run again (reseed explore). */
const isRunAgain = computed(
  () => !!props.lastReport && props.lastReport.mode === mode.value,
)
const runLabel = computed(() =>
  isRunAgain.value ? `${activeMode.value.runVerb} again` : activeMode.value.runVerb,
)

const viableModeSet = computed(() => {
  const list = props.lastReport?.viableModes
  return list?.length ? new Set(list) : null
})

const runDisabled = computed(() => !props.canRun || !!props.busy)

function modeDisabled(id: PathOptimizeMode): boolean {
  if (props.busy) return true
  if (!viableModeSet.value) return false
  if (id === mode.value) return false
  return !viableModeSet.value.has(id)
}

function modeTitle(m: ModeCard): string {
  if (props.busy) return `${m.blurb} — optimize in progress`
  if (modeDisabled(m.id)) {
    return `${m.blurb} — dry-run: would not change the current path`
  }
  return m.blurb
}

function selectMode(id: PathOptimizeMode): void {
  if (modeDisabled(id)) return
  mode.value = id
  persistPrefs()
}

function applyTaste(id: PathOptimizeTaste): void {
  const p = tastePreset(id)
  taste.value = p.id
  risk.value = p.risk
  cadenceStrength.value = strengthFromCadenceBias(p.cadenceBias)
}

function persistPrefs(): void {
  prefs.setTagRollPathOptimizePrefs({
    mode: mode.value,
    risk: risk.value,
    cadenceBias: cadenceBias.value,
    taste: taste.value,
    maxPasses: maxPasses.value,
    stopEarly: stopEarly.value,
    allowWorsen: allowWorsen.value,
    voicingProfile: voicingProfile.value,
  })
}

function applyPreset(id: VoicingPresetId): void {
  if (id === 'custom') {
    voicingProfile.value = { ...voicingProfile.value, presetId: 'custom' }
  } else {
    voicingProfile.value = voicingProfileFromPreset(id)
  }
  persistPrefs()
}

function toggleRangesPanel(): void {
  prefs.toggleTagRollVoicingRangesOpen()
}

function selectInversion(i: number): void {
  const alt = inversionAlts.value[i]
  if (!alt) return
  inversionIdx.value = i
  previewAlt(alt)
}

function applyInversion(): void {
  const p = arrStore.current
  const stack = walkStack.value
  const alt = inversionAlts.value[inversionIdx.value]
  if (!p || !stack || !alt) return
  const next = applyRevoiceAlternative(p, stack.id, alt)
  arrStore.setStacks(next.stacks)
  emit('clearVoicingPreview')
}

function reshuffleInversions(): void {
  exploreWalkSeed.value = (exploreWalkSeed.value || 1) + 1
}

function run(): void {
  if (runDisabled.value) return
  persistPrefs()
  emit('run', {
    mode: mode.value,
    risk: risk.value,
    cadenceBias: cadenceBias.value,
    taste: taste.value,
    maxPasses: maxPasses.value,
    stopEarly: stopEarly.value,
    allowWorsen: allowWorsen.value,
    explore: isRunAgain.value,
  })
}

onMounted(() => {
  const p = prefs.tagRollPathOptimizePrefs
  mode.value = p.mode
  risk.value = p.risk ?? 0.2
  cadenceStrength.value = strengthFromCadenceBias(p.cadenceBias)
  taste.value = p.taste ?? 'classic'
  maxPasses.value = p.maxPasses
  stopEarly.value = p.stopEarly !== false
  allowWorsen.value = !!p.allowWorsen
  voicingProfile.value = p.voicingProfile ?? voicingProfileFromPreset('ttbb')
})

onUnmounted(() => {
  emit('clearVoicingPreview')
})
</script>

<template>
  <section class="optimize" aria-label="Path Optimizer">
    <h3 class="subh">Optimize</h3>

    <div class="mode-tabs" role="tablist" aria-label="Optimize operation">
      <button
        v-for="m in modes"
        :id="`opt-tab-${m.id}`"
        :key="m.id"
        type="button"
        role="tab"
        class="mode-tab"
        :class="{ on: mode === m.id }"
        :aria-selected="mode === m.id"
        :aria-controls="`opt-panel-${m.id}`"
        :disabled="modeDisabled(m.id)"
        :title="modeTitle(m)"
        @click="selectMode(m.id)"
      >
        {{ m.label }}
      </button>
    </div>

    <div
      :id="`opt-panel-${mode}`"
      class="mode-panel"
      role="tabpanel"
      :aria-labelledby="`opt-tab-${mode}`"
    >
      <p class="mode-blurb">{{ activeMode.blurb }}</p>
      <p class="meta">{{ scopeHint }}</p>
      <p v-if="!canRun" class="meta warn">
        Need melody before Optimize can run (Strong-note homes fill in automatically).
      </p>

      <div class="run-row">
        <button
          type="button"
          class="btn primary"
          :disabled="runDisabled"
          :title="
            busy
              ? 'Optimize in progress'
              : isRunAgain
                ? 'Run again with a new seed, then multi-pass refine (same mode)'
                : activeMode.blurb
          "
          @click="run()"
        >
          {{ runLabel }}
        </button>
        <label
          class="toggle allow"
          title="Skip the safety gate that blocks paths worse than the current chart."
        >
          <input v-model="allowWorsen" type="checkbox" :disabled="!!busy" />
          Allow worsen
        </label>
      </div>

      <div
        v-if="busy"
        class="progress"
        role="progressbar"
        :aria-valuenow="Math.round((progressFraction ?? 0) * 100)"
        aria-valuemin="0"
        aria-valuemax="100"
        :aria-label="progressLabel || 'Optimize progress'"
      >
        <div class="progress-track">
          <div
            class="progress-fill"
            :style="{ width: `${Math.min(100, Math.max(0, (progressFraction ?? 0) * 100))}%` }"
          />
        </div>
        <span class="progress-lbl">{{ progressLabel || 'Working…' }}</span>
      </div>

      <p v-if="status" class="status" role="status">{{ status }}</p>

      <!-- Fill / Rechord / Full: chord-choice taste -->
      <template v-if="showChordTaste">
        <div class="group" role="group" aria-label="Taste">
          <span class="lbl">Taste</span>
          <p class="hint">
            Classic / Circle / Busy set adventure and cadence together. Adventure still widens
            color and leaps.
          </p>
          <div class="chips">
            <button
              v-for="t in tastePresets"
              :key="t.id"
              type="button"
              class="chip"
              :class="{ on: taste === t.id }"
              :disabled="!!busy"
              :title="t.title"
              :aria-pressed="taste === t.id"
              @click="applyTaste(t.id)"
            >
              {{ t.label }}
            </button>
          </div>
        </div>

        <label
          class="group slider"
          title="Basic favors obvious majors/sevenths and smooth tenor/bass. Risky opens color chords and freer leaps."
        >
          <span class="lbl">Adventure · {{ riskLabel }}</span>
          <input
            v-model.number="risk"
            type="range"
            min="0"
            max="1"
            step="0.05"
            :disabled="!!busy"
            :aria-valuetext="riskLabel"
          />
          <span class="ends" aria-hidden="true"><span>Basic</span><span>Risky</span></span>
        </label>

        <label
          class="group slider"
          title="How strongly classic cadence highways (V7→I, II7→V7→I, …) bias chord choices."
        >
          <span class="lbl">Cadence bias · {{ cadenceLabel }}</span>
          <input
            v-model.number="cadenceStrength"
            type="range"
            min="0"
            max="1"
            step="0.05"
            :disabled="!!busy"
            :aria-valuetext="cadenceLabel"
          />
          <span class="ends" aria-hidden="true"><span>Off</span><span>Strong</span></span>
        </label>
      </template>

      <!-- Revoice / Full: ensemble ranges + inversion chips -->
      <template v-if="showVoicing">
        <div class="group" role="group" aria-label="Ensemble voicing">
          <span class="lbl">Ensemble ranges</span>
          <p class="hint">
            Optional Ranges strip beside the piano: drag part bands, center, and max span (Sp).
            Only inversions inside those bands appear below.
          </p>
          <div class="chips">
            <button
              v-for="p in presetChips"
              :key="p.id"
              type="button"
              class="chip"
              :class="{ on: voicingProfile.presetId === p.id }"
              :disabled="!!busy"
              :aria-pressed="voicingProfile.presetId === p.id"
              @click="applyPreset(p.id)"
            >
              {{ p.label }}
            </button>
          </div>
          <button
            type="button"
            class="btn ranges-btn"
            :class="{ on: rangesOpen }"
            :disabled="!!busy"
            :aria-pressed="rangesOpen"
            @click="toggleRangesPanel"
          >
            {{ rangesOpen ? 'Hide Ranges strip' : 'Show Ranges strip' }}
          </button>
          <p class="range-sum" :title="rangeSummary">{{ rangeSummary }}</p>
        </div>

        <div class="group inv-row" role="group" aria-label="Inversions in range">
          <span class="lbl">
            Inversions in range
            <template v-if="inversionAlts.length"> · {{ inversionAlts.length }}</template>
          </span>
          <p class="hint">
            Click a chip to ghost-preview and hear on the roll. Apply writes the selection; Run
            revoices the whole scope.
          </p>
          <p v-if="!inversionAlts.length" class="meta warn">
            No inversions fit the current ranges — widen bands or max span on the Ranges strip.
          </p>
          <div v-else class="inv-grid">
            <button
              v-for="(alt, i) in inversionAlts"
              :key="`${alt.voicing}-${alt.spread ? 1 : 0}-${i}`"
              type="button"
              class="inv-chip"
              :class="{ on: i === inversionIdx, open: alt.spread }"
              :disabled="!!busy"
              :aria-pressed="i === inversionIdx"
              :title="altChipLabel(alt)"
              @click="selectInversion(i)"
            >
              <span class="inv-main">{{ voicingDisplayLabel(alt.voicing) || alt.voicing }}</span>
              <span class="inv-meta">{{ alt.spread ? 'open' : 'closed' }} · {{ alt.voicing }}</span>
            </button>
          </div>
          <div class="chips">
            <button
              type="button"
              class="chip"
              :disabled="!inversionAlts.length || !!busy"
              @click="applyInversion"
            >
              Apply selected
            </button>
            <button
              type="button"
              class="chip"
              :disabled="!inversionAlts.length || !!busy"
              title="Shuffle lower-ranked alts"
              @click="reshuffleInversions"
            >
              Shuffle
            </button>
          </div>
        </div>
      </template>

      <details
        class="adv"
        :open="showAdvanced"
        @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open"
      >
        <summary>Advanced</summary>
        <template v-if="showPassControls">
          <label class="field">
            Passes (overlapping windows, up to {{ PATH_OPTIMIZE_MAX_PASSES }})
            <input
              v-model.number="maxPasses"
              type="number"
              min="1"
              :max="PATH_OPTIMIZE_MAX_PASSES"
              step="1"
              :disabled="!!busy"
            />
          </label>
          <label
            class="toggle"
            title="When on, each stage stops once pass-to-pass score gain is tiny."
          >
            <input v-model="stopEarly" type="checkbox" :disabled="!!busy" />
            Stop early on diminishing gains
          </label>
        </template>
        <label class="toggle">
          <input v-model="autoAdvance" type="checkbox" :disabled="!!busy" />
          Chord Walk: auto-advance after Apply
        </label>
      </details>
    </div>
  </section>
</template>

<style scoped>
.optimize {
  display: grid;
  gap: 0.45rem;
}
.subh {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
}
.mode-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.2rem;
  padding: 0.15rem;
  border-radius: 10px;
  background: color-mix(in srgb, var(--border) 55%, transparent);
}
.mode-tab {
  margin: 0;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  min-height: 2rem;
  padding: 0.25rem 0.2rem;
  color: var(--muted);
}
.mode-tab:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.mode-tab.on {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 1px 0 color-mix(in srgb, #000 8%, transparent);
}
.mode-panel {
  display: grid;
  gap: 0.45rem;
}
.mode-blurb {
  margin: 0;
  font-size: 0.84rem;
  font-weight: 650;
  line-height: 1.35;
  color: var(--text);
}
.hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.run-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.55rem;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 700;
  cursor: pointer;
  min-height: 2rem;
  padding: 0.25rem 0.7rem;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.group {
  display: grid;
  gap: 0.25rem;
}
.group.slider input {
  width: 100%;
}
.lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
}
.ends {
  display: flex;
  justify-content: space-between;
  font-size: 0.65rem;
  font-weight: 600;
  color: color-mix(in srgb, var(--muted) 75%, transparent);
  margin-top: -0.05rem;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}
.chip {
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.65rem;
  padding: 0.15rem 0.55rem;
}
.chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.chip.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.inv-row {
  display: grid;
  gap: 0.25rem;
}
.ranges-btn {
  justify-self: start;
}
.ranges-btn.on {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.range-sum {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
  word-break: break-word;
}
.inv-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7.5rem, 1fr));
  gap: 0.3rem;
}
.inv-chip {
  display: grid;
  gap: 0.1rem;
  margin: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0.35rem 0.45rem;
  min-height: 2.4rem;
}
.inv-chip:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.inv-chip.on {
  border-color: color-mix(in srgb, var(--accent) 55%, var(--border));
  background: color-mix(in srgb, var(--accent) 14%, transparent);
}
.inv-chip.open {
  box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 25%, transparent);
}
.inv-main {
  font-size: 0.75rem;
  font-weight: 750;
  color: var(--text);
}
.inv-meta {
  font-size: 0.62rem;
  font-weight: 650;
  color: var(--muted);
}
.meta {
  margin: 0;
  font-size: 0.72rem;
  color: var(--muted);
  line-height: 1.35;
}
.meta.warn {
  color: color-mix(in srgb, #a15c12 70%, var(--muted));
}
.status {
  margin: 0;
  font-size: 0.78rem;
  font-weight: 650;
  color: var(--text);
  line-height: 1.35;
}
.progress {
  display: grid;
  gap: 0.2rem;
}
.progress-track {
  height: 0.35rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--border) 80%, transparent);
  overflow: hidden;
}
.progress-fill {
  height: 100%;
  border-radius: inherit;
  background: color-mix(in srgb, var(--accent) 70%, var(--border));
  transition: width 0.12s linear;
}
.progress-lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
}
.adv {
  font-size: 0.75rem;
}
.adv summary {
  cursor: pointer;
  font-weight: 650;
  color: var(--muted);
}
.field {
  display: grid;
  gap: 0.15rem;
  margin-top: 0.35rem;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
}
.field input {
  font: inherit;
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  padding: 0.25rem 0.4rem;
  min-height: 1.8rem;
  max-width: 6rem;
}
.toggle {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  margin-top: 0.35rem;
}
.toggle.allow {
  margin-top: 0;
}
</style>
