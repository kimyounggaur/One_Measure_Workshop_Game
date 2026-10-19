import { defineConfig } from '@playwright/test';
export default defineConfig({ testDir: './tests/e2e', fullyParallel: false, workers: 1,
  use: { baseURL: 'http://127.0.0.1:4386', headless: true, screenshot: 'only-on-failure' },
  webServer: { command: 'npm run preview', url: 'http://127.0.0.1:4386', reuseExistingServer: true },
  projects: [{ name: 'chromium', use: { browserName: 'chromium', channel: 'chrome' } }]
});
