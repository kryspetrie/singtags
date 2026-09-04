/**
 * Vue Router table for SingTags views.
 * `/starred` redirects to `/favorites` for legacy bookmarks.
 */
import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TagView from '../views/TagView.vue'
import { onTagReturnBeforeEach, peekTagReturnScrollY } from '../lib/tagReturn'
import { usePreferencesStore } from '../stores/preferences'

/** How Browse should settle scroll after the next home navigation (HomeView reads this). */
export type BrowseScrollIntent = 'top' | 'restore' | null
export let browseScrollIntent: BrowseScrollIntent = null

if (typeof history !== 'undefined' && 'scrollRestoration' in history) {
  // Let Vue Router own scroll; avoid mid-list restores that hide the search bar on open.
  history.scrollRestoration = 'manual'
}

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    {
      path: '/tag/:id',
      name: 'tag',
      component: TagView,
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
      path: '/labs/roulette',
      name: 'labs-roulette',
      component: () => import('../views/RouletteView.vue'),
      meta: { requiresTagRoulette: true },
    },
    {
      path: '/library',
      name: 'library',
      component: () => import('../views/LocalLibraryView.vue'),
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
      path: '/tx',
      name: 'tx',
      component: () => import('../views/OpticalTransferView.vue'),
      meta: { requiresOpticalTransfer: true },
    },
    {
      path: '/rx',
      name: 'rx',
      component: () => import('../views/OpticalTransferView.vue'),
      meta: { requiresOpticalTransfer: true },
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
        return new Promise((resolve) => {
          requestAnimationFrame(() => resolve(saved))
        })
      }
      // goTagBack uses push (skip tag stack) — restore the click position, not search top.
      if (restoreFromTag) {
        browseScrollIntent = 'restore'
        return restoreFromTag
      }
      // Filter/query sync after remount must not wipe the restored scroll.
      if (from?.name === 'home' && to.path === from.path) {
        return false
      }
      browseScrollIntent = 'top'
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
  if (to.meta.requiresOpticalTransfer) {
    try {
      const prefs = usePreferencesStore()
      if (!prefs.opticalTransferEnabled) {
        return { name: 'labs' }
      }
    } catch {
      /* Pinia not ready (rare in tests) — allow navigation */
    }
  }
  if (to.meta.requiresLocalLibrary) {
    try {
      const prefs = usePreferencesStore()
      if (!prefs.localLibraryEnabled) {
        return { name: 'labs' }
      }
    } catch {
      /* Pinia not ready (rare in tests) — allow navigation */
    }
  }
  if (to.meta.requiresTagRoulette) {
    try {
      const prefs = usePreferencesStore()
      if (!prefs.tagRouletteEnabled) {
        return { name: 'labs' }
      }
    } catch {
      /* Pinia not ready (rare in tests) — allow navigation */
    }
  }
})
