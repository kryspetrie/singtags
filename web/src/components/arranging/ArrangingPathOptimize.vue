<script setup lang="ts">
/**
 * Coach Optimize — Path Optimizer (chip chrome aligned with Chords/Suggest).
 */
import { computed, onMounted, ref } from 'vue'
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
}>()

const prefs = usePreferencesStore()
const mode = ref<PathOptimizeMode>(prefs.tagRollPathOptimizePrefs.mode)
const risk = ref(prefs.tagRollPathOptimizePrefs.risk ?? 0.2)
/** 0–1 UI mirror of off / moderate / strong. */
const cadenceStrength = ref(0.55)
const taste = ref<PathOptimizeTaste>(prefs.tagRollPathOptimizePrefs.taste ?? 'classic')
const maxPasses = ref(prefs.tagRollPathOptimizePrefs.maxPasses)
const stopEarly = ref(prefs.tagRollPathOptimizePrefs.stopEarly !== false)
const allowWorsen = ref(!!prefs.tagRollPathOptimizePrefs.allowWorsen)
const showAdvanced = ref(false)
const tastePresets = PATH_OPTIMIZE_TASTE_PRESETS
const autoAdvance = computed({
  get: () => prefs.tagRollChordWalkAutoAdvance,
  set: (on: boolean) => prefs.setTagRollChordWalkAutoAdvance(on),
})

const modes: { id: PathOptimizeMode; label: string; title: string }[] = [
  { id: 'fill', label: 'Fill empty', title: 'Write stacks only where Lead has no known chord' },
  { id: 'revoice', label: 'Revoice', title: 'Keep root and nature; move TTBB placements' },
  { id: 'rechord', label: 'Rechord', title: 'Allow nature/root changes within the ranker' },
  { id: 'full', label: 'Full path', title: 'Fill, then rechord, then revoice' },
]

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
const runLabel = computed(() => (isRunAgain.value ? 'Run again' : 'Run'))

const viableModeSet = computed(() => {
  const list = props.lastReport?.viableModes
  return list?.length ? new Set(list) : null
})

const runDisabled = computed(() => !props.canRun || !!props.busy)

function modeDisabled(id: PathOptimizeMode): boolean {
  if (props.busy) return true
  // Before first run, all modes available. After run, only modes that still move the chart.
  if (!viableModeSet.value) return false
  if (id === mode.value) return false
  return !viableModeSet.value.has(id)
}

function modeTitle(m: { id: PathOptimizeMode; title: string }): string {
  if (props.busy) return `${m.title} — optimize in progress`
  if (modeDisabled(m.id)) {
    return `${m.title} — dry-run: would not change the current path`
  }
  return m.title
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
  })
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
})
</script>

<template>
  <section class="optimize" aria-label="Path Optimizer">
    <h3 class="subh">Optimize</h3>
    <p class="hint">
      Taste presets set a Classic / Circle / Busy profile; Adventure still widens color and leaps.
      Jumpiness watches tenor and bass (bari freer; bass octaves OK). Same mode → Run again
      reseeds then hunts for best. Select notes on the roll to limit range; else whole song.
    </p>

    <div class="row">
      <button
        type="button"
        class="btn primary"
        :disabled="runDisabled"
        :title="
          busy
            ? 'Optimize in progress'
            : isRunAgain
              ? 'Run again with a new seed, then multi-pass refine (same mode)'
              : 'Run Path Optimizer with the options below'
        "
        @click="run()"
      >
        {{ runLabel }}
      </button>
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

    <label
      class="toggle allow"
      title="Skip the safety gate that blocks paths worse than the current chart (jumpiness, motion, lint)."
    >
      <input v-model="allowWorsen" type="checkbox" :disabled="!!busy" />
      Allow worsen
    </label>

    <p v-if="!canRun" class="meta warn">
      Need melody and Sketch pillars before Optimize can run.
    </p>
    <p class="meta">{{ scopeHint }}</p>
    <p v-if="status" class="status" role="status">{{ status }}</p>

    <div class="group" role="group" aria-label="Taste">
      <span class="lbl">Taste</span>
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

    <div class="group" role="group" aria-label="Mode">
      <span class="lbl">Mode</span>
      <div class="chips">
        <button
          v-for="m in modes"
          :key="m.id"
          type="button"
          class="chip"
          :class="{ on: mode === m.id }"
          :disabled="modeDisabled(m.id)"
          :title="modeTitle(m)"
          :aria-pressed="mode === m.id"
          @click="mode = m.id"
        >
          {{ m.label }}
        </button>
      </div>
    </div>

    <label
      class="group slider"
      title="Basic favors obvious majors/sevenths and smooth tenor/bass. Risky opens color chords and freer leaps (bari stays flexible)."
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

    <details
      class="adv"
      :open="showAdvanced"
      @toggle="showAdvanced = ($event.target as HTMLDetailsElement).open"
    >
      <summary>Advanced</summary>
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
        title="When on, each stage stops once pass-to-pass score gain is tiny. When off, runs all Passes and keeps the best path seen."
      >
        <input v-model="stopEarly" type="checkbox" :disabled="!!busy" />
        Stop early on diminishing gains
      </label>
      <label class="toggle">
        <input v-model="autoAdvance" type="checkbox" :disabled="!!busy" />
        Chord Walk: auto-advance after Apply
      </label>
    </details>
  </section>
</template>

<style scoped>
.optimize {
  display: grid;
  gap: 0.4rem;
}
.hint {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.35;
}
.subh {
  margin: 0;
  font-size: 0.82rem;
  font-weight: 700;
}
.row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-size: 0.75rem;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.8rem;
  padding: 0.2rem 0.5rem;
}
.btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
.group {
  display: grid;
  gap: 0.2rem;
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
