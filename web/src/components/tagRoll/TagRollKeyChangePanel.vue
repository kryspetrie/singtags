<script setup lang="ts">
/**
 * Tag Studio Key change helper — pick from/to keys, set the transition span,
 * then Hear / Apply ranked modulation paths into Sketch (not a Coach panel).
 */
import { computed, onMounted, onUnmounted } from 'vue'
import { useCoachKeyChange } from '../arranging/useCoachKeyChange'
import { asciiMusicText } from '../../lib/arranging/asciiMusicText'
import { TAG_ROLL_PPQ } from '../../lib/tagRoll/types'
import { useTagRollStore } from '../../stores/tagRoll'

const emit = defineEmits<{
  close: []
}>()

const store = useTagRollStore()
const {
  PC_NAMES,
  fromTonality,
  toTonality,
  measureBudget,
  includeHybrids,
  includePosts,
  holdPc,
  applyStepIndex,
  status,
  span,
  options,
  selected,
  syncFromProject,
  selectPath,
  applyNextStep,
  applyAll,
  hearSelected,
  dispose,
} = useCoachKeyChange()

const measureTicks = computed(() => {
  const p = store.current
  const ppq = p?.ppq ?? TAG_ROLL_PPQ
  const ts = p?.timeSignature ?? { numerator: 4, denominator: 4 }
  return Math.max(1, Math.round((ts.numerator * ppq * 4) / ts.denominator))
})

const startMeasure = computed({
  get(): number {
    return Math.floor(span.value.startTick / measureTicks.value) + 1
  },
  set(m: number) {
    const p = store.current
    if (!p) return
    const tick = Math.max(0, (Math.max(1, Math.round(m)) - 1) * measureTicks.value)
    store.setPlayheadTick(tick)
  },
})

onMounted(() => syncFromProject())
onUnmounted(() => dispose())
</script>

<template>
  <section class="keychange" aria-label="Key change helper">
    <header class="head">
      <div>
        <h3 class="title">Key change</h3>
        <p class="hint">
          Assign the starting and arrival keys, choose how many measures the transition may use
          (from the playhead), then pick a path for guidance — Hear it, apply one chord at a time,
          or plant the whole sequence into Sketch (arrival writes a key marker).
        </p>
      </div>
      <button type="button" class="close" title="Close key change" @click="emit('close')">✕</button>
    </header>

    <div class="controls">
      <label>
        From key
        <select v-model.number="fromTonality">
          <option v-for="(n, i) in PC_NAMES" :key="`f-${i}`" :value="i">{{ n }}</option>
        </select>
      </label>
      <label>
        To key
        <select v-model.number="toTonality">
          <option v-for="(n, i) in PC_NAMES" :key="`t-${i}`" :value="i">{{ n }}</option>
        </select>
      </label>
      <label>
        Start measure
        <input v-model.number="startMeasure" type="number" min="1" max="999" />
      </label>
      <label>
        Transition measures
        <input v-model.number="measureBudget" type="number" min="1" max="8" />
      </label>
      <label class="check">
        <input v-model="includeHybrids" type="checkbox" />
        Hybrid paths
      </label>
      <label class="check">
        <input v-model="includePosts" type="checkbox" />
        Post-cadence holds
      </label>
      <label v-if="includePosts">
        Hold tone
        <select v-model.number="holdPc">
          <option v-for="(n, i) in PC_NAMES" :key="`h-${i}`" :value="i">{{ n }}</option>
        </select>
      </label>
    </div>

    <p class="span">
      Transition window: tick {{ span.startTick }} → {{ span.endTick }} (measure
      {{ startMeasure }} · {{ measureBudget }} bar{{ measureBudget === 1 ? '' : 's' }})
    </p>

    <p v-if="!options.length" class="empty">Pick different from/to keys to see suggestions.</p>
    <ul v-else class="paths" aria-label="Suggested key-change paths">
      <li
        v-for="opt in options"
        :key="opt.path.id"
        :class="{ on: selected?.path.id === opt.path.id, bad: !opt.packOk }"
      >
        <button type="button" class="pick" @click="selectPath(opt.path.id)">
          <strong>{{ asciiMusicText(opt.path.label) }}</strong>
          <span class="meta">
            {{ opt.path.length }} chords · {{ opt.path.character }}
            <template v-if="opt.path.templateId?.startsWith('post-')"> · post</template>
            <template v-if="opt.soft"> · fit {{ Math.round(opt.soft.score * 100) }}%</template>
            <template v-if="!opt.packOk"> · needs {{ opt.neededMeasures ?? '?' }} bars</template>
          </span>
          <span class="steps">{{
            opt.path.steps.map((s) => asciiMusicText(s.romanTo || s.role)).join(' → ')
          }}</span>
        </button>
      </li>
    </ul>

    <div class="row">
      <button
        type="button"
        class="btn"
        :disabled="!selected?.packOk"
        title="Hear the path with smooth TTBB voice leading and strong ringing inversions"
        @click="hearSelected"
      >
        Hear path
      </button>
      <button
        type="button"
        class="btn"
        :disabled="!selected?.packOk"
        title="Apply the next chord into Sketch"
        @click="applyNextStep"
      >
        Apply next
        <span v-if="selected?.patches" class="meta">
          {{ Math.min(applyStepIndex + 1, selected.patches.length) }}/{{ selected.patches.length }}
        </span>
      </button>
      <button
        type="button"
        class="btn primary"
        :disabled="!selected?.packOk"
        title="Apply all steps and set arrival key marker"
        @click="applyAll"
      >
        Apply all
      </button>
    </div>
    <p v-if="status" class="status">{{ status }}</p>
  </section>
</template>

<style scoped>
.keychange {
  display: grid;
  gap: 0.45rem;
  padding: 0.55rem 0.6rem;
  border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--border));
  border-radius: 10px;
  background: color-mix(in srgb, var(--accent) 5%, var(--surface));
  min-width: 0;
}
.head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}
.title {
  margin: 0;
  font-size: 0.92rem;
  font-weight: 750;
}
.hint,
.empty,
.status,
.span {
  margin: 0;
  font-size: 0.75rem;
  color: var(--muted);
  line-height: 1.4;
}
.close {
  flex-shrink: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  font: inherit;
  cursor: pointer;
  min-width: 1.7rem;
  min-height: 1.7rem;
}
.controls {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem 0.65rem;
  align-items: end;
  font-size: 0.75rem;
}
.controls label {
  display: grid;
  gap: 0.15rem;
  font-weight: 650;
}
.controls select,
.controls input[type='number'] {
  font: inherit;
  min-height: 1.7rem;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  padding: 0.1rem 0.35rem;
}
.controls input[type='number'] {
  width: 3.6rem;
}
.controls .check {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  font-weight: 600;
}
.paths {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.28rem;
  max-height: 14rem;
  overflow: auto;
}
.paths li {
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface);
}
.paths li.on {
  border-color: color-mix(in srgb, var(--accent) 50%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.paths li.bad {
  opacity: 0.65;
}
.pick {
  display: grid;
  gap: 0.1rem;
  width: 100%;
  text-align: left;
  border: none;
  background: none;
  padding: 0.35rem 0.45rem;
  cursor: pointer;
  font: inherit;
}
.pick strong {
  font-size: 0.78rem;
  font-weight: 750;
}
.meta,
.steps {
  font-size: 0.7rem;
  color: var(--muted);
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
</style>
