import { fileURLToPath } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [vue()],
  envDir: fileURLToPath(new URL('../..', import.meta.url)),
  optimizeDeps: { entries: ['index.html', 'src/lib/*.ts'] },
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: 'localhost',
    strictPort: true,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
})
