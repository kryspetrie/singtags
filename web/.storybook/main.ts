import type { Plugin } from 'vite'
import type { StorybookConfig } from '@storybook/vue3-vite'

/** Stub vite-plugin-pwa virtual modules so App.vue can mount in Storybook. */
function stubPwaRegister(): Plugin {
  const id = 'virtual:pwa-register/vue'
  const resolved = `\0${id}`
  return {
    name: 'storybook-stub-pwa-register',
    resolveId(source) {
      if (source === id) return resolved
      return undefined
    },
    load(source) {
      if (source !== resolved) return undefined
      return `
        import { ref } from 'vue'
        export function useRegisterSW(_opts) {
          return {
            needRefresh: ref(false),
            offlineReady: ref(false),
            updateServiceWorker: async () => {},
          }
        }
      `
    },
  }
}

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [
    '@chromatic-com/storybook',
    '@storybook/addon-vitest',
    '@storybook/addon-a11y',
    '@storybook/addon-docs',
    '@storybook/addon-onboarding',
  ],
  framework: '@storybook/vue3-vite',
  async viteFinal(config) {
    // Storybook must not inherit the app PWA service-worker build (Workbox size limits).
    config.plugins = (config.plugins ?? []).flat().filter((plugin) => {
      const name = plugin && typeof plugin === 'object' && 'name' in plugin ? String(plugin.name) : ''
      return !name.startsWith('vite-plugin-pwa') && name !== 'vite:pwa-info'
    })
    config.plugins.push(stubPwaRegister())
    return config
  },
}

export default config
