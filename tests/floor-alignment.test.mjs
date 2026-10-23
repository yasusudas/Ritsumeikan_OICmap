import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import data from '../src/assets/floor-alignment.json' with {type:'json'};
import {getFloorAlignment, transformPoint, alignFloorPoint, alignFloorPolygons} from '../src/floor-alignment.js';
import {alignFloorSvg} from '../scripts/aligned-floor-svg.mjs';
import {optimizeMapSvg} from '../scripts/map-svg-optimization.mjs';

test('registration landmarks match 1F and source SVG fingerprints remain current', async()=>{
 for(const [file,sha] of Object.entries(data.sourceSha256)) assert.equal(createHash('sha256').update(await readFile(new URL('../src/assets/floors/'+file,import.meta.url))).digest('hex'),sha,file);
 for(const floor of ['2F','3F','4F','5F']) for(const lang of ['ja','en']) {
  const source=await readFile(new URL(`../src/assets/floors/${lang}/${floor}.svg`,import.meta.url),'utf8');
  const svg=alignFloorSvg(optimizeMapSvg(source,{filename:`${lang}/${floor}.svg`}),floor,lang);
  for(const patch of getFloorAlignment(floor,lang)) {
   assert.ok(svg.includes(`matrix(${patch.matrix.join(' ')})`));
   patch.source.forEach(([x,y],i)=>{
    const p=transformPoint(patch.matrix,x,y),target=patch.target[i];
    assert.ok(Math.hypot(p.x-target[0],p.y-target[1])<1e-9,`${floor}/${lang}/${patch.id}`);
    const overlay=alignFloorPoint({xRatio:x/1190.55,yRatio:y/841.89},floor,lang);
    if (overlay.patch === patch.id) assert.ok(Math.hypot(overlay.xRatio*1190.55-p.x,overlay.yRatio*841.89-p.y)<1e-9);
   });
  }
 }
});
test('unregistered floors preserve coordinates; polygons crossing building boundaries are split',()=>{
 const p=[[{xRatio:0,yRatio:0},{xRatio:1,yRatio:0},{xRatio:1,yRatio:1},{xRatio:0,yRatio:1}]];
 assert.equal(alignFloorPolygons(p,'1F'),p);
 for(const f of ['2F','3F','4F','5F']){
  const pieces=alignFloorPolygons(p,f);
  assert.ok(pieces.length>1);
  assert.ok(pieces.every(poly=>poly.every(p=>Number.isFinite(p.xRatio)&&Number.isFinite(p.yRatio))));
 }
});
