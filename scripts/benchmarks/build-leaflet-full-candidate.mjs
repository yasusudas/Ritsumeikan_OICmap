import {build} from 'vite';import {readFile,writeFile,mkdir} from 'node:fs/promises';import {resolve} from 'node:path';import {execFileSync} from 'node:child_process';import assert from 'node:assert/strict';import{createHash}from'node:crypto';
const root=process.cwd(),out=resolve('output/leaflet-full-safari-2026-10-21'),source=await readFile('src/main.js','utf8'),tools=process.env.LEAFLET_TOOLS??'/tmp/oic-leaflet-tools/node_modules';
execFileSync('git',['-c','core.fsmonitor=false','diff','--quiet','origin/dev','--','src','public','index.html','en','vite.config.js','package.json','package-lock.json']);
let code=source;const changes=[];
function replace(a,b){assert.equal(code.split(a).length-1,1,a);code=code.replace(a,b);changes.push({before:a,after:b});}
function section(a,b,text){const start=code.indexOf(a),end=code.indexOf(b,start+1);assert.ok(start>=0&&end>start);replace(code.slice(start,end),text);}
replace('image.src = url.href;',`image.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/%3E'; image.dataset.originalSvgUrl=url.href;`);
replace("image: canvasLayer.querySelector('.floor-svg'),",'image: {src:getFloorSvgUrl(getRenderedFloorDefinition())},');
replace('  function cancelViewAnimation() {','  function cancelViewAnimation() {\n    stopLeafletFull();');
section('  function flushViewRender({ commit = false } = {}) {','  function scheduleViewRender() {',`  function paintLeafletView(view) {
    state.x=view.x;state.y=view.y;state.zoom=view.zoom;
    canvasLayer.style.width=view.width+'px';canvasLayer.style.height=view.height+'px';
    canvasLayer.style.transform='translate3d('+view.x+'px, '+view.y+'px, 0)';
    mirrorFrontLayer();setStatus(getFloorLabel(getRenderedFloorDefinition())+' | '+Math.round(state.zoom*100)+'%');
    if(typeof foodGuide!=='undefined')foodGuide?.render();
  }
  function flushViewRender() {
    state.viewRenderFrame=0;
    renderLeafletFull({x:state.x,y:state.y,width:state.baseWidth*state.zoom,height:state.baseHeight*state.zoom,baseWidth:state.baseWidth,baseHeight:state.baseHeight,minZoom:state.minZoom,maxZoom:state.maxZoom,safeTop:state.safeInsetTop||0,safeBottom:state.safeInsetBottom||0,url:getFloorSvgUrl(getRenderedFloorDefinition())},paintLeafletView,active=>{state.isDragging=active;if(active&&typeof foodGuide!=='undefined')foodGuide?.cancelGesture();});
  }

`);
section('  function animateView(targetZoom, targetX, targetY, duration = VIEW_ANIMATION_MS) {','  function applyMapLayout(',`  function animateView(targetZoom,targetX,targetY,duration=VIEW_ANIMATION_MS) {
    cancelViewAnimation();
    // renderFloor schedules a camera flush. Install its new tile layer before
    // starting a search flight so that a pending rAF cannot cancel that flight.
    if(state.viewRenderFrame){window.cancelAnimationFrame(state.viewRenderFrame);flushViewRender();}
    const zoom=clamp(targetZoom,state.minZoom,state.maxZoom),p=clampTranslate(targetX,targetY,zoom);
    flyLeafletFull({x:p.x,y:p.y,width:state.baseWidth*zoom,height:state.baseHeight*zoom},duration);
  }

`);
section("  viewer.addEventListener(\n    'wheel',", "  window.addEventListener('resize',",'  // Input ownership: Leaflet handlers replace the original wheel/mouse/touch block.\n\n');
code=`import {renderLeafletFull,flyLeafletFull,stopLeafletFull} from ${JSON.stringify(resolve('scripts/benchmarks/leaflet-full-adapter.js'))};\n${code}`;
await mkdir(out,{recursive:true});
await build({root,configFile:resolve('vite.config.js'),resolve:{alias:[{find:/^leaflet$/,replacement:resolve(tools,'leaflet/dist/leaflet-src.esm.js')},{find:'leaflet/dist/leaflet.css',replacement:resolve(tools,'leaflet/dist/leaflet.css')}]},plugins:[{name:'isolated-leaflet-full',enforce:'pre',transform(input,id){if(id.split('?')[0]===resolve('src/main.js')){assert.equal(input,source);return{code,map:null};}}}],build:{outDir:'/tmp/oic-leaflet-full',manifest:true,emptyOutDir:true}});
await writeFile(resolve(out,'candidate-source.js'),code);await writeFile(resolve(out,'build-evidence.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),sourceSha256:createHash('sha256').update(source).digest('hex'),changes},null,2));
