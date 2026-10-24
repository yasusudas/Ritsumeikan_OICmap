import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { candidateSource } from './next-optimization-candidates.mjs';
const sourceRoot=resolve(process.argv[2]??'.');
const {placeFoodMarkers}=await import(pathToFileURL(resolve(sourceRoot,'src/food-guide-model.js')));
const source=await readFile(resolve(sourceRoot,'src/food-guide-viewer.js'),'utf8');
const data=JSON.parse(await readFile(resolve(sourceRoot,'public/food-places.json'),'utf8'));
let scenes=0,clipDifferences=0;
for(const language of ['ja','en'])for(const width of [350,900,1600,3500,9000])for(const[x,y]of [[0,0],[.25,-.5],[130,-53],[-9000.7,1500.3]]){
 const points=data.places.map(p=>({id:p.entryId,order:p.order,x:width*p.anchor[language].xRatio,y:width*.707*p.anchor[language].yRatio}));
 const a=placeFoodMarkers(points.map(p=>({...p,x:p.x+x,y:p.y+y})),width,data.places[0].entryId);
 const b=placeFoodMarkers(points,width,data.places[0].entryId);
 for(let i=0;i<a.markers.length;i++){
  const u=a.markers[i],v=b.markers[i];assert.ok(Math.abs(u.x-v.x-x)<1e-8&&Math.abs(u.y-v.y-y)<1e-8);assert.equal(u.hit,v.hit);assert.ok(Math.abs(u.size-v.size)<1e-8);
  const ca=u.clip.match(/[-\d.]+/g).map(Number),cb=v.clip.match(/[-\d.]+/g).map(Number);assert.equal(ca.length,cb.length);assert.ok(ca.every((n,k)=>Math.abs(n-cb[k])<=.00101));if(u.clip!==v.clip)clipDifferences++;
 }scenes++;
}
function harness(changed){
 let calls=0,labels=0;const map={x:0,y:0,width:900,height:636,floorId:'1F',image:{src:'http://localhost/food-ja.svg'}};
 const nodes=new Map(data.places.map(p=>[p.entryId,{dataset:{foodPlace:p.entryId,lang:'ja'},firstChild:{},style:{setProperty(k,v){this[k]=v}},attrs:{},classList:{toggle(){}},hidden:false}]));
 const code=changed?candidateSource(source,'src/food-guide-viewer.js','ui-cache'):source;
 const method=code.slice(code.indexOf('  render() {'),code.indexOf('  reveal() {'));
 const H=vm.runInNewContext('(class H {'+method+'})',{placeFoodMarkers:(...args)=>{calls++;return placeFoodMarkers(...args)},getLang:()=> 'ja',local:v=>v.ja,t:(_,o)=>{labels++;return JSON.stringify(o)},setAttribute:(node,k,v)=>node.attrs[k]=v,Set,Map,URL,location:{href:'http://localhost/'}});
 const h=new H();Object.assign(h,{host:{map:()=>map},button:{attrs:{},classList:{toggle(){}}},browse:false,moreBrowse:false,imageSrc:map.image.src,displayLang:'ja',ready:true,places:data.places,sizeReferenceId:data.places[0].entryId,nodes,drawn:new Map(),overlay:{hidden:false,firstElementChild:nodes.values().next().value,prepend(){},querySelectorAll:()=>[]},placeFrontAreas(){},hoverPins:()=>[],getPlace:id=>data.places.find(p=>p.entryId===id)});
 // Sibling order is irrelevant to this geometry check; nodes are already mounted.
 let prev;for(const node of nodes.values()){if(prev)prev.nextElementSibling=node;node.after=()=>{};prev=node;}
 return {h,map,get calls(){return calls},get labels(){return labels}};
}
const a=harness(false),b=harness(true);
for(let i=0;i<20;i++){a.map.x=b.map.x=i*3.25;a.map.y=b.map.y=-i*1.5;a.h.render();b.h.render();for(const[id,node]of a.h.nodes){const other=b.h.nodes.get(id);assert.equal(node.style.transform,other.style.transform);assert.equal(node.attrs['aria-label'],other.attrs['aria-label']);assert.equal(node.style.clipPath,other.style.clipPath);}}
assert.equal(a.calls,20);assert.equal(b.calls,1);assert.equal(b.labels,data.places.length);b.map.width=1000;b.h.render();assert.equal(b.calls,2);
console.log(JSON.stringify({scenes,clipDifferences,panLayoutCalculations:{published:a.calls,candidate:b.calls-1},panLabelCalculations:{published:a.labels,candidate:b.labels}}));
