import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import TagView from '../views/TagView.vue'
import PitchPipeView from '../views/PitchPipeView.vue'
import QueueView from '../views/QueueView.vue'
import StarredView from '../views/StarredView.vue'
import SettingsView from '../views/SettingsView.vue'

export const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/tag/:id', name: 'tag', component: TagView, props: true },
    { path: '/starred', name: 'starred', component: StarredView },
    { path: '/pitch-pipe', name: 'pitch-pipe', component: PitchPipeView },
    { path: '/queue', name: 'queue', component: QueueView },
    { path: '/settings', name: 'settings', component: SettingsView },
  ],
  scrollBehavior(to, from, saved) {
    if (saved) return saved
    // Query-only updates (e.g. ?shift=) must not jump the page to the top
    if (from && to.path === from.path) return false
    return { top: 0 }
  },
})
