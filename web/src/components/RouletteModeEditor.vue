<script setup lang="ts">
/**
 * Edit the active Tag Roulette mode: slices (pool / curve / score / weight), batch size, order.
 * Weight % drafts may be blank; Apply fills leftovers equally and rejects totals over 100%.
 * Curve glyphs use theme accent tokens only.
 */
import { computed, ref, watch } from 'vue'
import {
  ROULETTE_CURVE_OPTIONS,
  ROULETTE_ORDER_OPTIONS,
  ROULETTE_SCORE_OPTIONS,
  buildRoulettePoolOptions,
  parseWeightPctDraft,
  poolLabel,
  resolveSliceWeights,
  rouletteCurveEffect,
  summarizeMode,
  type RouletteBatchOrder,
  type RoulettePoolId,
  type RouletteScore,
  type RouletteSlice,
} from '../lib/rouletteDraw'
import { useRouletteStore } from '../stores/roulette'
import { useSnackbarStore } from '../stores/snackbar'
import { useUserCollectionsStore } from '../stores/userCollections'

const roulette = useRouletteStore()
const snackbar = useSnackbarStore()
const userCollections = useUserCollectionsStore()

const mode = computed(() => roulette.activeMode)
const isBuiltin = computed(() => roulette.isBuiltinActive)

/** Local Weight % fields; empty string = auto-share remaining %. */
const weightDrafts = ref<string[]>([])

const favoriteGroups = computed(() =>
  userCollections.collections.map((c) => ({
    id: c.id,
    name: c.name,
    tagIds: c.tagIds,
  })),
)

const poolOptions = computed(() => {
  const opts = buildRoulettePoolOptions(favoriteGroups.value)
  // Keep orphaned favgroup pools selectable if a mode still references them.
  for (const s of mode.value.slices) {
    if (!opts.some((o) => o.value === s.pool)) {
      opts.push({ value: s.pool, label: poolLabel(s.pool, favoriteGroups.value) })
    }
  }
  return opts
})

const summary = computed(() => summarizeMode(mode.value, favoriteGroups.value))

const weightPreview = computed(() => {
  const drafts = weightDrafts.value.map(parseWeightPctDraft)
  const filledSum = drafts.reduce<number>((sum, w) => sum + (w ?? 0), 0)
  const blankCount = drafts.filter((w) => w == null).length
  return {
    filledSum,
    blankCount,
    remaining: 100 - filledSum,
    over: filledSum > 100 + 1e-9,
  }
})

function syncWeightDrafts(opts?: { blankAll?: boolean }): void {
  const slices = mode.value.slices
  if (opts?.blankAll) {
    weightDrafts.value = slices.map(() => '')
    return
  }
  weightDrafts.value = slices.map((s) => {
    // Treat 0 as blank so newly added slices start empty.
    if (!s.weightPct) return ''
    return String(Math.round(s.weightPct))
  })
}

watch(
  () => mode.value.id,
  () => {
    if (isBuiltin.value) {
      weightDrafts.value = []
      return
    }
    // Fresh "New mode" starts blank so leftovers fill on Apply.
    const blankAll =
      mode.value.label === 'New mode' &&
      mode.value.slices.length === 1 &&
      mode.value.slices[0]?.weightPct === 100
    syncWeightDrafts({ blankAll })
  },
  { immediate: true },
)

function patchSlice(i: number, patch: Partial<RouletteSlice>): void {
  if (isBuiltin.value) {
    // Built-ins: only curve / score (pools & weights stay locked).
    const allowed: Partial<RouletteSlice> = {}
    if (patch.curve != null) allowed.curve = patch.curve
    if (patch.score != null) allowed.score = patch.score
    if (!Object.keys(allowed).length) return
    patch = allowed
  }
  const slices = mode.value.slices.map((s) => ({ ...s }))
  const cur = slices[i]
  if (!cur) return
  const next = { ...cur, ...patch }
  // Score "—" = true equal odds; Equal curve implies the same.
  if (next.curve === 'equal') next.score = 'uniform'
  else if (patch.score === 'uniform') next.curve = 'equal'
  else if (patch.curve && next.score === 'uniform') next.score = 'rating'
  slices[i] = next
  roulette.setSlices(slices)
}

function addSlice(): void {
  if (isBuiltin.value) return
  if (mode.value.slices.length >= 8) return
  roulette.setSlices([
    ...mode.value.slices.map((s) => ({ ...s })),
    { weightPct: 0, pool: 'all', score: 'uniform', curve: 'equal' },
  ])
  weightDrafts.value = [...weightDrafts.value, '']
}

