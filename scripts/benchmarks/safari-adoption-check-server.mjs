// Local verification of the current working tree's three adopted changes.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import assert from 'node:assert/strict';

const before = resolve(process.argv[2] ?? '/tmp/oic-v31-adoption-before');
const after = resolve(process.argv[3] ?? '/tmp/oic-v31-adoption-after');
const output = resolve('output/safari-zoom-adoption-2026-10-24');
await mkdir(output, { recursive: true });
const a = JSON.parse(await readFile(join(before, '.vite/manifest.json'), 'utf8'));
const b = JSON.parse(await readFile(join(after, '.vite/manifest.json'), 'utf8'));
const images = [], aliases = new Map();
for (const [key, item] of Object.entries(a)) {
  if (!item.file.endsWith('.svg')) continue;
  const raw = key.match(/^src\/assets\/floors\/(ja|en)\/([^/]+)\.svg$/);
  const food = key.match(/^_food-map-(ja|en)-/);
  if (!raw && !food) continue;
  const paired = raw ? b[key] : Object.entries(b).find(([name]) => name.startsWith(`_food-map-${food[1]}-`))?.[1];
  assert.ok(paired, key);
  const source = await readFile(join(before, item.file)), candidate = await readFile(join(after, paired.file));
  aliases.set(item.file, paired.file);
  const floor = raw?.[2] ?? '1F-viewer', language = raw?.[1] ?? food[1];
  if (floor === '1F' || floor === '1F-viewer') assert.doesNotMatch(candidate.toString(), /<(?:mask|filter)\b|\b(?:mask|filter)="/);
  images.push({ file: item.file, candidateFile: paired.file, language, floor, beforeBytes: source.length, afterBytes: candidate.length });
}
assert.equal(images.length, 18);
const sw = await readFile(join(after, 'sw.js'), 'utf8');
for (const item of images) assert.ok(sw.includes('/' + item.candidateFile), item.candidateFile);
const metadata = { candidateVariant: 'candidate', images, description: 'Current Version3.1 working tree before/after the three adopted changes; not historical vanilla Dev.' };
await writeFile(join(output, 'assets.json'), JSON.stringify(metadata, null, 2));
const html = `<!doctype html><html lang="ja"><meta charset="utf-8"><title>Version3.1 日英SVG確認</title>
<style>body{margin:0;background:#eee;font:14px system-ui}header{padding:12px;height:100px;box-sizing:border-box}iframe{display:block;border:0;width:960px;height:800px;margin:auto;background:white}canvas{display:none}</style>
<header><b>Version3.1 日英SVG確認</b> <button id="visual">見た目の比較</button><button id="perf">FPS比較</button><div id="status">準備中</div></header><iframe id="app"></iframe><script type="module" src="/bench.js"></script></html>`;
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp' };
createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1:5206'); res.setHeader('Cache-Control', 'no-store');
    if (url.pathname === '/save' && req.method === 'POST') {
      const chunks = []; for await (const part of req) chunks.push(part);
      const data = JSON.parse(Buffer.concat(chunks)); assert.match(data.name, /^[\w-]+$/);
      await writeFile(join(output, data.name + (data.png ? '.png' : '.json')), data.png ? Buffer.from(data.png, 'base64') : JSON.stringify(data.data, null, 2)); return res.end('ok');
    }
    if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html'); return res.end(html); }
    if (url.pathname === '/metadata') { res.setHeader('Content-Type', 'application/json'); return res.end(JSON.stringify(metadata)); }
    if (url.pathname === '/bench.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(await readFile(new URL('./svgo-safari-page.js', import.meta.url))); }
    if (url.pathname === '/sw.js' || url.pathname.startsWith('/_vercel/')) { res.setHeader('Content-Type', 'text/javascript'); return res.end(''); }
    const match = url.pathname.match(/^\/(baseline|candidate)\/(.*)$/);
    const directory = match?.[1] === 'baseline' ? before : after;
    let relative = decodeURIComponent(match?.[2] ?? url.pathname.slice(1));
    if (!relative || relative.endsWith('/')) relative += 'index.html';
    if (match?.[1] === 'candidate') relative = aliases.get(relative) ?? relative;
    const file = resolve(directory, relative); assert.ok(file.startsWith(directory + '/'));
    res.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream'); res.end(await readFile(file));
  } catch (error) { res.writeHead(404).end(String(error)); }
}).listen(5206, '127.0.0.1', () => console.log(JSON.stringify({ pid: process.pid, output, images: images.length })));
