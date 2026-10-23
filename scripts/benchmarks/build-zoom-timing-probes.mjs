// Diagnostic builds only. Vanilla SVGs and application behavior stay intact unless
// the harness explicitly enables an intervention (active settle suppression/offset).
import {build} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(new URL('../../',import.meta.url).pathname);
execFileSync('git',['-c','core.fsmonitor=false','diff','--quiet','origin/dev','--','src','public','index.html','en','vite.config.js','package.json','package-lock.json']);
const source=await readFile(resolve(root,'src/main.js'),'utf8');
function replaceOnce(s,a,b){assert.equal(s.split(a).length-1,1,a.slice(0,70));return s.replace(a,b);}
const hook=`
  // Experimental trace: primitive state only, no layout/computed-style reads.
  const zoomProbe = window.__zoomProbe = {
    enabled: false, active: false, suppressActiveSettle: false, events: [], context: {},
    emit(kind, extra = {}) {
      if (!this.enabled) return;
      this.events.push({t: performance.timeOrigin + performance.now(), kind, context: this.context,
        zoom: state.zoom, renderedZoom: state.renderedZoom, counter: state.zoomFramesSinceRaster,
        lastFlushedZoom: state.lastFlushedZoom, queuedFrame: state.viewRenderFrame,
        timer: state.zoomRasterTimer, width: canvasLayer.style.width, transform: canvasLayer.style.transform, ...extra});
    },
    offset(n) { state.zoomFramesSinceRaster = n; this.emit('offset', {offset:n}); },
    finish() {
      this.active = false;
      if (this.suppressActiveSettle) {
        window.clearTimeout(state.zoomRasterTimer);
        state.zoomRasterTimer = this.arm();
      }
    },
    arm() {
      const due = performance.timeOrigin + performance.now() + ZOOM_RASTER_SETTLE_MS;
      const id = window.setTimeout(() => { this.emit('timer-fire', {id,due,lateness:performance.timeOrigin+performance.now()-due}); commitZoomRaster(); }, ZOOM_RASTER_SETTLE_MS);
      this.emit('timer-arm', {id,due}); return id;
    }
  };
`;
let traced=replaceOnce(source,'  function shouldDeferZoomRaster() {',hook+'\n  function shouldDeferZoomRaster() {');
traced=replaceOnce(traced,'  function commitZoomRaster() {',`  function commitZoomRaster() {
    zoomProbe.emit('commit-enter', {active:zoomProbe.active});
    if (zoomProbe.suppressActiveSettle && zoomProbe.active) {
      state.zoomRasterTimer = 0;
      zoomProbe.emit('commit-suppressed'); return;
    }`);
traced=replaceOnce(traced,'  function flushViewRender({ commit = false } = {}) {',`  function flushViewRender({ commit = false } = {}) {
    const probeStarted = performance.now();
    zoomProbe.emit('flush-enter', {commit});`);
traced=replaceOnce(traced,'    window.clearTimeout(state.zoomRasterTimer);\n    state.zoomRasterTimer = 0;',`    zoomProbe.emit('timer-cancel', {id:state.zoomRasterTimer});
    window.clearTimeout(state.zoomRasterTimer);
    state.zoomRasterTimer = 0;`);
traced=replaceOnce(traced,'      state.zoomRasterTimer = window.setTimeout(commitZoomRaster, ZOOM_RASTER_SETTLE_MS);','      state.zoomRasterTimer = zoomProbe.arm();');
traced=replaceOnce(traced,'    } else {\n      state.renderedZoom = state.zoom;',`    } else {
      zoomProbe.emit('raster-assign', {reason:commit?'settle':(state.renderedZoom===state.zoom?'same-zoom':'periodic')});
      state.renderedZoom = state.zoom;`);
traced=replaceOnce(traced,"    if (typeof foodGuide !== 'undefined') foodGuide?.render();\n  }\n\n  function scheduleViewRender",`    if (typeof foodGuide !== 'undefined') foodGuide?.render();
    zoomProbe.emit('flush-exit', {duration:performance.now()-probeStarted});
  }

  function scheduleViewRender`);
traced=replaceOnce(traced,'    state.viewRenderFrame = window.requestAnimationFrame(() => {\n      flushViewRender();\n    });',`    state.viewRenderFrame = window.requestAnimationFrame((rafStamp) => {
      zoomProbe.emit('app-raf-enter', {rafStamp});
      flushViewRender();
      zoomProbe.emit('app-raf-exit', {rafStamp});
    });
    zoomProbe.emit('app-raf-queued');`);
const output=resolve('output/zoom-timing-safari-2026-10-21');await mkdir(output,{recursive:true});
const changes=[];
for(const n of [2,3,4,5]){
 const code=traced.replace('const ZOOM_RASTER_EVERY_FRAMES = 4;',`const ZOOM_RASTER_EVERY_FRAMES = ${n};`);
 const outDir=`/tmp/oic-timing-${n}`;
 await build({root,configFile:resolve(root,'vite.config.js'),plugins:[{name:'zoom-timing-probe',enforce:'pre',transform(input,id){if(id.split('?')[0]!==resolve(root,'src/main.js'))return;assert.equal(input,source);return {code,map:null};}}],build:{outDir,manifest:true,emptyOutDir:true}});
 changes.push({n,outDir,sourceSha256:createHash('sha256').update(code).digest('hex')});
}
await writeFile(resolve(output,'instrumentation-source.js'),traced);
await writeFile(resolve(output,'build-evidence.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),originalSha256:createHash('sha256').update(source).digest('hex'),changes,policy:'diagnostic instrumentation only; active-settle suppression and counter offset disabled by default; SVGs and all prior optimizations unchanged'},null,2));
