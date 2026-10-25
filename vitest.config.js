import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.js'], // test/e2e/*.spec.js runs under Playwright
  },
});
