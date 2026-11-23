<script setup lang="ts">
/**
 * App help: what each module / tab is for.
 */
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import {
  coreModuleHelp,
  labsModuleHelp,
  modeModuleHelp,
  type ModuleHelpEntry,
} from '../lib/moduleHelp'
import { isPrimaryNavAvailable, type PrimaryNavGates } from '../lib/primaryNav'
import { usePreferencesStore } from '../stores/preferences'

const prefs = usePreferencesStore()

const gates = computed(
  (): PrimaryNavGates => ({
    localLibraryEnabled: prefs.localLibraryEnabled,
    singTogetherEnabled: prefs.singTogetherEnabled,
    tagStudioEnabled: prefs.tagRollEnabled,
    webrtcTransferEnabled: prefs.webrtcTransferEnabled,
    digitalTunerEnabled: prefs.digitalTunerEnabled,
  }),
)

const core = coreModuleHelp()
const labs = labsModuleHelp()
const modes = modeModuleHelp()

function isLabsEnabled(entry: ModuleHelpEntry): boolean {
  if (!entry.navId || entry.kind !== 'labs') return true
  // Ignore hide-list — Labs availability is the feature flag only.
  return isPrimaryNavAvailable(entry.navId, gates.value, [])
}

function openLabel(entry: ModuleHelpEntry): string {
  if (!entry.path) return ''
  if (entry.kind === 'labs' && !isLabsEnabled(entry)) return 'Enable in Labs'
  return `Open ${entry.title}`
}

function openTo(entry: ModuleHelpEntry): string {
  if (!entry.path) return '/'
  if (entry.kind === 'labs' && !isLabsEnabled(entry)) return '/labs'
  return entry.path
}
</script>

<template>
  <section class="help" aria-label="Help">
    <header class="help-head">
      <h1 class="help-title">Help</h1>
      <p class="help-intro">
        SingTags is organized into modules — the tabs in the nav and the destinations under
        <strong>More</strong>. Here is what each one is for.
      </p>
    </header>

    <section class="help-section" aria-labelledby="help-core-h">
      <h2 id="help-core-h" class="help-section-title">Core</h2>
      <p class="help-section-lead">Always available (unless you hide a page in Settings).</p>
      <ul class="module-list">
        <li v-for="entry in core" :key="entry.id" class="module-card">
          <div class="module-top">
            <h3 class="module-title">{{ entry.title }}</h3>
            <RouterLink class="module-link" :to="openTo(entry)">{{ openLabel(entry) }}</RouterLink>
          </div>
          <p class="module-blurb">{{ entry.blurb }}</p>
          <p v-if="entry.detail" class="module-detail">{{ entry.detail }}</p>
        </li>
      </ul>
    </section>

    <section class="help-section" aria-labelledby="help-labs-h">
      <h2 id="help-labs-h" class="help-section-title">Labs</h2>
      <p class="help-section-lead">
        Optional experiments. Turn them on in
        <RouterLink to="/labs">SingTags Labs</RouterLink>
        when you want them.
      </p>
      <ul class="module-list">
        <li v-for="entry in labs" :key="entry.id" class="module-card">
          <div class="module-top">
            <h3 class="module-title">
              {{ entry.title }}
              <span v-if="!isLabsEnabled(entry)" class="badge off">Off</span>
              <span v-else class="badge on">On</span>
            </h3>
            <RouterLink class="module-link" :to="openTo(entry)">{{ openLabel(entry) }}</RouterLink>
          </div>
          <p class="module-blurb">{{ entry.blurb }}</p>
          <p v-if="entry.detail" class="module-detail">{{ entry.detail }}</p>
        </li>
      </ul>
    </section>

    <section class="help-section" aria-labelledby="help-modes-h">
      <h2 id="help-modes-h" class="help-section-title">More toggles</h2>
      <p class="help-section-lead">Switches in the More menu — not separate tabs.</p>
      <ul class="module-list">
        <li v-for="entry in modes" :key="entry.id" class="module-card">
          <h3 class="module-title">{{ entry.title }}</h3>
          <p class="module-blurb">{{ entry.blurb }}</p>
          <p v-if="entry.detail" class="module-detail">{{ entry.detail }}</p>
        </li>
      </ul>
    </section>

    <p class="help-foot">
      Questions or ideas?
      <a href="mailto:info@singtags.com">Email Krys</a>
      · open
      <strong>About</strong>
      from the SingTags mark in the header for install and offline details.
    </p>
  </section>
</template>

<style scoped>
.help {
  display: grid;
  gap: 1.35rem;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: 0.25rem 0 1.75rem;
}
.help-head {
  display: grid;
  gap: 0.35rem;
}
.help-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.help-intro {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.help-section {
  display: grid;
  gap: 0.55rem;
}
.help-section-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.help-section-lead {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.4;
}
.module-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.55rem;
}
.module-card {
  display: grid;
  gap: 0.3rem;
  padding: 0.85rem 0.95rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
}
.module-top {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
}
.module-title {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}
.module-link {
  flex-shrink: 0;
  font-size: 0.82rem;
  font-weight: 650;
  color: var(--accent);
  text-decoration: none;
}
.module-link:hover {
  text-decoration: underline;
}
.module-blurb {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
}
.module-detail {
  margin: 0;
  font-size: 0.82rem;
  color: var(--muted);
  line-height: 1.4;
}
.badge {
  display: inline-block;
  padding: 0.05rem 0.4rem;
  border-radius: 999px;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  border: 1px solid var(--border);
}
.badge.on {
  color: var(--accent);
  border-color: color-mix(in srgb, var(--accent) 45%, var(--border));
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}
.badge.off {
  color: var(--muted);
  background: color-mix(in srgb, var(--muted) 8%, var(--surface));
}
.help-foot {
  margin: 0;
  font-size: 0.85rem;
  color: var(--muted);
  line-height: 1.45;
}
.help-foot a {
  color: var(--accent);
}
</style>
