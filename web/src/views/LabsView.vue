<script setup lang="ts">
/**
 * Experimental / optional features (feature flags).
 */
import { RouterLink } from 'vue-router'
import { usePreferencesStore } from '../stores/preferences'
import { useSnackbarStore } from '../stores/snackbar'

const prefs = usePreferencesStore()
const snackbar = useSnackbarStore()

function toggleOpticalTransfer(): void {
  const next = !prefs.opticalTransferEnabled
  prefs.setOpticalTransferEnabled(next)
  snackbar.show(
    next
      ? 'Send and receive files with animated QR codes from More'
      : 'Animated QR transfer is hidden — static share QR codes still work',
    {
      title: next ? 'Optical Transfer On' : 'Optical Transfer Off',
      tone: 'ok',
      ms: 3000,
    },
  )
}

function toggleLocalLibrary(): void {
  const next = !prefs.localLibraryEnabled
  prefs.setLocalLibraryEnabled(next)
  snackbar.show(
    next
      ? 'Open My Library from More to manage charts, images, and tracks on this device'
      : 'My Library is hidden — songs already on this device are kept',
    {
      title: next ? 'My Library On' : 'My Library Off',
      tone: 'ok',
      ms: 3000,
    },
  )
}

</script>

<template>
  <section class="labs" aria-label="SingTags Labs">
    <header class="labs-head">
      <h1 class="labs-title">SingTags Labs</h1>
      <p class="labs-intro">
        Optional experiments. Turn features on when you want them; leave them off to keep the main app
        quiet. Static QR codes for sharing tags are not controlled here.
      </p>
    </header>

    <section class="card" aria-labelledby="pitch-sound-h">
      <h2 id="pitch-sound-h" class="card-title">Pitch pipe sound</h2>
      <p class="card-desc">
        Design alternate pitch-pipe / pay-the-key voices, A/B against classic, save candidates on
        this device, and set your personal default. Share a favorite with Krys via email.
      </p>
      <RouterLink class="btn" to="/labs/pitch-pipe-sound">Open sound lab</RouterLink>
    </section>

    <section class="card" aria-labelledby="local-library-h">
      <h2 id="local-library-h" class="card-title">My Library</h2>
      <p class="card-desc">
        Keep your own charts, images, and learning tracks on this device — with pitch, transfer, and
        a Tag-like player. Separate from the published SingTags catalog.
      </p>

      <label
        class="setting-row"
        :class="{ on: prefs.localLibraryEnabled }"
        title="Enable My Library"
      >
        <span class="setting-copy">
          <span class="setting-title">My Library</span>
          <span class="setting-desc">
            {{
              prefs.localLibraryEnabled
                ? 'Feature available — open from More → My Library'
                : 'Hidden — More link and /library routes are off'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.localLibraryEnabled"
          :aria-checked="prefs.localLibraryEnabled"
          aria-label="My Library"
          @change="toggleLocalLibrary"
        />
      </label>
    </section>

    <section class="card" aria-labelledby="optical-h">
      <h2 id="optical-h" class="card-title">Optical transfer</h2>
      <p class="card-desc">
        Animated (rolling) QR streams for ad-hoc file send/receive via More → Optical transfer and
        the Browse camera. Does not affect normal share QR codes. Catalog tag list buttons were
        removed — use My Library for curated songs you keep on this device.
      </p>

      <label
        class="setting-row"
        :class="{ on: prefs.opticalTransferEnabled }"
        title="Enable animated QR optical transfer"
      >
        <span class="setting-copy">
          <span class="setting-title">Optical Transfer</span>
          <span class="setting-desc">
            {{
              prefs.opticalTransferEnabled
                ? 'Feature available — open from More, or use receive links'
                : 'Hidden — More link and animated QR transfer are off'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.opticalTransferEnabled"
          :aria-checked="prefs.opticalTransferEnabled"
          aria-label="Optical Transfer"
          @change="toggleOpticalTransfer"
        />
      </label>
    </section>
  </section>
</template>

<style scoped>
.labs {
  display: grid;
  gap: 1rem;
  width: 100%;
  max-width: 40rem;
  margin: 0 auto;
  padding: 0.25rem 0 1.5rem;
}
.labs-head {
  display: grid;
  gap: 0.35rem;
}
.labs-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 750;
  letter-spacing: -0.02em;
}
.labs-intro {
  margin: 0;
  color: var(--muted);
  font-size: 0.92rem;
  line-height: 1.45;
}
.card {
  display: grid;
  gap: 0.65rem;
  padding: 0.9rem 1rem;
  border: 1px solid var(--border);
  border-radius: var(--radius, 10px);
  background: var(--surface);
}
.card-title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 700;
}
.card-desc {
  margin: 0;
  color: var(--muted);
  font-size: 0.88rem;
  line-height: 1.45;
}
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin: 0;
  padding: 0.55rem 0.65rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--surface) 92%, var(--bg));
  cursor: pointer;
}
.setting-row.on {
  border-color: color-mix(in srgb, var(--accent) 40%, var(--border));
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}
.setting-copy {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
}
.setting-title {
  font-size: 0.95rem;
  font-weight: 650;
  color: var(--text);
}
.setting-desc {
  font-size: 0.78rem;
  color: var(--muted);
  line-height: 1.35;
}
.setting-switch {
  flex-shrink: 0;
  width: 2.75rem;
  height: 1.55rem;
  appearance: none;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: color-mix(in srgb, var(--muted) 22%, var(--surface));
  position: relative;
  cursor: pointer;
  transition: background 0.15s ease, border-color 0.15s ease;
}
.setting-switch::after {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 1.15rem;
  height: 1.15rem;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.25);
  transition: transform 0.15s ease;
}
.setting-switch:checked {
  background: var(--accent);
  border-color: var(--accent);
}
.setting-switch:checked::after {
  transform: translateX(1.15rem);
}
.setting-switch:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
</style>
