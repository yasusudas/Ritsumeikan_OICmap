import {build} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),output=resolve('output/last-input-safari-2026-10-21');
execFileSync('git',['-c','core.fsmonitor=false','diff','--quiet','origin/dev','--','src','public','index.html','en','vite.config.js','package.json','package-lock.json']);
const source=await readFile('src/main.js','utf8');let code=source;
function change(a,b){assert.equal(code.split(a).length-1,1,a);code=code.replace(a,b);}
change('    zoomRasterTimer: 0,','    zoomRasterTimer: 0,\n    zoomLastInputAt: null,');
change('  function shouldDeferZoomRaster() {',`  function zoomRasterDelayFromInput() {
    return state.zoomLastInputAt === null ? ZOOM_RASTER_SETTLE_MS
      : Math.max(0, ZOOM_RASTER_SETTLE_MS - (performance.now() - state.zoomLastInputAt));
  }

  function recordMapInput() {
    if (isEditorSite) return;
    state.zoomLastInputAt = performance.now();
    window.clearTimeout(state.zoomRasterTimer);
    state.zoomRasterTimer = 0;
    if (state.renderedZoom > 0 && state.renderedZoom !== state.zoom && shouldDeferZoomRaster()) {
      state.zoomRasterTimer = window.setTimeout(commitZoomRaster, ZOOM_RASTER_SETTLE_MS);
    }
  }

  function shouldDeferZoomRaster() {`);
change('  function commitZoomRaster() {\n    state.zoomRasterTimer = 0;',`  function commitZoomRaster() {
    state.zoomRasterTimer = 0;
    if (state.zoomLastInputAt !== null) {
      const remaining = zoomRasterDelayFromInput();
      if (remaining > 0) {
        state.zoomRasterTimer = window.setTimeout(commitZoomRaster, remaining);
        return;
      }
    }`);
change('      state.zoomRasterTimer = window.setTimeout(commitZoomRaster, ZOOM_RASTER_SETTLE_MS);\n    } else {','      state.zoomRasterTimer = window.setTimeout(commitZoomRaster, zoomRasterDelayFromInput());\n    } else {');
change('      state.renderedZoom = state.zoom;','      state.renderedZoom = state.zoom;\n      state.zoomLastInputAt = null;');
change("    'wheel',\n    (event) => {", "    'wheel',\n    (event) => {\n      recordMapInput();");
// Record only accepted map input; hover events must not reset the deadline.
change('    startDrag(event.clientX, event.clientY);','    recordMapInput();\n    startDrag(event.clientX, event.clientY);');
change('    if (!state.isDragging) {\n      return;\n    }','    if (!state.isDragging) {\n      return;\n    }\n    recordMapInput();');
change("  window.addEventListener('mouseup', () => {","  window.addEventListener('mouseup', () => {\n    if (state.isDragging) recordMapInput();");
change('    captureEditorPointAtClient(event.clientX, event.clientY);\n    endDrag();','    if (state.isDragging) recordMapInput();\n    captureEditorPointAtClient(event.clientX, event.clientY);\n    endDrag();');
for(const type of ['touchstart','touchend']) {
 const signature=`  viewer.addEventListener(\n    '${type}',\n    (event) => {\n      if (event.target.closest('.editor-pin-button, .editor-ring-button, .editor-area-vertex, .food-action-button')) {\n        return;\n      }\n`;
 change(signature,signature+'\n      recordMapInput();');
}
change("    'touchmove',\n    (event) => {", "    'touchmove',\n    (event) => {\n      recordMapInput();");
change("  viewer.addEventListener('touchcancel', () => {", "  viewer.addEventListener('touchcancel', () => {\n    recordMapInput();");
await mkdir(output,{recursive:true});
await writeFile(resolve(output,'candidate-source.js'),code);
await writeFile(resolve(output,'original-source.js'),source);
await writeFile(resolve(output,'build-evidence.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),originalSha256:createHash('sha256').update(source).digest('hex'),candidateSha256:createHash('sha256').update(code).digest('hex'),frequency:4,settleMs:140,policy:'last processed map input; flush preserves deadline; callback checks remaining time; programmatic animation fallback unchanged; no SVG optimizations'},null,2));
await build({root,configFile:resolve('vite.config.js'),plugins:[{name:'last-input-settle-only',enforce:'pre',transform(input,id){if(id.split('?')[0]!==resolve('src/main.js'))return;assert.equal(input,source);return {code,map:null};}}],build:{outDir:'/tmp/oic-last-input-candidate',manifest:true,emptyOutDir:true}});
