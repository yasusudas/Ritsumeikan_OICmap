import { defineConfig, devices } from '@playwright/test';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const port = Number(process.env.E2E_PORT || 4173);
export const artifacts = resolve(process.env.E2E_OUTPUT_DIR || `${tmpdir()}/oicmap-e2e`);
const quote = value => `'${value.replaceAll("'", "'\\''")}'`;
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('E2E_PORT must be an integer from 1024 to 65535.');

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.js',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // A flaky first attempt is a failure, not a hidden pass.
  workers: Number(process.env.E2E_WORKERS || 2),
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: `${artifacts}/results`,
  reporter: [['list'], ['json', { outputFile: `${artifacts}/results.json` }]],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block',
    reducedMotion: 'reduce',
    actionTimeout: 8_000,
    navigationTimeout: 20_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } },
    { name: 'mobile', use: { ...devices['Pixel 7'], viewport: { width: 390, height: 844 } } },
    ...(process.env.E2E_CROSS_BROWSER === '1' ? [
      { name: 'safari', use: { ...devices['Desktop Safari'], viewport: { width: 1440, height: 900 } } },
      { name: 'iphone', use: { ...devices['iPhone 13'] } },
    ] : []),
  ],
  webServer: {
    command: `npm run build -- --outDir ${quote(`${artifacts}/build`)} --emptyOutDir && npm run preview -- --outDir ${quote(`${artifacts}/build`)} --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
