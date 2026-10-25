import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'test/e2e',
  fullyParallel: true,
  reporter: 'list',
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});
