<script setup lang="ts">
/**
 * Experimental / optional features (feature flags).
 */
import { RouterLink } from 'vue-router'
import InfoTips from '../components/InfoTips.vue'
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

function toggleWebrtcTransfer(): void {
  const next = !prefs.webrtcTransferEnabled
  prefs.setWebrtcTransferEnabled(next)
  snackbar.show(
    next
      ? 'Open Wireless transfer from More (same Wi‑Fi or hotspot)'
      : 'Wireless WebRTC transfer is hidden',
    {
      title: next ? 'Wireless Transfer On' : 'Wireless Transfer Off',
      tone: 'ok',
      ms: 3000,
    },
  )
}

function toggleOsShareTransfer(): void {
  const next = !prefs.osShareTransferEnabled
  prefs.setOsShareTransferEnabled(next)
  snackbar.show(
    next
      ? 'Open OS Share from More (Quick Share / AirDrop handoff)'
      : 'OS Share handoff is hidden',
    {
      title: next ? 'OS Share On' : 'OS Share Off',
      tone: 'ok',
      ms: 3000,
    },
  )
}

function toggleAudioRecorder(): void {
  const next = !prefs.audioRecorderEnabled
  prefs.setAudioRecorderEnabled(next)
  snackbar.show(
    next
      ? 'Open More → Audio Recorder to capture multi-take sessions on this device'
      : 'Audio Recorder is hidden — recordings already on this device are kept',
    {
      title: next ? 'Audio Recorder On' : 'Audio Recorder Off',
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

    <section class="card" aria-labelledby="recorder-h">
      <h2 id="recorder-h" class="card-title">Audio Recorder</h2>
      <p class="card-desc">
        Capture multi-take practice sessions on this device, link them to a SingTag, crop with loop
        brackets, and export takes or sessions as files/zips.
      </p>

      <label
        class="setting-row"
        :class="{ on: prefs.audioRecorderEnabled }"
        title="Enable Audio Recorder"
      >
        <span class="setting-copy">
          <span class="setting-title">Audio Recorder</span>
          <span class="setting-desc">
            {{
              prefs.audioRecorderEnabled
                ? 'On — open from More → Audio Recorder'
                : 'Off — More link and /recorder routes stay hidden'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.audioRecorderEnabled"
          :aria-checked="prefs.audioRecorderEnabled"
          aria-label="Audio Recorder"
          @change="toggleAudioRecorder"
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

    <section class="card" aria-labelledby="webrtc-h">
      <div class="card-title-row">
        <h2 id="webrtc-h" class="card-title">Wireless transfer (WebRTC)</h2>
        <InfoTips label="Wireless transfer details" title="Wireless transfer details">
          <p>
            After enabling, open <strong>More → Wireless transfer</strong>. Both phones need SingTags
            and the <strong>same Wi‑Fi or a personal hotspot</strong> (hotspot is often easiest).
            Cellular-only pairs usually fail.
          </p>
          <p>
            Flow: sender creates an offer QR → receiver scans it → receiver shows an answer QR →
            sender scans that → file transfers. Stay on both screens until done. If it stalls, use
            Optical transfer.
          </p>
        </InfoTips>
      </div>
      <p class="card-desc">
        Move a packed queue over a private phone-to-phone link on the same Wi‑Fi or personal hotspot.
        Pair with QR codes — no SingTags servers. Cellular-only pairs usually fail; use Optical then.
      </p>

      <label
        class="setting-row"
        :class="{ on: prefs.webrtcTransferEnabled }"
        title="Enable wireless WebRTC transfer"
      >
        <span class="setting-copy">
          <span class="setting-title">Wireless Transfer</span>
          <span class="setting-desc">
            {{
              prefs.webrtcTransferEnabled
                ? 'Feature available — open from More → Wireless transfer'
                : 'Hidden — More link stays off'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.webrtcTransferEnabled"
          :aria-checked="prefs.webrtcTransferEnabled"
          aria-label="Wireless Transfer"
          @change="toggleWebrtcTransfer"
        />
      </label>
      <RouterLink
        v-if="prefs.webrtcTransferEnabled"
        class="btn"
        to="/wireless"
      >
        Open wireless transfer
      </RouterLink>
    </section>

    <section class="card" aria-labelledby="os-share-h">
      <div class="card-title-row">
        <h2 id="os-share-h" class="card-title">OS Share (Quick Share / AirDrop)</h2>
        <InfoTips label="OS Share details" title="OS Share details">
          <p>
            Not a Quick Share API — SingTags opens the <strong>system share sheet</strong>. Enable,
            then use <strong>More → OS Share</strong>.
          </p>
          <p>
            <strong>Android receive:</strong> install the PWA so SingTags can appear as a share
            target, or Import the saved file. <strong>iPhone receive:</strong> AirDrop into Files,
            then Import on the receive tab.
          </p>
        </InfoTips>
      </div>
      <p class="card-desc">
        Not a Quick Share API — packs your queue and opens the system share sheet so you can pick
        Quick Share, AirDrop, or Files. Android: install the PWA to receive into SingTags. iPhone:
        AirDrop → Files → Import on the receive tab.
      </p>

      <label
        class="setting-row"
        :class="{ on: prefs.osShareTransferEnabled }"
        title="Enable OS Share handoff"
      >
        <span class="setting-copy">
          <span class="setting-title">OS Share Handoff</span>
          <span class="setting-desc">
            {{
              prefs.osShareTransferEnabled
                ? 'Feature available — open from More → OS Share'
                : 'Hidden — More link stays off'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.osShareTransferEnabled"
          :aria-checked="prefs.osShareTransferEnabled"
          aria-label="OS Share Handoff"
          @change="toggleOsShareTransfer"
        />
      </label>
      <RouterLink
        v-if="prefs.osShareTransferEnabled"
        class="btn"
        to="/share"
      >
        Open OS Share
      </RouterLink>
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
.card-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}
.card-title-row .card-title {
  flex: 1;
  min-width: 0;
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
