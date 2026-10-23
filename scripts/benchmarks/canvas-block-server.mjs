import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, copyFile } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire('/tmp/oic-leaflet-tools/package.json'), sharp = require('sharp');
const output = resolve('output/canvas-block-2026-10-23'); await mkdir(join(output, 'tiles'), { recursive: true });
const verification = JSON.parse(await readFile(join(output, 'build-verification.json'), 'utf8'));
const { baseline, candidate } = verification, port = Number(process.argv[2] ?? 5205), sources = new Map();
const sha = b => createHash('sha256').update(b).digest('hex');
for (const image of verification.images) {
  const svg = await readFile(join(baseline, image.file), 'utf8'); assert.equal(sha(svg), image.sha256);
  const vb = svg.match(/\bviewBox=["']([^"']+)/)[1].trim().split(/[ ,]+/).map(Number);
  // Match Dev's metadata extraction rather than the tile's export dimensions.
  const tag = svg.match(/<svg\b[^>]*>/)[0];
  const width = parseFloat(tag.match(/\bwidth=["']([^"']+)/)?.[1]) || vb[2], height = parseFloat(tag.match(/\bheight=["']([^"']+)/)?.[1]) || vb[3];
  sources.set(image.file.split('/').at(-1), { svg, vb, width, height, image });
}
const tileStats = { generated: 0, generatedDuringMeasurement: 0, hits: 0, bytesGenerated: 0, generationMs: 0, generations: [], errors: [] };
let measuring = false;
async function tile(file, z, x, y) {
  const source = sources.get(file); assert.ok(source && z >= 0 && z <= 4 && x >= 0 && y >= 0);
  const name = `${file}-${z}-${x}-${y}-g1.png`, destination = join(output, 'tiles', name);
  try { const result = await readFile(destination); tileStats.hits++; return result; } catch {}
  // Old PNGs can be reused only because the source SVG hash was checked above.
  const old = await readFile('output/leaflet-safari-2026-10-21/assets.json', 'utf8')
    .then(JSON.parse).catch(() => ({ images: [] }));
  const same = old.images.find(i => i.file === source.image.file && i.sha256 === source.image.sha256);
  if (same) try { await copyFile(resolve('output/leaflet-safari-2026-10-21/tiles', name), destination); tileStats.hits++; return await readFile(destination); } catch {}
  const started = performance.now(), units = 256 / 2 ** z, factor = source.vb[2] / 1024, gutter = units * factor / 512;
  const vb = [source.vb[0] + x * units * factor - gutter, source.vb[1] + y * units * factor - gutter, units * factor + 2 * gutter, units * factor + 2 * gutter];
  const svg = source.svg.replace(/<svg\b[^>]*>/, tag => tag.replace(/\bwidth=["'][^"']*["']/, 'width="514"').replace(/\bheight=["'][^"']*["']/, 'height="514"').replace(/\bviewBox=["'][^"']*["']/, `viewBox="${vb.join(' ')}"`));
  const png = await sharp(Buffer.from(svg)).png().toBuffer(); await writeFile(destination, png);
  tileStats.generated++; tileStats.generatedDuringMeasurement += Number(measuring); tileStats.bytesGenerated += png.length; tileStats.generationMs += performance.now() - started;
  tileStats.generations.push({ file, z, x, y, finishedAt: Date.now(), durationMs: performance.now() - started });
  return png;
}
// Prepare all blocks the 20/23-step trajectories can reach before measuring.
const tested = [...sources].filter(([file]) => /food-map-|5F-/.test(file));
const jobs = [];
for (const [file, source] of tested) for (let z = 0; z <= 2; z++) {
  const units = 256 / 2 ** z, height = 1024 * source.vb[3] / source.vb[2];
  for (let y = 0; y < Math.ceil(height / units); y++) for (let x = 0; x < 4 * 2 ** z; x++) jobs.push([file, z, x, y]);
}
let index = 0;
await Promise.all(Array.from({ length: 4 }, async () => { while (index < jobs.length) await tile(...jobs[index++]); }));
const metadata = { ...verification, createdAt: new Date().toISOString(), iframe: [900, 440], tile: { content: 512, gutter: 1, cssWorldSize: 256, worldWidth: 1024, maxNativeZoom: 4, maxDecodedImages: 64, concurrency: 6 },
  originalSvgMasksFiltersPreserved: true, previousImprovements: false, tilePreparation: { jobs: jobs.length, ...tileStats }, powerMeasurement: { available: false, reason: 'powermetrics requires root; sudo -n requires a password' } };
await writeFile(join(output, 'assets.json'), JSON.stringify(metadata, null, 2));
const clients = new Map(), barriers = new Map(), failures = [];
let command = { runId: '', startAt: 0 };
const send = (res, data) => { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(data)); };
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`); res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/metadata') { send(res, metadata); return; }
    if (url.pathname === '/stats') { send(res, { clients: Object.fromEntries(clients), command, tileStats, failures, barriers: [...barriers] }); return; }
    if (url.pathname === '/' || url.pathname === '/perf-probe.html') { res.setHeader('Content-Type', 'text/html'); res.end(await readFile(new URL('./canvas-block-probe.html', import.meta.url))); return; }
    if (url.pathname === '/canvas-probe.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('./canvas-block-probe.js', import.meta.url))); return; }
    if (url.pathname === '/canvas-meta') { const source = sources.get(url.searchParams.get('file')); assert.ok(source); send(res, { width: source.width, height: source.height }); return; }
    if (url.pathname === '/probe-start.txt') { const b = url.searchParams.get('browser'); if (b) clients.set(b, { time: Date.now(), ready: true }); send(res, command); return; }
    if (url.pathname === '/probe-barrier') {
      const key = url.searchParams.get('key'), browser = url.searchParams.get('browser');
      if (!barriers.has(key)) barriers.set(key, { key, ready: {}, startAt: 0 });
      const b = barriers.get(key); b.ready[browser] = Date.now();
      if (!b.startAt && (command.participants ?? ['chrome', 'safari', 'firefox']).every(n => b.ready[n])) b.startAt = Date.now() + 1200;
      send(res, b); return;
    }
    if (url.pathname === '/control' && req.method === 'POST') {
      const parts = []; for await (const c of req) parts.push(c); const next = JSON.parse(Buffer.concat(parts));
      if (next.action === 'start') {
        const participants = next.participants ?? ['chrome', 'safari', 'firefox'];
        assert.ok(participants.length && participants.every(b => ['chrome', 'safari', 'firefox'].includes(b) && clients.has(b) && Date.now() - clients.get(b).time < 3000));
        command = { runId: next.runId, startAt: Date.now() + 3000, smoke: Boolean(next.smoke), participants }; barriers.clear(); measuring = true;
        await writeFile(join(output, next.runId + '-command.json'), JSON.stringify(command, null, 2));
      } else if (next.action === 'reset') { command = { runId: '', startAt: 0 }; barriers.clear(); measuring = false; }
      send(res, command); return;
    }
    if (url.pathname === '/save' && req.method === 'POST') {
      const parts = []; for await (const c of req) parts.push(c); const payload = JSON.parse(Buffer.concat(parts)); assert.match(payload.name, /^[\w-]+$/);
      await writeFile(join(output, payload.name + (payload.png ? '.png' : '.json')), payload.png ? Buffer.from(payload.png, 'base64') : JSON.stringify(payload.data, null, 2)); res.end('ok'); return;
    }
    if (url.pathname === '/sw.js' || url.pathname.startsWith('/_vercel/')) { res.setHeader('Content-Type', 'text/javascript'); res.end(''); return; }
    if (url.pathname === '/favicon.ico') { res.writeHead(204).end(); return; }
    const t = url.pathname.match(/^\/tiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png$/);
    if (t) { res.setHeader('Content-Type', 'image/png'); res.end(await tile(t[1], Number(t[2]), Number(t[3]), Number(t[4]))); return; }
    const match = url.pathname.match(/^\/(baseline|canvas)\/(.*)$/), root = match?.[1] === 'canvas' ? candidate : baseline;
    let rel = decodeURIComponent(match?.[2] ?? url.pathname.slice(1)); if (!rel || rel.endsWith('/')) rel += 'index.html';
    const file = resolve(root, rel); assert.ok(file.startsWith(root + '/')); res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file));
  } catch (e) { failures.push({ url: req.url, error: String(e), time: Date.now() }); res.writeHead(404).end(String(e)); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ pid: process.pid, url: `http://127.0.0.1:${port}`, prepared: jobs.length, output })));