function removeSlice(i: number): void {
  if (isBuiltin.value) return
  if (mode.value.slices.length <= 1) return
  roulette.setSlices(mode.value.slices.filter((_, j) => j !== i).map((s) => ({ ...s })))
  weightDrafts.value = weightDrafts.value.filter((_, j) => j !== i)
}

function onWeightInput(i: number, e: Event): void {
  const next = [...weightDrafts.value]
  next[i] = (e.target as HTMLInputElement).value
  weightDrafts.value = next
}

function applyWeights(): void {
  if (isBuiltin.value) return
  const drafts = weightDrafts.value.map(parseWeightPctDraft)
  const result = resolveSliceWeights(mode.value.slices, drafts)
  if (!result.ok) {
    snackbar.show(
      'Explicit Weight % values add up to more than 100%. Lower a number or leave a field blank to auto-fill the rest.',
      { title: 'Weights over 100%', tone: 'error', ms: 6000 },
    )
    return
  }
  roulette.setSlices(result.slices)
  weightDrafts.value = result.slices.map((s) => String(Math.round(s.weightPct)))
}

function onLabelBlur(e: Event): void {
  if (isBuiltin.value) return
  roulette.renameActiveMode((e.target as HTMLInputElement).value)
}

function onOrder(e: Event): void {
  if (isBuiltin.value) return
  roulette.setBatchOrder((e.target as HTMLSelectElement).value as RouletteBatchOrder)
}
</script>

<template>
  <section class="editor" aria-labelledby="mode-edit-h">
    <h2 id="mode-edit-h" class="editor-title">Mode settings</h2>
    <p class="summary">{{ summary }}</p>
    <p v-if="isBuiltin" class="hint">
      Built-in mode — pool is fixed. You can change the curve and score only. Duplicate it to make a
      fully editable copy. Batch size is set above.
    </p>

    <div v-if="!isBuiltin" class="row-fields">
      <label class="field grow">
        <span class="lbl">Name</span>
        <input
          type="text"
          class="input"
          :value="mode.label"
          maxlength="48"
          aria-label="Mode name"
          @change="onLabelBlur"
        />
      </label>
      <label class="field grow">
        <span class="lbl">Order</span>
        <select :value="mode.batchOrder" aria-label="Batch order" @change="onOrder">
          <option v-for="o in ROULETTE_ORDER_OPTIONS" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
      </label>
    </div>

    <div v-if="!isBuiltin" class="slices-head">
      <h3 class="slices-title">Distribution slices</h3>
      <button
        type="button"
        class="btn btn-ghost"
        :disabled="mode.slices.length >= 8"
        @click="addSlice"
      >
        Add slice
      </button>
    </div>
        <p v-if="!isBuiltin" class="hint">
      Leave Weight % blank to share the leftover equally. Enter fixed shares where you want them,
      then Apply. Curves shape which tags are favored inside each pool.
      <span v-if="weightPreview.over" class="warn"> Entered {{ weightPreview.filledSum.toFixed(0) }}% — over 100%.</span>
      <span v-else-if="weightPreview.blankCount"> Entered {{ weightPreview.filledSum.toFixed(0) }}% · {{ weightPreview.blankCount }} blank → {{ Math.max(0, weightPreview.remaining).toFixed(0) }}% split.</span>
      <span v-else-if="Math.abs(weightPreview.filledSum - 100) > 0.5"> Entered {{ weightPreview.filledSum.toFixed(0) }}% (under 100% stays as relative shares).</span>
    </p>


    
    <div v-if="!isBuiltin" class="weights-actions">
      <button type="button" class="btn" @click="applyWeights">Apply weights</button>
    </div>

