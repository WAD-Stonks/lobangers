import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: { '@web/assets': fileURLToPath(new URL('./src/assets', import.meta.url)) },
    tsconfigPaths: true,
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
})
