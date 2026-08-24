import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      'virtual:pwa-register/vue': fileURLToPath(
        new URL('./src/test/stubs/pwa-register-vue.ts', import.meta.url),
      ),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.{ts,vue}'],
      exclude: ['src/**/*.stories.ts', 'src/main.ts', 'src/**/*.d.ts', 'src/test/**'],
      thresholds: {
        statements: 75,
        branches: 55,
        functions: 65,
        lines: 75,
      },
    },
  },
})
