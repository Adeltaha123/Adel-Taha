import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, expect: { timeout: 12_000 }, workers: 1,
  use: { baseURL: 'http://127.0.0.1:5179', browserName: 'chromium', viewport: { width: 390, height: 844 }, actionTimeout: 15_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: {
    command: 'node scripts/dev.mjs', url: 'http://127.0.0.1:5179', reuseExistingServer: false,
    env: { API_PORT:'3011', VITE_PORT:'5179', VITE_API_PROXY:'http://127.0.0.1:3011', API_DB:`test-results/e2e-${Date.now()}.sqlite` },
  },
});
