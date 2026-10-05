/**
 * Vue Router table for SingTags views.
 * `/starred` redirects to `/favorites` for legacy bookmarks.
 */
import { createRouter, createWebHistory } from 'vue-router'
import { onTagReturnBeforeEach, peekTagReturnScrollY } from '../lib/tagReturn'
import {
  BROWSE_RELOAD_SCROLL_KEY,
  consumeBrowseReloadScroll,
} from '../lib/browseReloadScroll'
import { parseBrowseScrollQuery } from '../lib/browseScrollUrl'
import { usePreferencesStore } from '../stores/preferences'
// Landing route is eager so reload paints Browse with the shell (no async chunk gap).
import HomeView from '../views/HomeView.vue'

/** How Browse should settle scroll after the next home navigation (HomeView reads this). */
export type BrowseScrollIntent = 'top' | 'restore' | null
export let browseScrollIntent: BrowseScrollIntent = null
/** Y from a full-page Browse reload — HomeView re-applies after virtualizer layout. */
export let browseReloadScrollY: number | null = null

if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  // Let Vue Router own scroll; avoid mid-list restores that hide the search bar on open.
  history.scrollRestoration = 'manual'
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/tag/:id',
      name: 'tag',
      component: () => import('../views/TagView.vue'),
      props: true,
    },
    {
      path: '/recent',
      name: 'recent',
      component: () => import('../views/RecentView.vue'),
    },
    {
      path: '/favorites',
      name: 'favorites',
      component: () => import('../views/FavoritesView.vue'),
    },
    { path: '/starred', redirect: '/favorites' },
    {
      path: '/pitch-pipe',
      name: 'pitch-pipe',
      component: () => import('../views/PitchPipeView.vue'),
    },
    {
      path: '/queue',
      name: 'queue',
      component: () => import('../views/QueueView.vue'),
      meta: { requiresZipExports: true },
    },
    {
      path: '/settings',
      name: 'settings',
      component: () => import('../views/SettingsView.vue'),
    },
    {
      path: '/labs',
      name: 'labs',
      component: () => import('../views/LabsView.vue'),
    },
    {
      path: '/labs/pitch-pipe-sound',
      name: 'labs-pitch-pipe-sound',
      component: () => import('../views/PitchPipeSoundLabView.vue'),
    },
    {
      path: '/tag-studio',
      name: 'tag-studio',
      component: () => import('../views/TagRollListView.vue'),
      meta: { requiresTagRoll: true },
    },
    {
      path: '/tag-studio/:id',
      name: 'tag-studio-edit',
      component: () => import('../views/TagRollEditorView.vue'),
      props: true,
      meta: { requiresTagRoll: true },
    },
    {
      path: '/matcher',
      name: 'matcher',
      component: () => import('../views/SingTogetherView.vue'),
      meta: { requiresSingTogether: true },
    },
    {
      path: '/roulette',
      name: 'roulette',
      component: () => import('../views/RouletteView.vue'),
    },
    { path: '/labs/roulette', redirect: '/roulette' },
    {
      path: '/library',
      name: 'library',
      component: () => import('../views/LocalLibraryView.vue'),
      meta: { requiresLocalLibrary: true },
    },
    {
      path: '/library/playlists/:id',
      name: 'library-playlist',
      component: () => import('../views/LocalPlaylistView.vue'),
      props: true,
      meta: { requiresLocalLibrary: true },
    },
    {
      path: '/library/:id',
      name: 'library-doc',
      component: () => import('../views/LocalDocView.vue'),
      props: true,
      meta: { requiresLocalLibrary: true },
    },
    {
      path: '/recorder',
      name: 'recorder',
      component: () => import('../views/RecorderView.vue'),
    },
    {
      path: '/recorder/:id',
      name: 'recorder-session',
      component: () => import('../views/RecorderSessionView.vue'),
      props: true,
    },
    {
      path: '/recorder/:id/take/:takeId/edit',
      name: 'recorder-take-edit',
      component: () => import('../views/RecorderTakeEditView.vue'),
      props: true,
    },
    {
      path: '/tx',
      name: 'tx',
      component: () => import('../views/OpticalTransferView.vue'),
    },
    {
      path: '/rx',
      name: 'rx',
      component: () => import('../views/OpticalTransferView.vue'),
    },
    {
      path: '/wireless',
      name: 'wireless-transfer',
      component: () => import('../views/WirelessTransferView.vue'),
      meta: { requiresWebrtcTransfer: true },
    },
    {
      path: '/wireless/rx',
      name: 'wireless-rx',
      component: () => import('../views/WirelessTransferView.vue'),
      meta: { requiresWebrtcTransfer: true },
    },
    {
      path: '/share',
      redirect: '/tx',
    },
    {
      path: '/share/rx',
      redirect: '/rx',
    },
    {
      path: '/optical-transfer',
      redirect: (to) => {
        const q = { ...to.query }
        if (q.mode === 'receive') delete q.mode
        return {
          path: to.query.mode === 'receive' ? '/rx' : '/tx',
          query: q,
          hash: to.hash,
        }
      },
    },
    /**
     * Unknown paths (stale PWA links, typos, removed routes).
     * Send users to Browse — installed PWAs often have no browser Back.
     */
    { path: '/:pathMatch(.*)*', redirect: (to) => ({ name: 'home', query: to.query, hash: to.hash }) },
  ],
  scrollBehavior(to, from, saved) {
    const tagReturnY = peekTagReturnScrollY()
    const restoreFromTag =
      tagReturnY != null
        ? new Promise<{ left: number; top: number }>((resolve) => {
            requestAnimationFrame(() => resolve({ left: 0, top: tagReturnY }))
          })
        : null

    if (to.name === 'home') {
      // Browser / in-app back: restore after a frame so remounted browse has height.
      if (saved) {
        browseScrollIntent = 'restore'
        browseReloadScrollY = null
        return new Promise((resolve) => {
          requestAnimationFrame(() => resolve(saved))
        })
      }
      // goTagBack uses push (skip tag stack) — restore the click position, not search top.
      if (restoreFromTag) {
        browseScrollIntent = 'restore'
        browseReloadScrollY = null
        return restoreFromTag
      }
      // Filter/query sync after remount must not wipe the restored scroll.
      if (from?.name === 'home' && to.path === from.path) {
        return false
      }
      // Prefer URL tag anchor (`at`) — HomeView scrolls that row under the chrome.
      const urlScroll = parseBrowseScrollQuery(to.query as Record<string, unknown>)
      if (urlScroll.at != null) {
        browseScrollIntent = 'restore'
        browseReloadScrollY = null
        try {
          sessionStorage?.removeItem(BROWSE_RELOAD_SCROLL_KEY)
        } catch {
          /* ignore */
        }
        return false
      }
      // Fallback: sessionStorage from pagehide (reload mid-drag before URL catch-up).
      const reloadY = consumeBrowseReloadScroll()
      if (reloadY != null && reloadY > 0) {
        browseScrollIntent = 'restore'
        browseReloadScrollY = reloadY
        return new Promise((resolve) => {
          requestAnimationFrame(() => resolve({ left: 0, top: reloadY }))
        })
      }
      browseScrollIntent = 'top'
      browseReloadScrollY = null
      // Drop any leftover reload snapshot so nothing can yank mid-list before pin-to-top.
      try {
        sessionStorage?.removeItem(BROWSE_RELOAD_SCROLL_KEY)
      } catch {
        /* ignore */
      }
      if (typeof window !== 'undefined') {
        window.scrollTo(0, 0)
      }
      return { top: 0 }
    }
    browseScrollIntent = null
    if (saved) {
      return new Promise((resolve) => {
        requestAnimationFrame(() => resolve(saved))
      })
    }
    if (restoreFromTag) return restoreFromTag
    // Query-only updates (e.g. ?shift=) must not jump the page to the top.
    if (from && to.path === from.path) return false
    return { top: 0 }
  },
})

router.beforeEach((to, from) => {
  onTagReturnBeforeEach(to, from)
  // Deep links to gated Labs features turn the flag on so shared URLs work.
  try {
    const prefs = usePreferencesStore()
    if (to.meta.requiresWebrtcTransfer && !prefs.webrtcTransferEnabled) {
      prefs.setWebrtcTransferEnabled(true)
    }
    if (to.meta.requiresLocalLibrary && !prefs.localLibraryEnabled) {
      prefs.setLocalLibraryEnabled(true)
    }
    if (to.meta.requiresSingTogether && !prefs.singTogetherEnabled) {
      prefs.setSingTogetherEnabled(true)
    }
    if (to.meta.requiresTagRoll && !prefs.tagRollEnabled) {
      prefs.setTagRollEnabled(true)
    }
    if (to.meta.requiresZipExports && !prefs.zipExportsEnabled) {
      return { name: 'settings' }
    }
  } catch {
    /* Pinia not ready (rare in tests) — allow navigation */
  }
})
