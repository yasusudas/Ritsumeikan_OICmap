// Real Safari. The isolated candidate changes only the periodic raster policy.
const metadata = await fetch('/metadata').then(r => r.json());
// The original SVGO experiment keeps its defaults; other isolated SVG experiments
// can reuse exactly the same load/warm/wheel/measure functions and timings.
const candidate = 'plain-4';
const cases = metadata.cases ?? [{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}];
const views = metadata.visualViews ?? [
  { id: '1x', scale: 1 }, { id: '4x', scale: 4 },
  { id: '10x', scale: 10, width: 1600, height: 1100, center: [.7,.45] },
];
const frame = document.querySelector('#app');
const status = document.querySelector('#status');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raf = () => new Promise(requestAnimationFrame);
const post = (name, data) => fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, data }) });
const savePng = async (name, canvas) => fetch('/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, png: canvas.toDataURL('image/png').split(',')[1] }) });
const environment = () => ({ userAgent: navigator.userAgent, dpr: devicePixelRatio,
  parentViewport: [innerWidth, innerHeight], viewport: [frame.clientWidth, frame.clientHeight],
  screen: [screen.width, screen.height], visibility: document.visibilityState,
  safariGestureEvent: 'GestureEvent' in window, timestamp: new Date().toISOString() });
const errors = [];
addEventListener('error', e => errors.push(String(e.message)));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
async function waitFor(check, label) {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) { if (check()) return; await sleep(60); }
  throw Error(`Timed out: ${label}`);
}
async function load(variant, language = 'ja', floor = '1F') {
  localStorage.setItem('oicmap:lang',language);
  frame.src = `/${variant}/${language === 'en' ? 'en/' : ''}index.html`;
  await new Promise((r, reject) => { frame.onload = r; frame.onerror = reject; });
  const w = frame.contentWindow, d = frame.contentDocument;
  w.addEventListener('error', e => errors.push(`${variant}: ${e.message}`));
  w.addEventListener('unhandledrejection', e => errors.push(`${variant}: ${e.reason}`));
  await waitFor(() => d.querySelector('.floor-svg')?.complete && d.querySelector('#canvas-layer')?.style.width, 'initial floor');
  if (floor !== '1F') {
    d.querySelector(`.floor-tab[data-floor="${floor}"]`).click();
    await waitFor(() => d.querySelector(`.floor-tab[data-floor="${floor}"]`)?.classList.contains('is-active'), 'selected floor');
    await waitFor(() => d.querySelector('.floor-svg')?.complete && d.querySelector('.floor-svg')?.getAttribute('src')?.includes(floor.replace('A-6-9F', '6F7F8F9F_BldgA')), 'floor image');
  }
  await sleep(1200);
  await waitFor(() => d.querySelector('.floor-svg')?.complete && d.querySelector('.floor-svg').naturalWidth > 0, 'decoded image');
  return { w, d, viewer: d.querySelector('#viewer'), layer: d.querySelector('#canvas-layer') };
}
function stats(samples) {
  const ordered = [...samples].sort((a,b) => a-b), sum = samples.reduce((a,b)=>a+b,0);
  return { frames: samples.length, totalMs: sum, fps: samples.length * 1000 / sum,
    meanMs: sum / samples.length, p95Ms: ordered[Math.ceil(ordered.length * .95)-1], maxMs: Math.max(...samples),
    over25ms: samples.filter(v=>v>25).length, over50ms: samples.filter(v=>v>50).length };
}
function wheel(app, deltaY) {
  const rect = app.viewer.getBoundingClientRect();
  app.viewer.dispatchEvent(new app.w.WheelEvent('wheel', { deltaY, clientX: rect.left+rect.width*.52, clientY: rect.top+rect.height*.53, bubbles: true, cancelable: true }));
}
async function warm(app) {
  for (const delta of [-1, 1]) for (let i=0;i<24;i++) { wheel(app, delta); await raf(); }
  await sleep(600);
}
async function measure(app,mode) {
  const raf=()=>new Promise((mode.clock==='child'?app.w.requestAnimationFrame.bind(app.w):window.requestAnimationFrame.bind(window)));
  const probe=app.w.__zoomProbe;
  if(probe){probe.events=[];probe.enabled=true;probe.suppressActiveSettle=Boolean(mode.suppress);}
  const wallSamples={zoomIn:[],zoomOut:[],settle:[]};
  const mark=(kind,extra={})=>probe?.emit(kind,{...extra,parentEpoch:performance.timeOrigin+performance.now()});
  const samples = { zoomIn: [], zoomOut: [], pan: [], settle: [] }, visibility = [], layerWidths = [], zoomPhases=[], settlePhases=[];
  // Three identical 24-step zoom-in / zoom-out cycles; 1.1^24 = 9.85, no max-zoom plateau.
  for (let cycle=0;cycle<3;cycle++) {
    for (const [phase,delta] of [['zoomIn',-1],['zoomOut',1]]) {
      if(probe){probe.active=true;probe.context={cycle,phase,step:0};if(mode.offset)probe.offset(mode.offset);}
      let previous = await raf(),wallPrevious=performance.now();
      const phaseStart=snapshot(app), trace=[], settleTrace=[]; let lastInput=0;
      for (let i=0;i<24;i++) {
        if(probe)probe.context={cycle,phase,step:i+1};
        mark('input-enter');lastInput=performance.now(); wheel(app,delta);mark('input-exit',{handlerMs:performance.now()-lastInput});
        const now = await raf(),wallNow=performance.now(); samples[phase].push(now-previous);wallSamples[phase].push(wallNow-wallPrevious);wallPrevious=wallNow; previous=now;mark('parent-observe',{rafStamp:now});
        layerWidths.push(app.layer.style.width); visibility.push(document.visibilityState); trace.push(snapshot(app));
      }
      if(probe){probe.finish();probe.context={cycle,phase:'settle-'+phase,step:0};}
      // Include pending rasterization and the 140ms settle timer separately.
      for (let i=0;i<18;i++) { const now=await raf(),wallNow=performance.now();samples.settle.push(now-previous);wallSamples.settle.push(wallNow-wallPrevious);wallPrevious=wallNow; previous=now; settleTrace.push({...snapshot(app),afterInputMs:performance.now()-lastInput}); }
      zoomPhases.push({cycle,phase,initial:phaseStart,trace});settlePhases.push({cycle,phase,trace:settleTrace});
    }
  }
  if(probe){probe.active=false;probe.context={phase:'pan-prepare'};}
  // Pan at a fixed enlarged scale, with the same app mouse handlers as a real drag.
  for (let i=0;i<16;i++) { wheel(app,-1); await raf(); }
  await sleep(400);
  const rect=app.viewer.getBoundingClientRect(), x=rect.left+rect.width/2, y=rect.top+rect.height/2;
  app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:x,clientY:y,button:0,bubbles:true}));
  let previous=await raf();
  for(let i=0;i<60;i++) {
    app.w.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:x+120*Math.sin(i/10),clientY:y+70*Math.cos(i/10),buttons:1,bubbles:true}));
    const now=await raf(); samples.pan.push(now-previous); previous=now;
  }
  app.w.dispatchEvent(new app.w.MouseEvent('mouseup',{bubbles:true}));
  return { events:probe?[...probe.events]:[],wallSamples,wallZoom:stats([...wallSamples.zoomIn,...wallSamples.zoomOut]),wallCombined:stats([...wallSamples.zoomIn,...wallSamples.zoomOut,...wallSamples.settle]), zoomIn: stats(samples.zoomIn), zoomOut: stats(samples.zoomOut), zoom: stats([...samples.zoomIn,...samples.zoomOut]),
    pan: stats(samples.pan), settle: stats(samples.settle), zoomAndSettle:stats([...samples.zoomIn,...samples.zoomOut,...samples.settle]), raw: samples, zoomPhases, settlePhases,
    hiddenFrames: visibility.filter(v=>v!=='visible').length, distinctRasterWidths: new Set(layerWidths).size,
    actualLanguage:app.d.documentElement.lang, image: app.d.querySelector('.floor-svg').getAttribute('src'), viewport:[app.viewer.clientWidth,app.viewer.clientHeight] };
}
function snapshot(app,geometry=false) {
  const {width,height,transform}=app.layer.style, match=transform.match(/scale\(([^)]+)\)/);
  const scale=match?Number(match[1]):1;
  return {width,height,transform,scale,logicalWidth:parseFloat(width)*scale,logicalHeight:parseFloat(height)*scale,
    ...(geometry?{viewerRect:app.viewer.getBoundingClientRect().toJSON(),imageRect:app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON(),frameRect:frame.getBoundingClientRect().toJSON()}: {})};
}


