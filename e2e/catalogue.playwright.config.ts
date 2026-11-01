import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: '.',
  testMatch: 'admin-catalogue.spec.ts',
  workers: 1,
  reporter: 'list',
  outputDir: resolve(tmpdir(), 'lobangers-catalogue', 'playwright'),
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
