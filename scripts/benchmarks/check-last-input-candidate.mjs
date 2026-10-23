// Fake-clock behavioral checks of the exact transformed source used in Safari.
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';
const source=readFileSync('output/last-input-safari-2026-10-21/candidate-source.js','utf8');
function viewer(){
 let now=0,id=0;const timers=new Map();
 const context=vm.createContext({window:{GestureEvent:function(){},setTimeout(fn,delay){timers.set(++id,{fn,due:now+delay,delay});return id;},clearTimeout(id){timers.delete(id);}},performance:{now:()=>now},isEditorSite:false,foodGuide:null,
 ZOOM_RASTER_SETTLE_MS:140,ZOOM_RASTER_EVERY_FRAMES:4,canvasLayer:{style:{}},frontLayer:{style:{}},
 state:{baseWidth:1000,baseHeight:700,zoom:1,x:0,y:0,renderedZoom:0,zoomRasterTimer:0,zoomLastInputAt:null,zoomFramesSinceRaster:0,lastFlushedZoom:0},setStatus(){},getFloorLabel:()=> '1F',getRenderedFloorDefinition:()=>({id:'1F'})});
 for(const name of ['zoomRasterDelayFromInput','recordMapInput','shouldDeferZoomRaster','commitZoomRaster','flushViewRender','mirrorFrontLayer']){
  const match=source.match(new RegExp(`^  function ${name}\\([^]*?^  }`,'m'));assert.ok(match,name);vm.runInContext(match[0],context);
 }
 context.flushViewRender();
 return Object.assign(context,{timers,at(t){now=t;},fire(){const entry=timers.get(context.state.zoomRasterTimer);assert.ok(entry);timers.delete(context.state.zoomRasterTimer);entry.fn();}});
}
test('delayed flush preserves input+140 deadline',()=>{const v=viewer();v.recordMapInput();v.state.zoom=2;v.at(70);v.flushViewRender();assert.equal(v.timers.get(v.state.zoomRasterTimer).due,140);v.at(140);v.fire();assert.equal(v.canvasLayer.style.width,'2000px');assert.equal(v.state.zoomLastInputAt,null);});
test('new input cancels timer; stale callback cannot resize before new deadline',()=>{const v=viewer();v.recordMapInput();v.state.zoom=2;v.flushViewRender();const old=v.timers.get(v.state.zoomRasterTimer).fn;v.at(100);v.recordMapInput();assert.equal(v.timers.size,1);v.at(140);old();assert.equal(v.canvasLayer.style.width,'1000px');assert.equal(v.timers.get(v.state.zoomRasterTimer).due,240);v.at(240);v.fire();assert.equal(v.canvasLayer.style.width,'2000px');});
test('queued render and continuing input retain last-input deadline',()=>{const v=viewer();v.recordMapInput();v.state.zoom=1.1;v.flushViewRender();v.at(50);v.recordMapInput();v.state.zoom=1.2;v.at(100);v.recordMapInput();v.state.zoom=1.3;v.at(150);v.flushViewRender();assert.equal(v.timers.get(v.state.zoomRasterTimer).due,240);v.at(240);v.fire();assert.equal(v.canvasLayer.style.width,'1300px');});
test('four changed zoom flushes resize; pans do not advance cadence; front layer mirrors',()=>{const v=viewer(),resizes=[];for(let i=1;i<=8;i++){v.at(i*10);v.recordMapInput();v.state.zoom=1+i/10;v.flushViewRender();if(v.state.renderedZoom===v.state.zoom)resizes.push(i);v.state.x+=5;v.flushViewRender();for(const k of ['width','height','transform'])assert.equal(v.frontLayer.style[k],v.canvasLayer.style[k]);}assert.deepEqual(resizes,[4,8]);});
test('programmatic animation without input keeps 140ms fallback',()=>{const v=viewer();v.at(300);v.state.zoom=2;v.flushViewRender();assert.equal(v.timers.get(v.state.zoomRasterTimer).due,440);v.at(440);v.fire();assert.equal(v.canvasLayer.style.width,'2000px');});
test('pan input extends pending zoom settle deadline',()=>{const v=viewer();v.recordMapInput();v.state.zoom=2;v.flushViewRender();v.at(130);v.recordMapInput();v.state.x=20;v.flushViewRender();assert.equal(v.timers.get(v.state.zoomRasterTimer).due,270);v.at(270);v.fire();assert.equal(v.canvasLayer.style.width,'2000px');});
