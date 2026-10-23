import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';

const baseline = resolve(process.argv[2] ?? '/tmp/oic-cross-browser-dev-20261022/dist');
const output = resolve(process.argv[3] ?? 'output/cross-browser-dev-2026-10-22');
const port = Number(process.argv[4] ?? 5204);
await mkdir(output, { recursive: true });
async function manifest(dir, prefix = '') {
  const entries = [];
  for (const item of await readdir(dir, { withFileTypes: true })) {
    const file = join(prefix, item.name);
    if (item.isDirectory()) entries.push(...await manifest(join(dir, item.name), file));
    else {
      const bytes = await readFile(join(dir, item.name));
      entries.push({ file, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') });
    }
  }
  return entries.sort((a, b) => a.file.localeCompare(b.file));
}
const metadata = {
  commit: 'cb403e0a0c882b0de79ae0182a3a98988f9097e4', baseline, output,
  previousImprovements: { svgo: false, maskFilterReplacement: false, leaflet: false,
    scaleOnly: false, rasterFrequencyChange: false, settleTimerChange: false,
    maxZoomChange: false, viewportCulling: false },
  iframe: [900, 440], createdAt: new Date().toISOString(), files: await manifest(baseline),
};
await writeFile(join(output, 'assets.json'), JSON.stringify(metadata, null, 2));
const requests = { failures: [] };
const clients = new Map();
let command = { runId: '', startAt: 0 }, barrier = { key: '', ready: {}, startAt: 0 };
const html = `<!doctype html><html lang="ja"><meta charset="UTF-8"><title>Vanilla Dev — Browser comparison</title>
<style>body{margin:0;background:#e9edf0;color:#17212b;font:12px system-ui}header{height:48px;padding:3px 10px;box-sizing:border-box;white-space:nowrap}strong{font-size:14px}button{margin:0 3px}#status{font-variant-numeric:tabular-nums}iframe{display:block;border:0;width:900px;height:440px;margin:0 auto;background:white}</style>
<header><strong id="label">未改善Dev</strong> <button id="smoke">動作確認</button><button id="round">1ラウンド計測</button><button id="quality">拡大中の画質</button><button id="stop">停止後</button><button id="demo">同期デモ</button><div id="status">準備中</div></header>
<iframe id="app" title="同じ未改善Devの地図"></iframe><script type="module" src="/bench.js"></script></html>`;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/perf-probe.html') { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(new URL('./claude-cross-browser-probe.html', import.meta.url))); return; }
    if (url.pathname === '/probe.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('./claude-cross-browser-probe.js', import.meta.url))); return; }
    if (url.pathname === '/probe-start.txt') {
      const browser = url.searchParams.get('browser');
      if (browser) clients.set(browser, { time: Date.now(), ready: url.searchParams.get('ready') === '1' });
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(command)); return;
    }
    if (url.pathname === '/probe-control' && req.method === 'POST') {
      const chunks = []; for await (const c of req) chunks.push(c);
      const next = JSON.parse(Buffer.concat(chunks));
      if (next.action === 'start') {
        assert.ok(['chrome', 'safari', 'firefox'].every(b => clients.get(b)?.ready && Date.now() - clients.get(b).time < 3000), 'All three browsers must be ready');
        command = { runId: next.runId, startAt: Date.now() + 5000, repetitions: next.repetitions ?? 4, smoke: Boolean(next.smoke) };
        barrier = { key: '', ready: {}, startAt: 0 };
        await writeFile(join(output, next.runId + '-command.json'), JSON.stringify(command, null, 2));
      } else if (next.action === 'reset') { command = { runId: '', startAt: 0 }; barrier = { key: '', ready: {}, startAt: 0 }; }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ command, clients: Object.fromEntries(clients), barrier })); return;
    }
    if (url.pathname === '/probe-barrier') {
      const key = url.searchParams.get('key'), browser = url.searchParams.get('browser');
      // Fast clients can wait at the next phase while a slower client finishes the previous one.
      if (barrier.key !== key && (!barrier.key || barrier.startAt && Date.now() > barrier.startAt)) barrier = { key, ready: {}, startAt: 0 };
      if (barrier.key === key) {
        barrier.ready[browser] = Date.now();
        if (!barrier.startAt && ['chrome', 'safari', 'firefox'].every(b => barrier.ready[b])) barrier.startAt = Date.now() + 1500;
      }
      res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(barrier)); return;
    }
    if (url.pathname === '/save' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks)); assert.match(payload.name, /^[\w-]+$/);
      await writeFile(join(output, payload.name + '.json'), JSON.stringify(payload.data, null, 2));
      res.end('ok'); return;
    }
    if (url.pathname === '/metadata') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(metadata)); return; }
    if (url.pathname === '/requests') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(requests)); return; }
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(html); return; }
    if (url.pathname === '/bench.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('./cross-browser-dev-page.js', import.meta.url))); return; }
    if (url.pathname === '/sw.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('/* no benchmark caches */'); return; }
    if (url.pathname.startsWith('/_vercel/')) { res.setHeader('Content-Type', 'text/javascript'); res.end(''); return; }
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    let relative = decodeURIComponent(url.pathname.replace(/^\/baseline\//, '/').slice(1));
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    const file = resolve(baseline, relative); assert.ok(file.startsWith(baseline + '/'));
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file));
  } catch (e) {
    requests.failures.push({ url: req.url, error: String(e), time: new Date().toISOString() });
    res.writeHead(404).end(String(e));
  }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ pid: process.pid, url: `http://127.0.0.1:${port}/`, output })));
