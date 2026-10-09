<script setup lang="ts">
/**
 * Coach Home — intended Tag Studio + Coach workflow (landing page).
 */
defineEmits<{
  continue: []
}>()
</script>

<template>
  <section class="landing" aria-label="Coach workflow">
    <h3 class="title">How to use Coach</h3>
    <p class="lead">
      Auto Coach needs Lead + key + Strong/Passing (defaults if unlabeled). High-confidence
      homes lock automatically; amber homes need a one-tap ◆ lock (Home transport:
      <strong>Next review</strong>). Full pillar maps stay optional / advanced. Use the step
      rail (Home > Chords > Check > Auto > Polish).
    </p>

    <ol class="steps">
      <li>
        <strong>Melody &amp; Strong / Passing</strong>
        <span>
          Toolbar > Roles: set the Melody part (M). Mark Strong (structural homes) vs Passing
          (connective) with S / P, or leave blank — Auto assigns from duration, beat, and phrase
          edges. Path Optimize Classic runs from those labels without confirmed pillars.
        </span>
      </li>
      <li>
        <strong>Sketch map (optional / advanced)</strong>
        <span>
          Amber Coach-lane homes are low-confidence Auto guesses — lock with ◆ or change the
          root. Optional: paint a full Sketch pillar map. Not required for Auto Path Optimize.
        </span>
      </li>
      <li>
        <strong>Chords</strong>
        <span>
          Walk each Lead moment, hear ranked voicings, and Apply. Prefer textbook cadences
          (V7->I, II7->V7->I, I7->IV) when the melody implies them.
        </span>
      </li>
      <li>
        <strong>Check</strong>
        <span>
          Clear craft issues in range. Learn explains the rule; Fix all safe applies only
          automatic repairs.
        </span>
      </li>
      <li>
        <strong>Optimize</strong>
        <span>
          Path Optimizer: fill empties, revoice, or rechord for the whole song, a selection, or
          the current chord. Tune VL↔Ring, Run, audition — Try again for alternates. Chord Walk
          keys on Chords: ←→ ↑↓ F H Q.
        </span>
      </li>
      <li>
        <strong>Polish</strong>
        <span>
          Skim the checklist and style factors. Export MIDI / MusicXML from the Tag Studio
          toolbar. Contest / tuning prefs live under Tweaks.
        </span>
      </li>
    </ol>

    <button type="button" class="primary" @click="$emit('continue')">
      Continue to Chords
    </button>
  </section>
</template>

<style scoped>
.landing {
  display: grid;
  gap: 0.75rem;
  padding: 0.15rem 0.1rem 0.5rem;
}
.title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 750;
}
.lead {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: var(--text);
}
.steps {
  margin: 0;
  padding: 0 0 0 1.15rem;
  display: grid;
  gap: 0.65rem;
}
.steps li {
  display: grid;
  gap: 0.2rem;
  font-size: 0.8rem;
  line-height: 1.4;
  color: var(--muted);
}
.steps strong {
  color: var(--text);
  font-size: 0.84rem;
}
.primary {
  justify-self: start;
  margin-top: 0.15rem;
  border: 1px solid color-mix(in srgb, var(--accent) 55%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 16%, transparent);
  color: var(--text);
  font: inherit;
  font-weight: 700;
  padding: 0.45rem 0.85rem;
  cursor: pointer;
}
.primary:hover {
  background: color-mix(in srgb, var(--accent) 24%, transparent);
}
</style>
