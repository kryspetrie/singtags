<script setup lang="ts">
/**
 * Experimental / optional features (feature flags).
 */
import { onMounted, ref } from 'vue'
import { RouterLink } from 'vue-router'
import GoogleDriveCacheOfferDialog from '../components/GoogleDriveCacheOfferDialog.vue'
import InfoTips from '../components/InfoTips.vue'
import {
  googleAuthState,
  isDriveSyncEnabled,
  isGoogleConfigured,
  restoreGoogleConnection,
  setDriveSyncEnabled,
  signIn,
  signOut,
  testDriveConnection,
} from '../lib/google/googleAuth'
import {
  driveSyncState,
  ensureDriveHydrate,
  syncDriveAppStateNow,
} from '../lib/google/driveAppStateSync'
import {
  driveCacheSyncState,
  driveCacheTransferLabel,
} from '../lib/google/driveCacheSync'
import { usePreferencesStore } from '../stores/preferences'

const prefs = usePreferencesStore()

const driveSyncOn = ref(isDriveSyncEnabled())
const driveConfigured = isGoogleConfigured()
const driveTestMsg = ref('')

onMounted(restoreGoogleConnection)

function toggleDriveSync(): void {
  driveSyncOn.value = !driveSyncOn.value
  setDriveSyncEnabled(driveSyncOn.value)
  if (driveSyncOn.value && googleAuthState.connected) {
    void ensureDriveHydrate({ allowTokenPrompt: false })
  }
}

const cacheOfferOpen = ref(false)

async function connectGoogle(): Promise<void> {
  driveTestMsg.value = ''
  try {
    await signIn()
    // Hydrate under the same user gesture (token already in memory). Do not mark dirty /
    // push first — that used to upload empty favorites over Drive on a fresh profile.
    await ensureDriveHydrate({ allowTokenPrompt: true })
    cacheOfferOpen.value = true
  } catch {
    /* message shown from googleAuthState.error */
  }
}

async function disconnectGoogle(): Promise<void> {
  driveTestMsg.value = ''
  await signOut()
  driveSyncState.message = ''
}

async function testDrive(): Promise<void> {
  driveTestMsg.value = 'Testing…'
  try {
    const r = await testDriveConnection()
    driveTestMsg.value = `Drive reachable${r.email ? ` as ${r.email}` : ''}.`
  } catch (e) {
    driveTestMsg.value = e instanceof Error ? e.message : String(e)
  }
}

async function syncDriveNow(): Promise<void> {
  driveTestMsg.value = ''
  try {
    await syncDriveAppStateNow()
    const { ensureDriveCacheSync } = await import('../lib/google/driveCacheSync')
    await ensureDriveCacheSync({ allowTokenPrompt: true })
  } catch (e) {
    driveTestMsg.value = e instanceof Error ? e.message : String(e)
  }
}

function toggleLocalLibrary(): void {
  prefs.setLocalLibraryEnabled(!prefs.localLibraryEnabled)
}

function toggleWebrtcTransfer(): void {
  prefs.setWebrtcTransferEnabled(!prefs.webrtcTransferEnabled)
}

function toggleSingTogether(): void {
  prefs.setSingTogetherEnabled(!prefs.singTogetherEnabled)
}

function toggleTagStudio(): void {
  prefs.setTagRollEnabled(!prefs.tagRollEnabled)
}
</script>

