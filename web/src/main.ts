import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router'
// Self-hosted (npm) — no Google Fonts CDN
import '@fontsource/ibm-plex-sans/latin-400.css'
import '@fontsource/ibm-plex-sans/latin-600.css'
import '@fontsource/ibm-plex-serif/latin-600.css'
import '@fontsource/ibm-plex-serif/latin-700.css'
import './styles/tokens.css'
import './styles/utilities.css'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.mount('#app')
