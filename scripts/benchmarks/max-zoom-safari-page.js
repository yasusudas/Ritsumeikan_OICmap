// Real Safari. The isolated candidate changes only the periodic raster policy.
const metadata = await fetch('/metadata').then(r => r.json());
// The original SVGO experiment keeps its defaults; other isolated SVG experiments
// can reuse exactly the same load/warm/wheel/measure functions and timings.
const candidate = 'max-4';
const cases = metadata.cases ?? [{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}];
const views = metadata.visualViews ?? [
  { id: '1x', scale: 1 }, { id: '4x', scale: 4 },
  { id: '10x', scale: 10, width: 1600, height: 1100, center: [.7,.45] },
];
const frame = document.querySelector('#app');
frame.style.marginLeft='32.5px';frame.style.marginRight='0';
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
  for (const delta of [-1, 1]) for (let i=0;i<11;i++) { wheel(app, delta); await raf(); }
  await sleep(600);
}
function snapshot(app,geometry=false) {
  const {width,height,transform}=app.layer.style, match=transform.match(/scale\(([^)]+)\)/);
  const scale=match?Number(match[1]):1;
  return {width,height,transform,scale,logicalWidth:parseFloat(width)*scale,logicalHeight:parseFloat(height)*scale,
    ...(geometry?{viewerRect:app.viewer.getBoundingClientRect().toJSON(),imageRect:app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON(),frameRect:frame.getBoundingClientRect().toJSON()}: {})};
}
function capOf(variant){return metadata.caps[variant];}
function metrics(app){
 const image=app.d.querySelector('.floor-svg'),width=app.viewer.clientWidth,height=app.viewer.clientHeight;
 // All four tested sheets are landscape, and height limits their cover fit.
 if(image.naturalWidth/image.naturalHeight<=width/height)throw Error('Unexpected cover-fit axis');
 return {baseHeight:height,baseWidth:height*(app.d.documentElement.lang==='en'?1190.55/841.89:1587.4/1122.52)};
}
async function pan(app){
 const r=app.viewer.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2,samples=[];
 app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:x,clientY:y,button:0,bubbles:true}));let before=await raf();
 for(let i=0;i<60;i++){app.w.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:x+120*Math.sin(i/10),clientY:y+70*Math.cos(i/10),buttons:1,bubbles:true}));const now=await raf();samples.push(now-before);before=now;}
 app.w.dispatchEvent(new app.w.MouseEvent('mouseup',{bubbles:true}));return {stats:stats(samples),samples};
}
async function measure(app,variant){
 const m=metrics(app),initial=snapshot(app),initialZoom=initial.logicalHeight/m.baseHeight,cap=capOf(variant),routes=[],visibility=[];
 let model=initialZoom;
 for(const [name,steps]of [['common',11],['to-cap',32]]){
  const samples=[],phases=[],settles=[];
  for(let cycle=0;cycle<2;cycle++)for(const [direction,delta]of [['in',-1],['out',1]]){
   let previous=await raf();const trace=[],begin=snapshot(app);
   for(let step=1;step<=steps;step++){
    const before=model;model=Math.max(initialZoom,Math.min(cap,model*(delta<0?1.1:1/1.1)));
    wheel(app,delta);const now=await raf(),state=snapshot(app);visibility.push(document.visibilityState);
    const row={cycle,direction,step,dt:now-previous,expectedBefore:before,expectedAfter:model,accepted:Math.abs(model-before)>1e-7,...state};previous=now;trace.push(row);samples.push(row);
   }
   const settle=[];for(let i=0;i<18;i++){const now=await raf();settle.push({dt:now-previous,...snapshot(app)});previous=now;visibility.push(document.visibilityState);}
   const end=snapshot(app);if(Math.abs(end.logicalHeight/m.baseHeight-model)>1e-5)throw Error(`Model mismatch ${name} ${direction}`);
   if(name==='common'&&trace.some(x=>!x.accepted))throw Error('Common path unexpectedly clamped');
   phases.push({cycle,direction,begin,trace,end});settles.push(...settle);
  }
  const active=samples.filter(x=>x.accepted),clamped=samples.filter(x=>!x.accepted);
  routes.push({name,steps,all:stats(samples.map(x=>x.dt)),active:stats(active.map(x=>x.dt)),zoomIn:stats(active.filter(x=>x.direction==='in').map(x=>x.dt)),zoomOut:stats(active.filter(x=>x.direction==='out').map(x=>x.dt)),clamped:clamped.length?stats(clamped.map(x=>x.dt)):null,settle:stats(settles.map(x=>x.dt)),samples,phases,settles});
 }
 for(let i=0;i<32;i++){wheel(app,-1);await raf();}await sleep(400);const ceiling=snapshot(app),ceilingPan=await pan(app);
 return {cap,initial,initialZoom,base:m,routes,ceiling,ceilingZoom:ceiling.logicalHeight/m.baseHeight,relativeCeiling:ceiling.logicalHeight/initial.logicalHeight,ceilingPan,hiddenFrames:visibility.filter(x=>x!=='visible').length,actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').getAttribute('src'),viewport:[app.viewer.clientWidth,app.viewer.clientHeight]};
}
async function perf(){
 await waitFor(()=>document.visibilityState==='visible','Safari foreground');
 const smoke=new URL(location).searchParams.has('smoke'),prefix=smoke?'performance-smoke':'performance';
 const data={environment:environment(),method:'production vanilla Dev versus maxZoom only; common 11-step path and identical 32-step to-cap input, each two in/out cycles; parent rAF; accepted input derived from original clamp model checked against settled DOM; capped input separated; main FPS has no timer interception',trials:[],errors};
 for(const c of (smoke?cases.slice(0,1):cases)){
  const a=['baseline','max-2','max-4','max-6'],b=['max-4','baseline','max-6','max-2'];
  const sequence=smoke?a:c.floor==='1F'?[...a,...a.toReversed(),...b,...b.toReversed()]:[...a,...a.toReversed()];
  for(const[index,variant]of sequence.entries()){
   status.textContent=`最大ズームFPS ${c.language} ${c.floor} ${index+1}/${sequence.length} ${variant} — Safariを前面に維持`;
   const app=await load(variant,c.language,c.floor);await warm(app);const result=await measure(app,variant);
   data.trials.push({...c,index,variant,...result,environment:environment()});await post(prefix+'-progress',data);
  }
 }
 await post(prefix,data);status.textContent=`最大ズームFPS完了 — ${data.trials.length}試行を保存`;
}
let qualityContext;
async function quality(){
 await waitFor(()=>document.visibilityState==='visible','Safari foreground');frame.style.marginLeft='32.5px';frame.style.marginRight='0';
 const p=new URL(location).searchParams,variant=p.get('variant')??'baseline',language=p.get('language')??'ja',floor=p.get('floor')??'1F',mode=p.get('mode')??'ceiling';
 const app=await load(variant,language,floor),initial=snapshot(app,true),m=metrics(app),z=initial.logicalHeight/m.baseHeight,cap=capOf(variant);
 const steps=mode==='common'?11:Math.ceil(Math.log(cap/z)/Math.log(1.1)-1e-8);
 const set=app.w.setTimeout.bind(app.w),clear=app.w.clearTimeout.bind(app.w),pending=new Map();
 const hold=()=>{
  app.w.setTimeout=(callback,delay,...args)=>{if(typeof callback==='function'&&callback.toString().includes('zoomRasterTimer')&&callback.toString().includes('renderedZoom')){const id=set(()=>{},2147483647);pending.set(id,{callback,args});return id;}return set(callback,delay,...args);};
  app.w.clearTimeout=id=>{pending.delete(id);clear(id);};
 };
 for(let i=0;i<steps;i++){if(i===steps-1)hold();wheel(app,-1);await raf();}await raf();
 const prefix=`quality-${variant}-${language}-${floor}-${mode}`;
 const info={variant,language,floor,mode,steps,cap,initial,base:m,initialZoom:z,environment:environment(),actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').getAttribute('src'),errors};
 qualityContext={app,set,clear,pending,prefix,info};await post(prefix+'-moving',{...info,state:snapshot(app,true),heldCallbacks:pending.size});
 status.textContent=`画質確認 ${variant} ${language} ${floor} ${mode} — 拡大中の状態を保持`;
}
async function stopQuality(){
 const {app,set,clear,pending,prefix,info}=qualityContext;app.w.setTimeout=set;app.w.clearTimeout=clear;
 for(const[id,{callback,args}]of pending){clear(id);set(callback,140,...args);}pending.clear();await sleep(1000);await raf();await raf();
 await post(prefix+'-stopped',{...info,environment:environment(),state:snapshot(app,true)});status.textContent=`画質確認 ${info.variant} ${info.language} ${info.floor} ${info.mode} — 停止後の実寸描画が完了`;
}
async function usability(){
 await waitFor(()=>document.visibilityState==='visible','Safari foreground');frame.style.marginLeft='32.5px';frame.style.marginRight='0';
 const p=new URL(location).searchParams,variant=p.get('variant')??'baseline',language=p.get('language')??'ja',query=p.get('query')??'AC130';
 const app=await load(variant,language,'1F'),m=metrics(app),initial=snapshot(app,true),input=app.d.querySelector('#search-input');
 input.focus();input.value=query;input.dispatchEvent(new app.w.Event('input',{bubbles:true}));
 await waitFor(()=>[...app.d.querySelectorAll('.search-result[role="option"]')].some(x=>x.textContent.includes(query)),'search result');
 const result=[...app.d.querySelectorAll('.search-result[role="option"]')].find(x=>x.textContent.includes(query));const suggestion=result.textContent;result.click();
 await sleep(1200);await raf();await raf();
 const afterSearch=snapshot(app,true),highlight=app.d.querySelector('.search-highlight-area-outline, .search-highlight-pin');
 const data={variant,language,query,cap:capOf(variant),base:m,initial,afterSearch,suggestion,hash:app.w.location.hash,actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').getAttribute('src'),highlight:highlight?.getBoundingClientRect().toJSON()??null,environment:environment(),errors};
 await post(`usage-${variant}-${language}-${query}`,data);status.textContent=`使い勝手 ${variant} ${language} ${query} — 検索移動が完了`;
}
async function run(fn){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){status.textContent=String(e.stack??e);await post('failure',{error:String(e.stack??e),environment:environment(),errors});}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
document.querySelector('#perf').onclick=()=>run(perf);document.querySelector('#stop').onclick=()=>run(stopQuality);
const action=new URL(location).searchParams.get('run');if(action==='perf')run(perf);else if(action==='quality')run(quality);else if(action==='usage')run(usability);else await load('baseline');
