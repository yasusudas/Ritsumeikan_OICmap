// Experiment only: original SVG bytes, definitions, hierarchy and paint order are preserved.
import {mapVisibleRect,transformBounds,overlaps} from './svg-viewport-math.mjs';
const mode=__SVG_VIEWPORT_MODE__,cache=new Map(),prepared=new WeakMap();let current=null,lastSnapshot=null;
const diagnostics={errors:[],updates:0,styleWrites:0};
window.__svgViewportBenchmark={info(){return {mode,ready:Boolean(current?.ready),url:current?.url,entries:current?.records.length??0,shown:current?.shown??0,culled:current?.culled??0,alwaysKeep:current?.alwaysKeep??0,svgElements:current?.svgElements??0,zeroBounds:current?.zeroBounds??0,bboxFallbacks:current?.bboxFallbacks??0,initializeMs:current?.initializeMs,updates:diagnostics.updates,styleWrites:diagnostics.styleWrites,errors:[...diagnostics.errors],snapshot:lastSnapshot};}};
export async function prepareVectorSvg(image){
 await image.decode();const url=image.dataset.originalSvgUrl;
 if(!cache.has(url))cache.set(url,(async()=>{
  const start=performance.now(),response=await fetch(url);if(!response.ok)throw Error('SVG fetch '+response.status);
  const text=await response.text(),doc=new DOMParser().parseFromString(text,'image/svg+xml');
  if(doc.querySelector('parsererror')||doc.documentElement.localName!=='svg')throw Error('Invalid SVG XML');
  const svg=document.importNode(doc.documentElement,true),host=document.createElement('span');host.className='svg-vector-host';host.setAttribute('aria-hidden','true');
  Object.assign(host.style,{position:'absolute',inset:'0',display:'block',width:'100%',height:'100%',pointerEvents:'none',transition:'opacity var(--dur) var(--ease)'});
  // Isolate original SVG styles/IDs from the application's DOM and overlay SVGs.
  host.attachShadow({mode:'open'}).append(svg);Object.assign(svg.style,{display:'block',width:'100%',height:'100%',maxWidth:'none'});
  return {url,svg,host,records:[],ready:false,parsedAt:performance.now(),start,svgElements:svg.querySelectorAll('*').length+1};
 })());
 const record=await cache.get(url);prepared.set(image,record);
}
export function setVectorOpacity(image,value){const record=prepared.get(image);if(record)record.host.style.opacity=String(value);}
export function mountVectorSvg(image){
 const record=prepared.get(image);if(!record)throw Error('SVG not prepared');
 image.after(record.host);record.host.style.opacity=image.style.opacity||'1';image.style.visibility='hidden';current=record;
 const viewer=document.querySelector('#viewer');record.viewportWidth=viewer.clientWidth;record.viewportHeight=viewer.clientHeight;
 if(!record.observer){record.observer=new ResizeObserver(entries=>{const r=entries[0].contentRect;record.viewportWidth=r.width;record.viewportHeight=r.height;});record.observer.observe(viewer);}
 if(!record.ready){
  record.box=record.svg.viewBox.baseVal;
  if(!record.box.width||!record.box.height)throw Error('Missing viewBox');
  const inverse=record.svg.getCTM().inverse();let zeroBounds=0,bboxFallbacks=0;
  for(const node of record.svg.children){
   if(['defs','style','title','desc','metadata'].includes(node.localName))continue;
   if(getComputedStyle(node).display==='none')continue;
   const always=node.hasAttribute('mask')||node.hasAttribute('filter')||Boolean(node.querySelector('[mask],[filter]'));
   const item={node,always,visible:true,display:node.style.getPropertyValue('display'),priority:node.style.getPropertyPriority('display'),bounds:null};
   if(!always){try{const b=node.getBBox(),m=inverse.multiply(node.getCTM());if(b.width===0&&b.height===0)zeroBounds++;item.bounds=transformBounds(b,m,8);if(!Object.values(item.bounds).every(Number.isFinite))throw Error('Nonfinite bounds');}catch(e){item.always=true;bboxFallbacks++;}}
   record.records.push(item);
  }
  Object.assign(record,{ready:true,zeroBounds,bboxFallbacks,alwaysKeep:record.records.filter(r=>r.always).length,initializeMs:performance.now()-record.start});
 }
 renderVisibleSvg(lastSnapshot);return record;
}
export function renderVisibleSvg(snapshot){
 if(!snapshot||!current?.ready)return;lastSnapshot={...snapshot,viewportWidth:current.viewportWidth,viewportHeight:current.viewportHeight};
 const rect=mapVisibleRect(lastSnapshot,current.box,64);if(!rect)return;let shown=0,culled=0;diagnostics.updates++;
 for(const item of current.records){
  const visible=mode==='all'||item.always||overlaps(item.bounds,rect);
  if(visible)shown++;else culled++;
  if(visible!==item.visible){if(visible){if(item.display)item.node.style.setProperty('display',item.display,item.priority);else item.node.style.removeProperty('display');}else item.node.style.setProperty('display','none','important');item.visible=visible;diagnostics.styleWrites++;}
 }
 current.shown=shown;current.culled=culled;
}
