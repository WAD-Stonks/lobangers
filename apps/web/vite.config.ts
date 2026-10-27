import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  // Read VITE_* values from the repository-root .env (the same file the API and scripts use).
  // Only VITE_-prefixed keys are exposed to the browser bundle.
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  // Scan browser SDK entries before serving; lazy smoke imports otherwise trigger
  // re-optimization and stale Vue chunk URLs during concurrent navigation.
  optimizeDeps: { entries: ['index.html', 'src/lib/*.ts'] },
  resolve: {
    alias: { '@web/assets': fileURLToPath(new URL('./src/assets', import.meta.url)) },
    tsconfigPaths: true,
  },
  server: {
    host: 'localhost',
    strictPort: true,
    proxy: {
      '/api': {
        // 127.0.0.1, not localhost: the API binds IPv4 only (apps/api/src/server.ts), and
        // localhost can resolve to ::1, where another app on port 3000 would answer instead.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
