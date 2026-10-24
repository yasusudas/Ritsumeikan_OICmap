// Copied into the pinned application export by build-next-optimization.mjs.
import base from './playwright.config.js';
import { defineConfig } from '@playwright/test';

const server = "__OIC_NEXT_BENCHMARK_SERVER__";
const candidate = process.env.NEXT_CANDIDATE;
if (!['ui-cache', 'geometry-cache', 'adaptive-raster', 'hybrid'].includes(candidate)) {
  throw new Error('NEXT_CANDIDATE required');
}
const port = Number(process.env.E2E_PORT || 4289);
const quote = value => "'" + String(value).replaceAll("'", "'\\''") + "'";
const command = [process.execPath, server, `/tmp/oic-next-${candidate}-dist`, String(port)].map(quote).join(' ');

export default defineConfig({
  ...base,
  webServer: {
    command,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 30000,
  },
  use: { ...base.use, baseURL: `http://127.0.0.1:${port}` },
});
