<script setup lang="ts">
/**
 * Selected-moment context — presentational only (DTO from CoachContext).
 */
import { glossaryTitle } from '../../lib/arranging/glossaryTooltip'
import type { MomentContextDto } from '../../application/arranging/CoachContext'

defineProps<{
  ctx: MomentContextDto
}>()

const emit = defineEmits<{
  hear: []
  addPillar: []
  extendPillar: []
}>()

const pillarTip = glossaryTitle('pillar')
const strongTip = glossaryTitle('pmn')
const passingTip = glossaryTitle('smn')
const heldTip =
  'Held Lead (post) — the melody sustains while other parts may change chords underneath.'

function roleTitle(label: string | null): string {
  if (!label) return ''
  if (/strong/i.test(label)) return strongTip
  if (/pass/i.test(label)) return passingTip
  return label
}
</script>

<template>
  <article class="ctx-card" :data-kind="ctx.kind">
    <header class="ctx-head">
      <strong class="title">{{ ctx.title }}</strong>
      <span v-if="ctx.roman" class="roman" title="Roman numeral / scale-degree reading">{{
        ctx.roman
      }}</span>
      <span v-if="ctx.heldLead" class="post" :title="heldTip">Post</span>
      <span v-if="ctx.roleLabel" class="role" :title="roleTitle(ctx.roleLabel)">{{
        ctx.roleLabel
      }}</span>
      <span
        v-if="ctx.functionLabel"
        class="fn"
        title="Harmonic function relative to the local pillar / key"
        >{{ ctx.functionLabel }}</span
      >
    </header>
    <p v-if="ctx.voicing" class="voicing">
      Voicing <code :title="'Bass → bari → lead → tenor stacked reading'">{{ ctx.voicing }}</code>
      <span class="legend">{{ ctx.voicingLegend }}</span>
    </p>
    <p class="meta">
      Lead {{ ctx.leadPitch }}
      <template v-if="ctx.pillarLabel">
        ·
        <span :title="pillarTip || 'Home root under this moment'">Pillar {{ ctx.pillarLabel }}</span>
      </template>
      <template v-if="ctx.layerLabel">
        ·
        <span :title="glossaryTitle('pcf') || ctx.layerLabel">{{ ctx.layerLabel }}</span>
      </template>
      <template v-if="ctx.scfLabel">
        ·
        <span :title="glossaryTitle('scf') || ctx.scfLabel">{{ ctx.scfLabel }}</span>
      </template>
    </p>
    <p v-if="ctx.narrative" class="narrative">{{ ctx.narrative }}</p>
    <p v-if="ctx.bestAltHint" class="alt">{{ ctx.bestAltHint }}</p>
    <div class="actions">
      <button
        v-if="ctx.kind === 'stack'"
        type="button"
        class="btn"
        title="Audition the current stack voicing"
        @click="emit('hear')"
      >
        Hear
      </button>
      <template v-if="ctx.kind === 'gap' && !ctx.pillarLabel">
        <button
          type="button"
          class="btn primary"
          :title="pillarTip || 'Add a home-root pillar covering this moment'"
          @click="emit('addPillar')"
        >
          Add pillar
        </button>
        <button
          type="button"
          class="btn"
          title="Stretch the previous pillar forward to cover this moment"
          @click="emit('extendPillar')"
        >
          Extend previous
        </button>
      </template>
    </div>
  </article>
</template>

<style scoped>
.ctx-card {
  display: grid;
  gap: 0.3rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
}
.ctx-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 0.35rem;
}
.title {
  font-size: 0.95rem;
}
.roman {
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--accent);
}
.post,
.role,
.fn {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 6px;
  background: color-mix(in srgb, #5b3d8f 22%, transparent);
}
.role {
  background: color-mix(in srgb, #1d6a9f 22%, transparent);
}
.fn {
  background: color-mix(in srgb, var(--accent) 18%, transparent);
}
.voicing,
.meta,
.narrative,
.alt,
.legend {
  margin: 0;
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.voicing code {
  font-weight: 700;
  color: var(--text);
}
.legend {
  margin-left: 0.35rem;
}
.narrative {
  color: var(--text);
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}
.btn {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  min-height: 1.8rem;
  padding: 0.2rem 0.5rem;
}
.btn.primary {
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}
</style>
