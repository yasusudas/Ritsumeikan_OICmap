// Isolated 1F mask/filter experiment. Reuses the preceding Safari measurement
// client so zoom implementation, warmup, input and frame accounting stay fixed.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { firstFloorWithoutMaskFilter } from './first-floor-without-mask-filter.mjs';

const build = resolve(process.argv[2] ?? '/tmp/oic-svgo-build');
const output = resolve(process.argv[3] ?? 'output/mask-filter-safari-2026-10-20');
const port = Number(process.argv[4] ?? 5192);
const manifest = JSON.parse(await readFile(join(build, '.vite/manifest.json'), 'utf8'));
const images = [], candidates = new Map();
const sha = value => createHash('sha256').update(value).digest('hex');
await mkdir(join(output, 'without-effects'), { recursive: true });
for (const [source, asset] of Object.entries(manifest)) {
  if (!source.endsWith('/1F.svg') && !source.startsWith('_food-map-')) continue;
  const original = await readFile(join(build, asset.file), 'utf8');
  const { svg, details } = firstFloorWithoutMaskFilter(original);
  const language = source.includes('/en/') || source.includes('food-map-en') ? 'en' : 'ja';
  const floor = source.startsWith('_food-map-') ? '1F-viewer' : '1F';
  candidates.set(asset.file, svg);
  images.push({ source, file: asset.file, language, floor, beforeBytes: Buffer.byteLength(original), afterBytes: Buffer.byteLength(svg),
    beforeGzip: gzipSync(original).length, afterGzip: gzipSync(svg).length, beforeSha256: sha(original), afterSha256: sha(svg), ...details });
  await writeFile(join(output, 'without-effects', `${language}-${floor}.svg`), svg);
}
if (images.length !== 4) throw Error('Expected Japanese/English source and viewer 1F SVGs');
const mainFile = (await readdir(join(build, 'assets'))).find(name => /^main-.*\.js$/.test(name));
const metadata = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  nodeVersion: process.version, build, output, candidateVariant: 'no-effects',
  cases: [{ language: 'ja', floor: '1F' }, { language: 'en', floor: '1F' }],
  saveAllVisuals: true, visualViews: [
    { id: '1x', scale: 1 }, { id: '4x', scale: 4 },
    { id: '10x', scale: 10, width: 1600, height: 1100, center: [.7, .45] },
    { id: 'mask-detail', scale: 10, width: 1000, height: 500, center: [458.2 / 1190.55, 679.5 / 841.89] },
  ],
  visualMethod: 'real Safari canvas: full sheets at 1x/4x, same 10x room crop as SVGO, plus 10x crop of the formerly masked badge near (458.2,679.5); original files and viewer-derived files; white background',
  appJavaScript: { file: mainFile, sha256: sha(await readFile(join(build, 'assets', mainFile))) },
  sharedBenchmarkClientSha256: sha(await readFile(new URL('./svgo-safari-page.js', import.meta.url))),
  transformation: 'Only replace the known constant white/alpha mask with the same group opacity; remove its unused filter and mask definitions; no SVGO, coordinate, path, clip-path, or zoom changes',
  images, createdAt: new Date().toISOString() };
await writeFile(join(output, 'assets.json'), JSON.stringify(metadata, null, 2));
const page = `<!doctype html><html lang="ja"><meta charset="UTF-8"><title>1F mask/filter / Safari 比較</title>
<style>body{margin:0;background:#e9edf0;font:14px system-ui;color:#17212b}header{padding:12px 20px;height:100px;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}button,a{margin-right:12px}iframe{display:block;border:0;width:960px;height:800px;margin:0 auto;background:white}#status{font-variant-numeric:tabular-nums}canvas{display:none}</style>
<header><h1>1F mask/filter / Safari 比較</h1><button id="visual">見た目の画素比較</button><button id="perf">FPS比較</button><a href="/baseline/" target="_blank">元の地図</a><a href="/no-effects/" target="_blank">mask/filterなし</a><div id="status">待機中 — opacity以外の操作・描画条件は同一</div></header><iframe id="app" title="比較対象の地図"></iframe><script type="module" src="/bench.js"></script></html>`;
const types = { '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/save' && req.method === 'POST') {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const payload = JSON.parse(Buffer.concat(chunks).toString());
      if (!/^[a-zA-Z0-9_-]+$/.test(payload.name)) throw Error('Invalid evidence name');
      if (payload.png) await writeFile(join(output, `${payload.name}.png`), Buffer.from(payload.png, 'base64'));
      else await writeFile(join(output, `${payload.name}.json`), JSON.stringify(payload.data, null, 2));
      res.end('ok'); return;
    }
    if (url.pathname === '/metadata') { res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(metadata)); return; }
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); res.end(page); return; }
    if (url.pathname === '/bench.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(await readFile(new URL('./svgo-safari-page.js', import.meta.url))); return; }
    if (url.pathname === '/sw.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('/* Isolated benchmark: no cache handlers. */'); return; }
    if (url.pathname.startsWith('/_vercel/')) { res.setHeader('Content-Type', 'text/javascript'); res.end(''); return; }
    const match = url.pathname.match(/^\/(baseline|no-effects)\/(.*)$/);
    const variant = match?.[1] ?? 'baseline';
    let relative = decodeURIComponent(match?.[2] ?? url.pathname.slice(1));
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    const file = resolve(build, relative);
    if (!file.startsWith(build + '/')) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.end(variant === 'no-effects' && candidates.has(relative) ? candidates.get(relative) : await readFile(file));
  } catch (error) { res.writeHead(404); res.end(String(error)); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ pid: process.pid, url: `http://127.0.0.1:${port}/`, output, images: images.length })));
