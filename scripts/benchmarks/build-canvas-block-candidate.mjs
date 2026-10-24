import { build } from 'vite';
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

const root = await realpath(resolve(process.argv[2] ?? '/tmp/oic-cross-browser-dev-20261022'));
const baseline = resolve(process.argv[3] ?? '/tmp/oic-canvas-block-baseline');
const candidate = resolve(process.argv[4] ?? '/tmp/oic-canvas-block-candidate');
const output = resolve('output/canvas-block-2026-10-23'); await mkdir(output, { recursive: true });
const source = await readFile(resolve(root, 'src/main.js'), 'utf8');
const original = execFileSync('git', ['show', 'cb403e0:src/main.js'], { encoding: 'utf8' }); assert.equal(source, original);
await build({ root, configFile: resolve(root, 'vite.config.js'), build: { outDir: baseline, manifest: true, emptyOutDir: true } });
const adapter = resolve('scripts/benchmarks/canvas-block-adapter.js');
const transparent = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const anchors = [];
await build({ root, configFile: resolve(root, 'vite.config.js'), plugins: [{ name: 'canvas-block-isolated-experiment', enforce: 'pre', transform(code, id) {
  if (id.split('?')[0] !== resolve(root, 'src/main.js')) return;
  const substitutions = [
    ['const response = await fetch(svgUrl);', "const response = await fetch('/canvas-meta?file=' + encodeURIComponent(new URL(svgUrl, location.href).pathname.split('/').at(-1)));"],
    ["    const text = await response.text();\n    if (!/<svg\\b/i.test(text)) {\n      throw new Error(`Invalid SVG for ${floor.id}`);\n    }\n\n    const metrics = extractSvgMetricsFromText(text);", '    const metrics = await response.json();'],
    ['image.src = url.href;', `image.src = ${JSON.stringify(transparent)}; image.dataset.originalSvgUrl = url.href;`],
    ["image: canvasLayer.querySelector('.floor-svg'),", 'image: { src: getFloorSvgUrl(getRenderedFloorDefinition()) },'],
    ['    const percent = Math.round(state.zoom * 100);', '    renderCanvasBlocks({ x: state.x, y: state.y, width: state.baseWidth * state.zoom, height: state.baseHeight * state.zoom, url: getFloorSvgUrl(getRenderedFloorDefinition()) });\n    const percent = Math.round(state.zoom * 100);'],
  ];
  for (const [before, after] of substitutions) { assert.equal(code.split(before).length - 1, 1, before); anchors.push(before); code = code.replace(before, after); }
  return { code: `import { renderCanvasBlocks } from ${JSON.stringify(adapter)};\n${code}`, map: null };
} }], build: { outDir: candidate, manifest: true, emptyOutDir: true } });
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(resolve(baseline, '.vite/manifest.json'), 'utf8')), images = [];
for (const [key, asset] of Object.entries(manifest)) if (key.includes('/floors/') || key.startsWith('_food-map-')) {
  const a = await readFile(resolve(baseline, asset.file)), b = await readFile(resolve(candidate, asset.file)); assert.equal(sha(a), sha(b));
  images.push({ source: key, file: asset.file, sha256: sha(a), bytes: a.length });
}
await writeFile(resolve(output, 'build-verification.json'), JSON.stringify({ commit: 'cb403e0a0c882b0de79ae0182a3a98988f9097e4', root, baseline, candidate, images, anchors, adapterSha256: sha(await readFile(adapter)) }, null, 2));
