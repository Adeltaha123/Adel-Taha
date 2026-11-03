import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', timeout: 90_000, expect: { timeout: 12_000 }, workers: 1,
  // On GitHub, failures also become run annotations, which anyone with read access can see without the full log.
  reporter: process.env.CI ? [['github'], ['list']] : 'list',
  use: { baseURL: 'http://127.0.0.1:5179', browserName: 'chromium', viewport: { width: 390, height: 844 }, actionTimeout: 15_000, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  // The API starts without --watch or .env and is awaited on its health check, so tests never race a starting server.
  webServer: [
    { command: 'node --import tsx server/index.ts', url: 'http://127.0.0.1:3011/api/health', reuseExistingServer: false,
      env: { API_PORT:'3011', API_DB:`test-results/e2e-${Date.now()}.sqlite`, API_ORIGINS:'http://127.0.0.1:5179' } },
    { command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1', url: 'http://127.0.0.1:5179', reuseExistingServer: false,
      env: { VITE_PORT:'5179', VITE_API_PROXY:'http://127.0.0.1:3011' } },
  ],
});
