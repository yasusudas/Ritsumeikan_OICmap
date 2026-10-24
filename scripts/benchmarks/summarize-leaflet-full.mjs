import{readFile,writeFile}from'node:fs/promises';import assert from'node:assert/strict';
const root='output/leaflet-full-safari-2026-10-21',data=JSON.parse(await readFile(root+'/performance.json'));
const median=a=>{a=[...a].sort((a,b)=>a-b);return a.length%2?a[(a.length-1)/2]:(a[a.length/2-1]+a[a.length/2])/2;},range=a=>({median:median(a),min:Math.min(...a),max:Math.max(...a)});
assert.equal(data.trials.length,48);assert.deepEqual(data.errors,[]);const groups=[],issues=[];
for(const language of ['ja','en'])for(const floor of ['1F','5F'])for(const variant of ['baseline','render-only','full'])for(const method of ['common','native']){
 const trials=data.trials.filter(t=>t.language===language&&t.floor===floor&&t.variant===variant).map(t=>t[method]);assert.equal(trials.length,4);
 const changes=[],coverages=[],loaded=[],panCounts=[];
 for(const t of trials){assert.equal(t.hiddenFrames,0);assert.equal(t.environment.visibility,'visible');assert.equal(t.actualLanguage,language);assert.deepEqual(t.environment.viewport,[960,800]);assert.equal(t.zoom.frames,144);assert.equal(t.pan.frames,60);
  let count=0;for(const p of t.phases){let previous=p.initial.width;for(const s of p.trace){if(Math.abs(previous-s.width)>.02)count++;previous=s.width;if(s.tiles)loaded.push(s.tiles);}
   if(p.phase==='zoomIn')coverages.push(p.stop.at(-1).width/p.initial.width);
   if(method==='common'){const expected=p.initial.width*(p.phase==='zoomIn'?1.1**24:1/1.1**24);assert.ok(Math.abs(p.stop.at(-1).width-expected)<.05,'common range');}
  }
  changes.push(count*1000/t.zoom.totalMs);panCounts.push(new Set(t.panTrace.map(s=>s.transform)).size);assert.ok(panCounts.at(-1)>50,'drag really moved');
  if(t.serverAfter.generated!==t.serverBefore.generated)issues.push({language,floor,variant,method,generated:t.serverAfter.generated-t.serverBefore.generated});
  if(t.final.tiles){assert.deepEqual(t.final.tiles.errors,[]);if(variant==='full')assert.ok(t.final.tiles.dragStarts>=1);}
 }
 const metrics={};for(const k of ['zoom','zoomIn','zoomOut','pan','settle'])metrics[k]={fps:range(trials.map(t=>t[k].fps)),p95Ms:median(trials.map(t=>t[k].p95Ms)),maxMs:Math.max(...trials.map(t=>t[k].maxMs))};
 metrics.zoomAndSettle={fps:range(trials.map(t=>(t.zoom.frames+t.settle.frames)*1000/(t.zoom.totalMs+t.settle.totalMs)))};
 groups.push({language,floor,variant,method,n:4,...metrics,cameraChangesPerSecond:range(changes),zoomInCoverage:range(coverages),panDistinctTransforms:range(panCounts),tileLoadingSamples:loaded.filter(v=>v.loading).length,zeroLoadedTileSamples:loaded.filter(v=>v.loadedTiles===0).length,tileSamples:loaded.length,zoomAnimationSamples:loaded.filter(v=>v.zoomAnimating).length});
}
await writeFile(root+'/summary.json',JSON.stringify({environment:data.environment,trials:48,workloads:96,issues,groups},null,2));
for(const g of groups)console.log(g.language+g.floor,g.variant,g.method,'FPS',g.zoom.fps.median.toFixed(2),'range',g.zoomInCoverage.median.toFixed(3),'changes/s',g.cameraChangesPerSecond.median.toFixed(2),'pan',g.pan.fps.median.toFixed(2),'zero',g.zeroLoadedTileSamples);
