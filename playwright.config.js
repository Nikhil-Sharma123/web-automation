// @ts-check
const { defineConfig, devices } = require('@playwright/test');
const dotenv = require('dotenv');
const path = require('path');

dotenv.config({ path: path.resolve(__dirname, '.env') });

/**
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  globalSetup: require.resolve('./global-setup'),
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  timeout: 90000,
  expect: {
    timeout: 10000,
  },
  use: {
    trace: 'on-first-retry',
    // Bounds every click/fill/etc. across the whole suite. Without this, an action
    // on a selector that never appears waits indefinitely — hanging until whatever
    // step/test timeout happens to wrap it, with a generic "Step timeout exceeded"
    // and zero indication of which action or selector was actually stuck. With this
    // set, that same failure surfaces fast with Playwright's own descriptive
    // "Timeout Nms exceeded while waiting for locator(...)" message instead.
    // 30s (not 15s) — this site's own render/navigation times can legitimately run
    // 20s+ under real load; 15s caused genuine elements to be given up on too early.
    actionTimeout: 30000,
  },
  projects: [
    {
      name: 'Google Chrome',
      use: {
        ...devices['Desktop Chrome'],
        channel: 'chrome',           // use installed Chrome — no Chromium download needed
        viewport: { width: 1536, height: 739 },
        screenshot: 'only-on-failure',
        video: 'retain-on-failure',
        trace: 'retain-on-failure',
        launchOptions: {
          args: [
            '--disable-extensions',
            '--disable-background-networking',
            '--disable-default-apps',
            '--no-default-browser-check',
            '--disable-component-extensions-with-background-pages',
            '--disable-backgrounding-occluded-windows',
          ],
        },
      },
    },
    {
      name: 'api-tests',
      testDir: './api-tests',
      use: {
        viewport: null,
      },
    },
  ],
  reporter: [
    // Built-in list reporter — relays each test's own console.log output live to the
    // terminal (e.g. the colorful step-by-step blocks these specs print themselves).
    // Without a reporter that does this, Playwright silently swallows test stdout.
    ['list'],
    ['html', { open: 'never' }],  // Playwright built-in HTML report — covers all projects
    [require.resolve('./tests/ui-html-report-generator.js')],   // per-spec-file colorful QA report (UI specs only)
    [require.resolve('./api-tests/api-passfail-reporter.js')],  // colored PASS/FAIL + step/method counts (api-tests only)
    [require.resolve('./api-tests/html-report-generator.js')],  // api-report.html QA report (api-tests only)
  ],
});