<ul class="slices">
      <li v-for="(slice, i) in mode.slices" :key="i" class="slice">
        <div v-if="!isBuiltin" class="slice-top">
          <label class="field weight">
            <span class="lbl">Weight %</span>
            <input
              type="text"
              class="input"
              inputmode="decimal"
              placeholder="auto"
              :value="weightDrafts[i] ?? ''"
              :aria-label="`Slice ${i + 1} weight`"
              @input="onWeightInput(i, $event)"
              @keydown.enter.prevent="applyWeights"
            />
          </label>
          <label class="field grow">
            <span class="lbl">Pool</span>
            <select
              :value="slice.pool"
              :aria-label="`Slice ${i + 1} pool`"
              @change="
                patchSlice(i, {
                  pool: ($event.target as HTMLSelectElement).value as RoulettePoolId,
                })
              "
            >
              <option v-for="p in poolOptions" :key="p.value" :value="p.value">
                {{ p.label }}
              </option>
            </select>
          </label>
          <button
            type="button"
            class="btn btn-ghost danger"
            :disabled="mode.slices.length <= 1"
            :aria-label="`Remove slice ${i + 1}`"
            @click="removeSlice(i)"
          >
            Remove
          </button>
        </div>
        <p v-else class="builtin-pool">
          Pool: <strong>{{ poolLabel(slice.pool, favoriteGroups) }}</strong>
        </p>

        <fieldset class="curves" :aria-label="`Slice ${i + 1} curve`">
          <legend class="lbl">Curve</legend>
          <div class="curve-grid">
            <label
              v-for="c in ROULETTE_CURVE_OPTIONS"
              :key="c.value"
              class="curve-opt"
              :class="{ on: slice.curve === c.value }"
              :title="c.hint"
            >
              <input
                type="radio"
                class="sr"
                :name="`curve-${i}`"
                :value="c.value"
                :checked="slice.curve === c.value"
                @change="patchSlice(i, { curve: c.value })"
              />
              <svg
                class="curve-glyph"
                viewBox="0 0 48 28"
                aria-hidden="true"
                focusable="false"
              >
                <!--
                  Shared skew path; right = mirror of left.
                  Peak on the left for Left skew, peak on the right for Right skew.
                -->
                <path
                  v-if="c.value === 'leftSkew' || c.value === 'rightSkew'"
                  d="M4 6 Q18 8 28 14 T44 22"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                  :transform="c.value === 'rightSkew' ? 'translate(48 0) scale(-1 1)' : undefined"
                />
                <!-- Equal: flat -->
                <path
                  v-else-if="c.value === 'equal'"
                  d="M4 16 H44"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
                <!-- Bell -->
                <path
                  v-else
                  d="M4 22 Q14 22 18 12 Q24 2 30 12 Q34 22 44 22"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="2.5"
                  stroke-linecap="round"
                />
              </svg>
              <span class="curve-label">{{ c.label }}</span>
              <span class="curve-effect">{{ rouletteCurveEffect(c.value, slice.score) }}</span>
            </label>
          </div>
        </fieldset>

        <label class="field">
          <span class="lbl">Score by</span>
          <select
            :value="slice.score"
            :aria-label="`Slice ${i + 1} score`"
            @change="
              patchSlice(i, {
                score: ($event.target as HTMLSelectElement).value as RouletteScore,
              })
            "
          >
            <option v-for="s in ROULETTE_SCORE_OPTIONS" :key="s.value" :value="s.value">
              {{ s.label }}
            </option>
          </select>
        </label>
      </li>
    </ul>
  </section>
</template>

<style scoped>
.editor {
  display: grid;
  gap: 0.75rem;
  padding: 0.85rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: color-mix(in srgb, var(--surface) 92%, var(--bg));
}
.editor-title {
  margin: 0;
  font-size: 1.02rem;
  font-weight: 700;
  color: var(--text);
}
.summary {
  margin: 0;
  font-size: 0.8rem;
  color: var(--muted);
  line-height: 1.4;
}
.row-fields {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
}
.field {
  display: grid;
  gap: 0.2rem;
  min-width: 6.5rem;
}
.field.grow {
  flex: 1 1 8rem;
}
.field.weight {
  max-width: 5.5rem;
}
.lbl {
  font-size: 0.72rem;
  font-weight: 650;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.03em;
}
.input,
select {
  min-height: var(--touch);
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: inherit;
}
.slices-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.slices-title {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
}
.hint {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.builtin-pool {
  margin: 0;
  font-size: 0.88rem;
  color: var(--muted);
}
.builtin-pool strong {
  color: var(--text);
  font-weight: 650;
}
.slices {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.65rem;
}
.slice {
  display: grid;
  gap: 0.55rem;
  padding: 0.65rem 0.7rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}
.slice-top {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: end;
}
.curves {
  margin: 0;
  padding: 0;
  border: none;
  display: grid;
  gap: 0.35rem;
}
.curve-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.35rem;
}
.curve-opt {
  display: grid;
  gap: 0.2rem;
  justify-items: center;
  padding: 0.4rem 0.25rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: color-mix(in srgb, var(--bg) 40%, var(--surface));
  cursor: pointer;
  color: var(--muted);
}
.curve-opt.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.curve-glyph {
  width: 100%;
  max-width: 3rem;
  height: 1.5rem;
}
.curve-label {
  font-size: 0.68rem;
  font-weight: 650;
  text-align: center;
  line-height: 1.15;
}
.curve-effect {
  font-size: 0.62rem;
  font-weight: 500;
  text-align: center;
  line-height: 1.15;
  color: inherit;
  opacity: 0.85;
}
.sr {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  border: 0;
}
.danger {
  color: var(--danger);
}
@media (max-width: 420px) {
  .curve-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
.warn {
  color: var(--danger, #b00020);
  font-weight: 650;
}
.weights-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  align-items: center;
}
</style>
