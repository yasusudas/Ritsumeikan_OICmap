// Experimental only: serve the same production build with original or SVGO floor SVGs.
// The app JavaScript, zoom policy, source SVGs and food-pictogram extraction stay unchanged.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, join } from 'node:path';
import { gzipSync } from 'node:zlib';
import { execFileSync } from 'node:child_process';

const build = resolve(process.argv[2] ?? '/tmp/oic-svgo-build');
const output = resolve(process.argv[3] ?? 'output/svgo-safari-2026-10-20');
const port = Number(process.argv[4] ?? 5191);
const svgoModule = import.meta.resolve(process.env.SVGO_MODULE ?? 'svgo');
const { optimize } = await import(svgoModule);
const svgoVersion = JSON.parse(await readFile(new URL('../package.json', svgoModule), 'utf8')).version;
const config = { multipass: true, floatPrecision: 5, plugins: ['preset-default'] };
const manifest = JSON.parse(await readFile(join(build, '.vite/manifest.json'), 'utf8'));
const images = [];
const optimized = new Map();
await mkdir(join(output, 'optimized'), { recursive: true });
for (const [source, asset] of Object.entries(manifest)) {
  if (!source.includes('/floors/') && !source.startsWith('_food-map-')) continue;
  const original = await readFile(join(build, asset.file), 'utf8');
  const result = optimize(original, { ...config, path: source }).data;
  optimized.set(asset.file, result);
  const language = source.includes('/en/') || source.includes('food-map-en') ? 'en' : 'ja';
  const floor = source.startsWith('_food-map-') ? '1F-viewer' : source.split('/').at(-1).replace('.svg', '');
  const item = { source, file: asset.file, language, floor,
    beforeBytes: Buffer.byteLength(original), afterBytes: Buffer.byteLength(result),
    beforeGzip: gzipSync(original).length, afterGzip: gzipSync(result).length };
  images.push(item);
  await writeFile(join(output, 'optimized', `${language}-${floor}.svg`), result);
}
const metadata = { commit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  svgoVersion, nodeVersion: process.version, config, build, output, images, createdAt: new Date().toISOString() };
await writeFile(join(output, 'assets.json'), JSON.stringify(metadata, null, 2));
const page = `<!doctype html><html lang="ja"><meta charset="UTF-8"><title>SVGO / Safari 比較</title>
<style>body{margin:0;background:#e9edf0;font:14px system-ui;color:#17212b}header{padding:12px 20px;height:100px;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}button,a{margin-right:12px}iframe{display:block;border:0;width:960px;height:800px;margin:0 auto;background:white}#status{font-variant-numeric:tabular-nums}canvas{display:none}</style>
<header><h1>SVGO / Safari 比較</h1><button id="visual">見た目の画素比較</button><button id="perf">FPS比較</button><a href="/baseline/" target="_blank">元の地図</a><a href="/svgo/" target="_blank">SVGO版</a><div id="status">待機中 — 地図の操作コードは両方で同一</div></header><iframe id="app" title="比較対象の地図"></iframe><script type="module" src="/bench.js"></script></html>`;
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
    // This isolated localhost origin must not serve a cached SVG from a previous experiment.
    if (url.pathname === '/sw.js') { res.setHeader('Content-Type', 'text/javascript'); res.end('/* Benchmark origin: no cache handlers. */'); return; }
    if (url.pathname.startsWith('/_vercel/')) { res.setHeader('Content-Type', 'text/javascript'); res.end(''); return; }
    const match = url.pathname.match(/^\/(baseline|svgo)\/(.*)$/);
    const variant = match?.[1] ?? 'baseline';
    let relative = decodeURIComponent(match?.[2] ?? url.pathname.slice(1));
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    const file = resolve(build, relative);
    if (!file.startsWith(build + '/')) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.end(variant === 'svgo' && optimized.has(relative) ? optimized.get(relative) : await readFile(file));
  } catch (error) { res.writeHead(404); res.end(String(error)); }
});
server.listen(port, '127.0.0.1', () => console.log(JSON.stringify({ url: `http://127.0.0.1:${port}/`, output, images: images.length })));