async function perf(){
 const data={environment:environment(),method:'diagnostic ablation only: hide the original floor img with visibility:hidden; keep dimensions, food overlays, handlers and raster cadence; visible/hidden/hidden/visible',trials:[],errors};
 for(const[index,hideImage]of [false,true,true,false].entries()){
  status.textContent=`SVG表示の切り分け ${index+1}/4 — ${hideImage?'SVG非表示':'元SVG表示'} （Safariを前面に維持）`;
  const app=await load('trace-4','ja','1F');await warm(app);
  app.d.querySelector('.floor-svg').style.visibility=hideImage?'hidden':'visible';await raf();await raf();
  const result=await measure(app,{id:hideImage?'hidden4':'visible4'});
  data.trials.push({index,hideImage,...result,environment:environment()});await post('svg-visibility-progress',data);
 }
 await post('svg-visibility',data);status.textContent='SVG表示の切り分け完了 — 4試行を保存';
}
async function run(){document.querySelector('#perf').disabled=true;try{await perf();}catch(e){status.textContent=String(e.stack??e);await post('svg-visibility-failure',{error:String(e.stack??e),errors,environment:environment()});}finally{document.querySelector('#perf').disabled=false;}}
document.querySelector('#perf').onclick=run;
if(new URL(location).searchParams.get('run')==='visibility')run();else await load('plain-4');