<template>
  <section class="labs" aria-label="SingTags Labs">
    <header class="labs-head">
      <h1 class="labs-title">SingTags Labs</h1>
      <p class="labs-intro">
        Optional experiments. Turn features on when you want them; leave them off to keep the main app
        quiet. Optical Transfer and Audio Recorder live under More (not Labs). Static QR codes for
        sharing tags are not controlled here.
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

    <section class="card" aria-labelledby="tag-studio-h">
      <h2 id="tag-studio-h" class="card-title">Tag Studio</h2>
      <p class="card-desc">
        Sketch original tags on a piano-roll grid — polyphonic parts, playback, lyrics, MIDI export,
        Save to My Library, and the Arranging Coach (pillars, ranked suggestions, Check / Polish).
        Experimental Labs composer.
      </p>

      <label
        class="setting-row"
        :class="{ on: prefs.tagRollEnabled }"
        title="Enable Tag Studio"
      >
        <span class="setting-copy">
          <span class="setting-title">Tag Studio</span>
          <span class="setting-desc">
            {{
              prefs.tagRollEnabled
                ? 'Feature available — open from More → Tag Studio (Coach included)'
                : 'Off — More link and /tag-studio stay hidden'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.tagRollEnabled"
          :aria-checked="prefs.tagRollEnabled"
          aria-label="Tag Studio"
          @change="toggleTagStudio"
        />
      </label>
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

    <section class="card" aria-labelledby="sing-together-h">
      <h2 id="sing-together-h" class="card-title">Sing Together</h2>
      <p class="card-desc">
        Build a freeform song repertoire (parts + confidence), show a packed QR on each phone, and
        let a host scan everyone to list songs you can all sing — with part coverage and confidence
        sorts. Not tied to the SingTags catalog.
      </p>

      <label
        class="setting-row"
        :class="{ on: prefs.singTogetherEnabled }"
        title="Enable Sing Together"
      >
        <span class="setting-copy">
          <span class="setting-title">Sing Together</span>
          <span class="setting-desc">
            {{
              prefs.singTogetherEnabled
                ? 'On — open from More → Sing Together'
                : 'Off — More link and /matcher stay hidden'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="prefs.singTogetherEnabled"
          :aria-checked="prefs.singTogetherEnabled"
          aria-label="Sing Together"
          @change="toggleSingTogether"
        />
      </label>
    </section>

    <section class="card" aria-labelledby="drive-sync-h">
      <h2 id="drive-sync-h" class="card-title">Google Drive sync</h2>
      <p class="card-desc">
        Beta — off by default. Sign in with Google to keep preferences, favorites, recents, and Labs
        flags in your private SingTags app folder on Drive (appData). Sheet / track cache mirroring
        is opt-in after you connect. Tag Studio and My Library sync come next. SingTags never sees
        your password.
      </p>
      <p class="card-desc" role="note">
        Your Google email <strong>must</strong> be added by Krys as a beta tester first. If it isn’t
        on the allowlist, Connect will fail — ask Krys to add you before turning this on. The OAuth
        consent screen must also include Drive scope
        <code>drive.appdata</code> (and Drive API enabled), or Google returns “insufficient
        authentication scopes.”
      </p>

      <label class="setting-row" :class="{ on: driveSyncOn }" title="Enable Google Drive sync">
        <span class="setting-copy">
          <span class="setting-title">Google Drive sync</span>
          <span class="setting-desc">
            {{
              !driveConfigured
                ? 'Unavailable — this build has no Google client ID'
                : driveSyncOn
                  ? 'On — Connect only works if Krys listed your email as a beta tester'
                  : 'Off — enable after Krys adds your email as a beta tester'
            }}
          </span>
        </span>
        <input
          type="checkbox"
          class="setting-switch"
          role="switch"
          :checked="driveSyncOn"
          :aria-checked="driveSyncOn"
          :disabled="!driveConfigured"
          aria-label="Google Drive sync"
          @change="toggleDriveSync"
        />
      </label>

      <template v-if="driveConfigured && driveSyncOn">
        <p v-if="googleAuthState.connected" class="card-desc">
          Connected{{ googleAuthState.email ? ` as ${googleAuthState.email}` : '' }}.
        </p>
        <button
          v-if="!googleAuthState.connected"
          type="button"
          class="btn"
          :disabled="googleAuthState.busy"
          @click="connectGoogle"
        >
          Connect Google Drive
        </button>
        <template v-else>
          <button type="button" class="btn" @click="syncDriveNow">Sync now</button>
          <button type="button" class="btn" @click="testDrive">Test connection</button>
          <button type="button" class="btn" @click="disconnectGoogle">Disconnect</button>
        </template>
        <p v-if="googleAuthState.error" class="card-desc" role="alert">{{ googleAuthState.error }}</p>
        <p v-if="driveTestMsg" class="card-desc" role="status">{{ driveTestMsg }}</p>
        <p
          v-if="driveSyncState.message || driveSyncState.pendingDirty"
          class="card-desc"
          role="status"
        >
          <template v-if="driveSyncState.message">Sync: {{ driveSyncState.message }}</template>
          <template v-else-if="driveSyncState.pendingDirty">Sync: pending upload…</template>
          <template v-if="driveSyncState.status !== 'idle'">
            ({{ driveSyncState.status }}{{
              driveSyncState.retryAttempt ? ` #${driveSyncState.retryAttempt}` : ''
            }})
          </template>
        </p>
        <p
          v-if="driveCacheSyncState.message || driveCacheSyncState.status !== 'idle'"
          class="card-desc"
          role="status"
        >
          Song cache:
          {{
            driveCacheTransferLabel() ||
            driveCacheSyncState.message ||
            driveCacheSyncState.status
          }}
        </p>
      </template>
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
            Optical transfer (More → Optical transfer).
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
  </section>
  <GoogleDriveCacheOfferDialog :open="cacheOfferOpen" @close="cacheOfferOpen = false" />
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
