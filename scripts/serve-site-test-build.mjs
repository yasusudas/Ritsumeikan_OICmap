import { resolve } from 'node:path';
import { preview } from 'vite';

const [directory, rawPort] = process.argv.slice(2);
const port = Number(rawPort);
if (!directory || !Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Usage: serve-site-test-build.mjs <build-directory> <port>');
}

await preview({
  build: { outDir: resolve(directory) },
  preview: { host: '127.0.0.1', port, strictPort: true },
  plugins: [{
    name: 'site-test-network',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        // Each isolated test context controls only its own connection. Unlike
        // page routing, this also reaches fetches made by a Service Worker.
        if (request.headers.cookie?.split(';').some(cookie => cookie.trim() === '__oic_e2e_offline=1')) {
          request.socket.destroy();
          return;
        }
        const { pathname } = new URL(request.url, 'http://127.0.0.1');
        // SW requests can bypass Playwright routes; keep test telemetry local.
        if (pathname === '/analytics-init.js' || pathname.startsWith('/_vercel/')) {
          response.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
          response.end('/* site test: analytics disabled */');
          return;
        }
        next();
      });
    },
  }],
});
