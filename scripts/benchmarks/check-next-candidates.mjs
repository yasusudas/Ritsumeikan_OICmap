import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { candidateSource } from './next-optimization-candidates.mjs';
import { resolve } from 'node:path';
const sourceRoot=resolve(process.argv[2]??'.');
const original=await readFile(resolve(sourceRoot,'src/main.js'),'utf8');
function functions(context,source,names){for(const name of names){const m=source.match(new RegExp('  function '+name+'\\([\\s\\S]*?\\n  }'));assert.ok(m,name);vm.runInContext(m[0],context);}}
{
 let widths=0,rects=0;const tasks=[],viewer={get clientWidth(){widths++;return this.width},clientHeight:800,width:960,getBoundingClientRect(){rects++;return {width:this.width,x:32.5,y:100}}};
 const c=vm.createContext({viewer,window:{requestAnimationFrame:f=>tasks.push(f)}});
 const source=candidateSource(original,'src/main.js','geometry-cache');functions(c,source,['frameMapMeasurements','invalidateMapMeasurements','getMapRectForFrame','getViewportSize']);
 assert.equal(c.getViewportSize().width,960);c.getViewportSize();c.getMapRectForFrame();c.getMapRectForFrame();assert.equal(widths,1);assert.equal(rects,1);
 viewer.width=920;c.invalidateMapMeasurements();assert.equal(c.getViewportSize().width,920);const second=viewer.__frameMapMeasurements;tasks.shift()();assert.equal(viewer.__frameMapMeasurements,second,'stale frame callback does not invalidate a new measurement');tasks.shift()();assert.equal(viewer.__frameMapMeasurements,undefined);
 console.log('geometry-cache: one read per frame, explicit invalidation, stale-callback guard passed');
}
{
 let now=0,next=0;const timers=new Map();const source=candidateSource(original,'src/main.js','adaptive-raster');
 const c=vm.createContext({performance:{now:()=>now},window:{GestureEvent:class{},setTimeout:(f,ms)=>{timers.set(++next,{f,due:now+ms});return next},clearTimeout:id=>timers.delete(id)},isEditorSite:false,foodGuide:null,ZOOM_RASTER_EVERY_FRAMES:4,ZOOM_RASTER_SETTLE_MS:140,canvasLayer:{style:{}},frontLayer:{style:{}},state:{baseWidth:1000,baseHeight:700,zoom:1,renderedZoom:0,zoomRasterTimer:0,zoomLastInputAt:null,zoomFramesSinceRaster:0,lastFlushedZoom:0,x:0,y:0},setStatus(){},getFloorLabel:()=> '1F',getRenderedFloorDefinition:()=>({id:'1F'})});
 functions(c,source,['mirrorFrontLayer','zoomRasterDelayFromInput','recordMapInput','shouldDeferZoomRaster','commitZoomRaster','flushViewRender']);c.flushViewRender();let rasterCount=0,maxStretch=1;
 for(let i=1;i<=40;i++){now=i*16;c.recordMapInput();c.state.zoom*=1.005;const old=c.canvasLayer.style.width;c.flushViewRender();rasterCount+=c.canvasLayer.style.width!==old;const r=c.state.zoom/c.state.renderedZoom;maxStretch=Math.max(maxStretch,r,1/r);}
 assert.ok(rasterCount<10,'fine input redraws less often than the fixed 1/4 policy');assert.ok(maxStretch<1.21);
 c.state.zoom*=1.25;now+=16;c.recordMapInput();c.flushViewRender();assert.equal(c.state.renderedZoom,c.state.zoom,'large scale changes redraw immediately');
 now+=16;c.recordMapInput();c.state.zoom*=1.01;c.flushViewRender();assert.ok(timers.size);const deadline=timers.get(c.state.zoomRasterTimer).due;assert.equal(deadline,now+140);
 now=deadline;timers.get(c.state.zoomRasterTimer).f();assert.equal(c.state.renderedZoom,c.state.zoom);assert.equal(c.state.zoomLastInputAt,null);
 console.log(JSON.stringify({adaptiveFineInputFrames:40,adaptiveRasterCount:rasterCount,maxStretch,lastInput140ms:true}));
}
