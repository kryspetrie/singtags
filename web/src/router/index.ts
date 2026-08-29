import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TagView from '../views/TagView.vue'

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
  ],
  scrollBehavior(to, from, saved) {
    // Browser / in-app back: restore after a frame so remounted browse has height.
    if (saved) {
      return new Promise((resolve) => {
        requestAnimationFrame(() => resolve(saved))
      })
    }
    // Query-only updates (e.g. ?shift=) must not jump the page to the top
    if (from && to.path === from.path) return false
    return { top: 0 }
  },
})
