import {readFile,writeFile,readdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const dir='output/svg-viewport-safari-2026-10-21';
const data=JSON.parse(await readFile(`${dir}/performance.json`));
const median=xs=>{const a=[...xs].sort((a,b)=>a-b),n=a.length;return n%2?a[(n-1)/2]:(a[n/2-1]+a[n/2])/2;};
const summary=xs=>({median:median(xs),min:Math.min(...xs),max:Math.max(...xs)});
assert.equal(data.trials.length,48);assert.deepEqual(data.errors,[]);
const groups=[],sampleDifferences=[];
for(const language of ['ja','en'])for(const floor of ['1F','5F']){
 let reference;
 for(const variant of ['baseline','inline-all','svg-cull']){
  const trials=data.trials.filter(t=>t.language===language&&t.floor===floor&&t.variant===variant);
  assert.equal(trials.length,4);
  for(const t of trials){
   assert.equal(t.hiddenFrames,0);assert.equal(t.environment.visibility,'visible');assert.equal(t.actualLanguage,language);assert.deepEqual(t.viewport,[960,800]);
   assert.equal(t.zoom.frames,144);assert.equal(t.pan.frames,60);assert.equal(t.settle.frames,108);
   const dimensions=t.zoomPhases.flatMap(p=>p.trace.map(s=>[s.logicalWidth,s.logicalHeight]));
   reference??=dimensions;
   for(let i=0;i<dimensions.length;i++)if(Math.abs(dimensions[i][0]-reference[i][0])>.02)sampleDifferences.push({language,floor,variant,index:t.index,frame:i,expected:reference[i],sample:dimensions[i]});
   for(let i=0;i<6;i++){const end=t.settlePhases[i].trace.at(-1),ref=reference[(i+1)*24-1];assert.ok(Math.abs(end.logicalWidth-ref[0])<.02,'same settled logical zoom');assert.ok(Math.abs(end.logicalHeight-ref[1])<.02);}

  }
  const all=trials.flatMap(t=>t.zoomPhases.flatMap(p=>p.trace)).filter(s=>s.vector);
  const terminal=trials.flatMap(t=>t.zoomPhases.filter(p=>p.phase==='zoomIn').map(p=>p.trace.at(-1).vector)).filter(Boolean);
  const metrics={};for(const key of ['zoom','zoomIn','zoomOut','pan','settle','zoomAndSettle'])metrics[key]={fps:summary(trials.map(t=>t[key].fps)),p95Ms:median(trials.map(t=>t[key].p95Ms)),maxMs:Math.max(...trials.map(t=>t[key].maxMs))};
  groups.push({language,floor,variant,n:trials.length,...metrics,loadReadyMs:summary(trials.map(t=>t.loadStats.navigationToReadyMs)),
   vector:all.length?{entries:all[0].vector.entries,svgElements:all[0].vector.svgElements,alwaysKeep:all[0].vector.alwaysKeep,bboxFallbacks:Math.max(...all.map(s=>s.vector.bboxFallbacks)),initializeMs:summary(trials.map(t=>t.zoomPhases[0].trace[0].vector.initializeMs)),terminalCulled:summary(terminal.map(v=>v.culled)),terminalShown:summary(terminal.map(v=>v.shown)),terminalCulledPercent:summary(terminal.map(v=>100*v.culled/v.entries))}:null});
 }
}
const names=await readdir(dir),quality=[];
for(const n of names.filter(n=>/^quality-.*-(moving|stopped)\.json$/.test(n))){const d=JSON.parse(await readFile(`${dir}/${n}`));assert.equal(d.environment.visibility,'visible');assert.deepEqual(d.errors,[]);quality.push({file:n,...d});}
const result={environment:data.environment,trials:data.trials.length,checks:'48 trials, 0 hidden zoom frames, no browser errors, correct languages, viewport 960x800, matched settled logical zoom dimensions; CSS samples compared at 0.02px tolerance',sampleDifferences,groups,quality};
await writeFile(`${dir}/summary.json`,JSON.stringify(result,null,2));
for(const g of groups)console.log(`${g.language} ${g.floor} ${g.variant}: zoom ${g.zoom.fps.median.toFixed(2)} [${g.zoom.fps.min.toFixed(2)},${g.zoom.fps.max.toFixed(2)}] / pan ${g.pan.fps.median.toFixed(2)} / p95 ${g.zoom.p95Ms} / load ${g.loadReadyMs.median}`);
