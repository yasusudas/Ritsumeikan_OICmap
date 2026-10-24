// Build an isolated rendering prototype, leaving the working source and Dev intact.
import { build } from 'vite';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
const root = resolve(new URL('../../', import.meta.url).pathname);
// Every experiment starts from vanilla Dev, not the previous experiment's output.
execFileSync('git', ['diff', '--quiet', 'dev', '--', 'src', 'public', 'index.html', 'en', 'vite.config.js', 'package.json', 'package-lock.json'], { cwd: root });
const tools = process.env.LEAFLET_TOOLS ?? '/tmp/oic-leaflet-tools/node_modules';
const adapter = resolve(root, 'scripts/benchmarks/leaflet-floor-adapter.js');
const transparent = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E';
await build({ root, configFile: resolve(root, 'vite.config.js'),
  resolve: { alias: [{ find: /^leaflet$/, replacement: resolve(tools, 'leaflet/dist/leaflet-src.esm.js') },
    { find: 'leaflet/dist/leaflet.css', replacement: resolve(tools, 'leaflet/dist/leaflet.css') }] },
  plugins: [{ name: 'isolated-leaflet-renderer-prototype', enforce: 'pre', transform(code,id) {
    if (id.split('?')[0] !== resolve(root, 'src/main.js')) return;
    const replacements = [
      ['image.src = url.href;', `image.src = ${JSON.stringify(transparent)}; image.dataset.originalSvgUrl = url.href;`],
      ["image: canvasLayer.querySelector('.floor-svg'),", 'image: { src: getFloorSvgUrl(getRenderedFloorDefinition()) },'],
      ["    const percent = Math.round(state.zoom * 100);", `    renderLeafletFloor({ x: state.x, y: state.y, width: state.baseWidth * state.zoom, height: state.baseHeight * state.zoom, url: getFloorSvgUrl(getRenderedFloorDefinition()) });\n    const percent = Math.round(state.zoom * 100);`],
    ];
    for (const [before,after] of replacements) { assert.equal(code.split(before).length-1,1,`Prototype anchor: ${before}`); code=code.replace(before,after); }
    return { code: `import { renderLeafletFloor } from ${JSON.stringify(adapter)};\n${code}`, map: null };
  } }],
  build: { outDir: resolve(process.argv[2] ?? '/tmp/oic-leaflet-candidate'), manifest: true, emptyOutDir: true },
});
