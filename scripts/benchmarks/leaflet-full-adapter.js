// Isolated full-interaction candidate. Leaflet owns camera, input handlers and flights.
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './leaflet-floor-adapter.css';
import './leaflet-full-adapter.css';
let map,layer,floorUrl,context,paint,gesture,overlayRoot,syncing=false,moving=false;
const counts={requested:0,loaded:0,errors:[],moves:0,zoomStarts:0,dragStarts:0};
function view(){const z=map.getZoom(),width=1024*2**z,point=map.latLngToContainerPoint([0,0]);return{x:point.x,y:point.y,width,height:width*context.baseHeight/context.baseWidth,zoom:width/context.baseWidth,leafletZoom:z};}
function overlays(){
 if(!overlayRoot){overlayRoot=document.createElement('div');overlayRoot.className='leaflet-full-overlays leaflet-zoom-animated';map.getContainer().append(overlayRoot);}
 for(const node of map.getContainer().querySelectorAll(':scope > #canvas-layer,:scope > .front-layer,:scope > .food-pin-layer'))overlayRoot.append(node);
}
function bounds(){const scale=2**map.getZoom(),height=1024*context.baseHeight/context.baseWidth;map.setMaxBounds([[-height-context.safeBottom/scale,0],[context.safeTop/scale,1024]]);}
function publish(){if(!map||!map._loaded)return;overlays();counts.moves++;paint(view());}
function endZoom(){if(overlayRoot){overlayRoot.style.transition='none';overlayRoot.style.transform='';}if(!syncing){publish();bounds();}gesture?.(false);}

function destination(s){const scale=s.width/1024,size=map.getSize();return{center:[-(size.y/2-s.y)/scale,(size.x/2-s.x)/scale],zoom:Math.log2(scale)};}
function info(){return{ready:Boolean(layer&&!layer.isLoading()&&map.getContainer().querySelector('.leaflet-tile-loaded')),loading:Boolean(layer?.isLoading()),loadedTiles:map?.getContainer().querySelectorAll('.leaflet-tile-loaded').length??0,totalTiles:map?.getContainer().querySelectorAll('.leaflet-tile').length??0,floorUrl,moving,zoomAnimating:Boolean(map?._animatingZoom),overlayTransform:overlayRoot?.style.transform??'',...counts,view:map?view():null,handlers:map?Object.fromEntries(['dragging','scrollWheelZoom','touchZoom','doubleClickZoom','keyboard','boxZoom'].map(k=>[k,map[k].enabled()])):null,options:map?{wheelDebounceTime:map.options.wheelDebounceTime,wheelPxPerZoomLevel:map.options.wheelPxPerZoomLevel,zoomAnimation:map.options.zoomAnimation,zoomSnap:map.options.zoomSnap,inertia:map.options.inertia,minZoom:map.getMinZoom(),maxZoom:map.getMaxZoom()}:null};}
window.__leafletBenchmark={info,get snapshot(){return map?view():null;},
 // Diagnostic/common-camera workload uses public API, separately from native input workload.
 setZoomAround(factor,x,y){const z=map.getZoom()+Math.log2(factor);map.setZoomAround(L.point(x,y),z,{animate:false});},
 getWheelDelta:L.DomEvent.getWheelDelta,
};
export function stopLeafletFull(){map?.stop();}
export function renderLeafletFull(snapshot,onView,onGesture){
 if(!snapshot.width||!snapshot.url)return;context=snapshot;paint=onView;gesture=onGesture;
 const viewer=document.querySelector('#viewer');
 if(!map){
  viewer.classList.add('leaflet-floor','leaflet-full');
  map=L.map(viewer,{crs:L.CRS.Simple,zoomControl:false,attributionControl:false,dragging:true,scrollWheelZoom:true,touchZoom:true,doubleClickZoom:true,keyboard:true,boxZoom:true,zoomSnap:0,zoomDelta:Math.log2(1.1),zoomAnimation:true,fadeAnimation:false,markerZoomAnimation:false,bounceAtZoomLimits:false,inertia:true,maxBoundsViscosity:1});
  map.getPane('mapPane').style.zIndex='0';
  map.on('move',()=>{if(!syncing)publish();});
  map.on('movestart',()=>moving=true);map.on('moveend',()=>{moving=false;if(!syncing)publish();});
  map.on('zoomstart',()=>{counts.zoomStarts++;gesture?.(true);});map.on('dragstart',()=>{counts.dragStarts++;gesture?.(true);});
  map.on('zoomanim',e=>{
   overlays();const old=view(),scale=map.getZoomScale(e.zoom),projected=map.project(e.center,e.zoom),size=map.getSize();
   const x=size.x/2-projected.x-old.x*scale,y=size.y/2-projected.y-old.y*scale;
   overlayRoot.style.transition='transform .25s cubic-bezier(0,0,.25,1)';overlayRoot.style.transform=`translate3d(${x}px,${y}px,0) scale(${scale})`;
  });
  map.on('zoomend',endZoom);map.on('dragend',()=>gesture?.(false));
 }
 const size=map.getSize();if(size.x!==viewer.clientWidth||size.y!==viewer.clientHeight)map.invalidateSize({animate:false,pan:false});
 syncing=true;
 try{
  map.setMinZoom(Math.log2(snapshot.baseWidth*snapshot.minZoom/1024));map.setMaxZoom(Math.log2(snapshot.baseWidth*snapshot.maxZoom/1024));
  if(floorUrl!==snapshot.url){
   if(layer)map.removeLayer(layer);floorUrl=snapshot.url;
   const filename=new URL(floorUrl,location.href).pathname.split('/').at(-1),worldHeight=1024*snapshot.baseHeight/snapshot.baseWidth;
   layer=L.tileLayer(`${location.origin}/tiles/${filename}/{z}/{x}/{y}.png`,{tileSize:256,minZoom:-8,maxZoom:8,minNativeZoom:0,maxNativeZoom:4,bounds:[[-worldHeight,0],[0,1024]],noWrap:true,keepBuffer:1,updateWhenIdle:false,updateWhenZooming:true,updateInterval:0});
   layer.on('tileloadstart',()=>counts.requested++);layer.on('tileload',()=>counts.loaded++);layer.on('tileerror',e=>counts.errors.push(e.tile.src));
   const target=destination(snapshot);map.setView(target.center,target.zoom,{animate:false});layer.addTo(map);
  }else{const target=destination(snapshot);map.setView(target.center,target.zoom,{animate:false});}
  bounds();
 }finally{syncing=false;}publish();
}
export function flyLeafletFull(snapshot,duration){
 if(!map)return;const target=destination(snapshot);map.stop();
 if(duration>0&&!matchMedia('(prefers-reduced-motion: reduce)').matches)map.flyTo(target.center,target.zoom,{animate:true,duration:duration/1000});
 else map.setView(target.center,target.zoom,{animate:false});
}
