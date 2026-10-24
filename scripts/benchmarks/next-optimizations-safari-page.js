// Actual Safari: vanilla Dev versus the current Version3.1 production build.
const metadata = await fetch('/metadata').then(r => r.json());
// The original SVGO experiment keeps its defaults; other isolated SVG experiments
// can reuse exactly the same load/warm/wheel/measure functions and timings.
const candidate = new URL(location).searchParams.get('candidate') ?? metadata.candidateVariant;
const controlled=new URL(location).searchParams.has('controlled');
const zoomSteps=controlled?16:24;
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
  safariGestureEvent: 'GestureEvent' in window, focused:document.hasFocus(), screenOrigin:[screenX,screenY], timestamp: new Date().toISOString() });
const errors = [];
addEventListener('error', e => errors.push(String(e.message)));
addEventListener('unhandledrejection', e => errors.push(String(e.reason)));
async function waitFor(check, label) {
  const deadline = performance.now() + 30000;
  while (performance.now() < deadline) { if (check()) return; await sleep(60); }
  throw Error(`Timed out: ${label}; document=${frame.contentDocument?.URL}; image=${frame.contentDocument?.querySelector('.floor-svg')?.src}; earlyErrors=${JSON.stringify(frame.contentWindow?.__benchmarkErrors)}`);
}
async function load(variant, language = 'ja', floor = '1F') {
  localStorage.setItem('oicmap:lang',language);
  const token=crypto.randomUUID();
  frame.src = `/${variant}/${language === 'en' ? 'en/' : ''}index.html?benchmarkDocument=${token}`;
  await waitFor(() => frame.contentDocument?.URL.includes(token) && frame.contentDocument?.querySelector('#canvas-layer')?.style.width, 'new document ready');
  const w = frame.contentWindow, d = frame.contentDocument;
  errors.push(...(w.__benchmarkErrors??[]).map(e=>`${variant}: ${e}`));
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
async function centerCamera(app,precise=false,point=[.5,.5]){
  const s=snapshot(app,true),r=app.viewer.getBoundingClientRect();
  const dx=r.width/2-s.logicalWidth*point[0]-s.imageRect.x,dy=r.height/2-s.logicalHeight*point[1]-s.imageRect.y;
  const x=r.left+r.width/2,y=r.top+r.height/2;
  if(precise){
    const send=(type,px,py)=>{const event=new app.w.MouseEvent(type,{clientX:px,clientY:py,button:0,buttons:type==='mousemove'?1:0,bubbles:true});Object.defineProperties(event,{clientX:{value:px},clientY:{value:py}});(type==='mousedown'?app.viewer:app.w).dispatchEvent(event);};
    send('mousedown',x,y);send('mousemove',x+dx,y+dy);await raf();send('mouseup',x+dx,y+dy);await raf();
  }else{
  app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:x,clientY:y,button:0,bubbles:true}));
  app.w.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:x+dx,clientY:y+dy,buttons:1,bubbles:true}));
  await raf();app.w.dispatchEvent(new app.w.MouseEvent('mouseup',{clientX:x+dx,clientY:y+dy,bubbles:true}));await raf();
  }
}
async function prepareControlled(app,targetWidth=2000){
  for(let i=0;i<8;i++){wheel(app,-1);await raf();}
  await sleep(250);
  const current=snapshot(app).logicalWidth, ratio=targetWidth/current;
  const rect=app.viewer.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  const points=span=>[{identifier:1,clientX:cx-span/2,clientY:cy,pageX:cx-span/2,pageY:cy},{identifier:2,clientX:cx+span/2,clientY:cy,pageX:cx+span/2,pageY:cy}];
  const send=(type,touches,changed=touches)=>{const event=new app.w.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(event,{touches:{value:touches},changedTouches:{value:changed}});app.viewer.dispatchEvent(event);};
  send('touchstart',points(100));send('touchmove',points(100*ratio));send('touchend',[],points(100*ratio));
  await raf();await sleep(250);await centerCamera(app,true);await sleep(250);
  if(Math.abs(snapshot(app).logicalWidth-targetWidth)>.01)throw Error('Controlled width did not reach target CSS px');
}
async function warm(app) {
  for (const delta of [-1, 1]) for (let i=0;i<zoomSteps;i++) { wheel(app, delta); await raf(); }
  await sleep(600);
}
async function measure(app) {
  const samples = { zoomIn: [], zoomOut: [], pan: [], settle: [] }, visibility = [], layerWidths = [], zoomPhases=[], settlePhases=[];
  // Three identical 24-step zoom-in / zoom-out cycles; 1.1^24 = 9.85, no max-zoom plateau.
  for (let cycle=0;cycle<3;cycle++) {
    for (const [phase,delta] of [['zoomIn',-1],['zoomOut',1]]) {
      let previous = await raf();
      const phaseStart=snapshot(app), trace=[], settleTrace=[]; let lastInput=0;
      for (let i=0;i<zoomSteps;i++) {
        lastInput=performance.now(); wheel(app,delta);
        const now = await raf(); samples[phase].push(now-previous); previous=now;
        layerWidths.push(app.layer.style.width); visibility.push(document.visibilityState); trace.push(snapshot(app));
      }
      // Include pending rasterization and the 140ms settle timer separately.
      for (let i=0;i<18;i++) { const now=await raf(); samples.settle.push(now-previous); previous=now; settleTrace.push({...snapshot(app),afterInputMs:performance.now()-lastInput}); }
      zoomPhases.push({cycle,phase,initial:phaseStart,trace});settlePhases.push({cycle,phase,trace:settleTrace});
    }
  }
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
  return { zoomIn: stats(samples.zoomIn), zoomOut: stats(samples.zoomOut), zoom: stats([...samples.zoomIn,...samples.zoomOut]),
    pan: stats(samples.pan), settle: stats(samples.settle), zoomAndSettle:stats([...samples.zoomIn,...samples.zoomOut,...samples.settle]), raw: samples, zoomPhases, settlePhases,
    hiddenFrames: visibility.filter(v=>v!=='visible').length, distinctRasterWidths: new Set(layerWidths).size,
    actualLanguage:app.d.documentElement.lang, image: app.d.querySelector('.floor-svg').getAttribute('src'), viewport:[app.viewer.clientWidth,app.viewer.clientHeight] };
}
async function perf() {
  status.textContent='開始状態 '+document.visibilityState; await post('startup',environment());
  await waitFor(() => document.visibilityState === 'visible', 'Safari foreground');
  const data = { environment: environment(), method: 'actual Safari, production build, synthetic wheel/mouse input through unmodified app handlers; parent rAF intervals; warmup per trial; 3 x 16 in/out steps after controlled preparation; settles recorded separately; matched triplet count from pairs URL parameter (default four on 1F, maximum two on 5F); exploratory screening; rotated preset permutations; all 3 variants in each triplet; language interleaved', trials: [], errors };
  const smoke=new URL(location).searchParams.has('smoke'), prefix='performance-'+candidate+(smoke?'-smoke':new URL(location).searchParams.has('replay')?'-replay':'');
  // Balanced AB/BA pairs, specified before collecting data. Each pair is a trial unit.
  for (let pair=0;pair<(smoke?1:Number(new URL(location).searchParams.get('pairs')??4));pair++) for (const c of (smoke?cases.slice(0,1):cases)) {
    if(c.floor==='5F' && pair>=2)continue;
    const only=new URL(location).searchParams.get('only');if(only&&only!==`${pair}:${c.language}:${c.floor}`)continue;
    const orders=[['baseline','version31',candidate],['version31',candidate,'baseline'],[candidate,'baseline','version31'],[candidate,'version31','baseline'],['version31','baseline',candidate],['baseline',candidate,'version31']];
    const sequence=orders[(pair+(c.language==='en'?3:0))%orders.length];
    for (const [order,variant] of sequence.entries()) {
      status.textContent=`Safari / ${variant==='baseline'?'Dev':variant} / ${c.language} ${c.floor} / 組${pair+1} 順${order+1} — 計測中`;
      const app=await load(variant,c.language,c.floor); if(controlled)await prepareControlled(app); await warm(app);
      const initial=snapshot(app,true), result=await measure(app);
      data.trials.push({ ...c, variant, pair, order, initial, ...result, controlled, zoomSteps, environment: environment() });
      await post(prefix+'-progress',data);
    }
  }
  await post(prefix,data); status.textContent=`FPS計測完了 — ${data.trials.length}試行の生データを保存しました`;
  return data;
}
function snapshot(app,geometry=false) {
  const {width,height,transform}=app.layer.style, match=transform.match(/scale\(([^)]+)\)/);
  const scale=match?Number(match[1]):1;
  return {width,height,transform,scale,logicalWidth:parseFloat(width)*scale,logicalHeight:parseFloat(height)*scale,
    ...(app.w.__hybridMap?{hybrid:app.w.__hybridMap.info()}:{}),
    ...(geometry?{viewerRect:app.viewer.getBoundingClientRect().toJSON(),imageRect:app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON(),frameRect:frame.getBoundingClientRect().toJSON()}: {})};
}
let qualityContext;
async function quality() {
  // Keep the same half-pixel origin as the 1025px FPS window, independent of outer resize.
  frame.style.marginLeft = "32.5px"; frame.style.marginRight = "0";
  const params=new URL(location).searchParams,variant=params.get('variant')??candidate,language=params.get('language')??'ja',floor=params.get('floor')??'1F',steps=Number(params.get('steps')??23);
  const app=await load(variant,language,floor);await prepareControlled(app,1000);const initial=snapshot(app,true);
  const set=app.w.setTimeout.bind(app.w),clear=app.w.clearTimeout.bind(app.w),pending=new Map();
  // Quality screenshots only: hold the identified raster-settle callback so native capture
  // does not replace the in-zoom compositor state with a sharp stopped frame.
  // Performance runs never install this hook. No canvas SVG rerender is used.
  const hold=()=>{ app.w.setTimeout=(callback,delay,...args)=>{
    if(typeof callback==='function' && (callback.toString().includes('zoomRasterTimer') && callback.toString().includes('renderedZoom') || callback.__hybridSettle)){const id=set(()=>{},2147483647);pending.set(id,{callback,args});return id;}
    return set(callback,delay,...args);
  };
  app.w.clearTimeout=id=>{pending.delete(id);clear(id);}; };
  for(let i=0;i<steps;i++){if(i===steps-1)hold();wheel(app,-1);await raf();}await raf();
  if(params.get('camera')==='room'){await centerCamera(app,true,[.667799,.571125]);await raf();}else if(params.get('camera')==='center'){await centerCamera(app,true);await raf();}
  if(app.w.__hybridMap){await new Promise(app.w.requestAnimationFrame.bind(app.w));await waitFor(()=>app.w.__hybridMap.info().canvasVisible&&!app.w.__hybridMap.info().svgVisible,'hybrid moving canvas visible');app.w.__hybridMap.hold(true);}
  const prefix=`quality${params.get('camera')==='room'?'-room':params.get('camera')==='center'?'-centered':''}-${variant}-${language}-${floor}-${steps}`;
  qualityContext={app,set,clear,pending,prefix,variant,language,floor,steps,initial};
  await post(prefix+'-moving',{environment:environment(),variant,language,floor,steps,phase:'moving-state-held',initial,state:snapshot(app,true),hybrid:app.w.__hybridMap?.info?.(),
    heldSettleCallbacks:pending.size,actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').getAttribute('src'),
    method:'Native Safari screenshot to be captured externally; preserve terminal zoom state by holding the identified raster callback only before the final input; variable timer delays supported; no canvas rerasterization',errors});
  status.textContent=`画質確認 ${variant} ${language} ${floor} ${steps}段階 — 拡大中の状態を保持（停止描き直しを保留）`;
  if(params.get('auto')==='1'){await fetch('/wait-capture?name='+prefix);await stopQuality();}
}
async function stopQuality() {
  if(!qualityContext)throw Error('Open a quality scenario first');
  const {app,set,clear,pending,prefix,initial,variant,language,floor,steps}=qualityContext;
  app.w.__hybridMap?.hold(false);
  app.w.setTimeout=set;app.w.clearTimeout=clear;
  for(const[id,{callback,args}]of pending){clear(id);set(callback,140,...args);}pending.clear();
  await sleep(1000);await raf();await raf();
  await post(prefix+'-stopped',{environment:environment(),variant,language,floor,steps,phase:'stopped',initial,state:snapshot(app,true),hybrid:app.w.__hybridMap?.info?.(),
    actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').getAttribute('src'),errors});
  status.textContent=`画質確認 ${variant} ${language} ${floor} ${steps}段階 — 停止後の実寸描画が完了`;
}

async function fineInput(){
 const data={environment:environment(),trials:[],errors,method:'Separate fine pinch diagnostic, 40 steps of 0.5 percent through public touch handlers; no main FPS inference'};
 for(const language of ['ja','en'])for(const variant of ['version31',candidate]){
  const app=await load(variant,language,'1F');await prepareControlled(app);await warm(app);
  const rect=app.viewer.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
  const points=span=>[{identifier:1,clientX:cx-span/2,clientY:cy,pageX:cx-span/2,pageY:cy},{identifier:2,clientX:cx+span/2,clientY:cy,pageX:cx+span/2,pageY:cy}];
  const send=(type,touches,changed=touches)=>{const e=new app.w.Event(type,{bubbles:true,cancelable:true});Object.defineProperties(e,{touches:{value:touches},changedTouches:{value:changed}});app.viewer.dispatchEvent(e)};
  const trace=[],start=snapshot(app);send('touchstart',points(100));
  for(let i=1;i<=40;i++){send('touchmove',points(100*1.005**i));await new Promise(app.w.requestAnimationFrame.bind(app.w));trace.push({...snapshot(app),at:performance.now()});}
  send('touchend',[],points(100*1.005**40));await sleep(350);
  data.trials.push({language,variant,start,trace,stopped:snapshot(app)});
 }
 await post('fine-'+candidate,data);status.textContent='Fine pinch diagnostic complete';
}
async function hybridWarm(){
 const data={environment:environment(),trials:[],errors};
 for(const c of cases){const app=await load('hybrid',c.language,c.floor);await prepareControlled(app);await warm(app);const result=await measure(app);await waitFor(()=>{const i=app.w.__hybridMap.info();return i.desired>0&&i.missing===0&&i.active===0},'hybrid warm tiles');data.trials.push({...c,result,hybrid:app.w.__hybridMap.info()});await post('hybrid-warm-progress',data);}
 await post('hybrid-warm',data);status.textContent='Hybrid assets warm complete';
}

async function transition(){
 const marker=document.createElement('div');marker.style.cssText='position:fixed;left:1250px;top:12px;width:16px;height:16px;background:#888;z-index:99999';marker.setAttribute('aria-label','録画区間識別');document.body.append(marker);
 await post('hybrid-transition-startup',{environment:environment()});status.textContent='Safari / Canvas→SVG切替録画 — 準備OK（5秒後に開始）';await sleep(5000);
 const data={environment:environment(),segments:[],errors,videoMarker:{nativeRoi:[1254,92,8,8],colors:{ja:[34,204,136],en:[51,102,255]}},note:'Separate recorded hybrid transition diagnostic; excluded from primary FPS; visible color marker identifies operation segments without wall-clock alignment'};
 for(const language of ['ja','en']){
  const app=await load('hybrid',language,'1F');await prepareControlled(app,6000);await centerCamera(app,true,[.667799,.571125]);await sleep(350);
  for(const delta of [-1,1])for(let i=0;i<4;i++){wheel(app,delta);await raf();}
  await sleep(350);await centerCamera(app,true,[.667799,.571125]);await sleep(350);
  await waitFor(()=>{const i=app.w.__hybridMap.info();return i.desired>0&&i.missing===0&&i.active===0},'transition warm pixels');
  status.textContent=`Safari / hybrid / ${language} 1F — Canvas→SVG 切替確認開始`;
  marker.style.backgroundColor=language==='ja'?'#22cc88':'#3366ff';await raf();await raf();
  const segment={language,startedAt:new Date().toISOString(),trace:[],stops:[]};
  for(let cycle=0;cycle<4;cycle++)for(const[phase,delta]of [['in',-1],['out',1]]){
   status.textContent=`Safari / hybrid / ${language} / ${cycle+1} ${phase} — 操作中Canvas`;
   for(let i=0;i<4;i++){wheel(app,delta);await raf();segment.trace.push({cycle,phase,at:new Date().toISOString(),...snapshot(app)});}
   await sleep(350);const stop={cycle,phase,at:new Date().toISOString(),...snapshot(app)};segment.stops.push(stop);
   if(!stop.hybrid.svgVisible||stop.hybrid.canvasVisible)throw Error('SVG did not return after stopping');
   status.textContent=`Safari / hybrid / ${language} — 停止後SVGへ復帰`;
  }
  segment.endedAt=new Date().toISOString();data.segments.push(segment);marker.style.backgroundColor='#888';await raf();await raf();await post('hybrid-transition-progress',data);
 }
 await post('hybrid-transition',data);status.textContent='Safari / 日英Canvas→SVG 切替確認完了';
}

// Separate instrumented DOM/input checks; excluded from main FPS.
async function checks(){
 const data={candidate,environment:environment(),trials:[],errors,method:'Native Safari; diagnostic-only own-element counters; 20 pan frames, then 8 bursts of 2 accepted wheel events; style observation is not presentation latency'};
 for(const language of ['ja','en'])for(const variant of ['version31',candidate]){
  const app=await load(variant,language,'1F');await prepareControlled(app);await warm(app);
  let writes=0,labelReads=0,rectReads=0,widthReads=0,heightReads=0;
  const statusNode=app.d.querySelector('#status'),text=Object.getOwnPropertyDescriptor(app.w.Node.prototype,'textContent');
  if(statusNode)Object.defineProperty(statusNode,'textContent',{configurable:true,get(){return text.get.call(this)},set(v){writes++;return text.set.call(this,v)}});
  const rect=app.viewer.getBoundingClientRect.bind(app.viewer);app.viewer.getBoundingClientRect=()=>{rectReads++;return rect()};
  const w=Object.getOwnPropertyDescriptor(app.w.Element.prototype,'clientWidth'),h=Object.getOwnPropertyDescriptor(app.w.Element.prototype,'clientHeight');
  Object.defineProperty(app.viewer,'clientWidth',{configurable:true,get(){widthReads++;return w.get.call(this)}});
  Object.defineProperty(app.viewer,'clientHeight',{configurable:true,get(){heightReads++;return h.get.call(this)}});
  const pins=[...app.d.querySelectorAll('.food-pin')];for(const pin of pins){const get=pin.getAttribute.bind(pin);pin.getAttribute=name=>{if(name==='aria-label')labelReads++;return get(name)};}
  const r=rect(),cx=r.left+r.width/2,cy=r.top+r.height/2;
  app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:cx,clientY:cy,button:0,bubbles:true}));await raf();writes=0;labelReads=0;
  for(let i=0;i<20;i++){app.w.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:cx+i*2,clientY:cy-i,buttons:1,bubbles:true}));await raf();}
  app.w.dispatchEvent(new app.w.MouseEvent('mouseup',{bubbles:true}));await sleep(250);const panStatusWrites=statusNode?writes:null,panLabelReads=labelReads;
  const bursts=[];
  for(let i=0;i<8;i++){
   const before=snapshot(app),delta=i<4?-1:1;rectReads=widthReads=heightReads=0;
   const expectedWidth=before.logicalWidth*(delta<0?1.1**2:1/1.1**2);let observedAt=null;
   const observer=new app.w.MutationObserver(()=>{if(observedAt===null&&Math.abs(snapshot(app).logicalWidth-expectedWidth)<.01)observedAt=performance.now();});observer.observe(app.layer,{attributes:true,attributeFilter:['style']});
   const start=performance.now();
   for(let j=0;j<2;j++)app.viewer.dispatchEvent(new app.w.WheelEvent('wheel',{deltaY:delta,clientX:cx,clientY:cy,bubbles:true,cancelable:true}));
   const synchronousReads={rect:rectReads,width:widthReads,height:heightReads};
   await raf();await raf();const after=snapshot(app);observer.disconnect();
   bursts.push({before,after,synchronousReads,inputToObservedStyleMs:observedAt===null?null:observedAt-start,expectedWidth});
  }
  data.trials.push({language,variant,statusNodePresent:Boolean(statusNode),panStatusWrites,panLabelReads,pinCount:pins.length,bursts,hybrid:app.w.__hybridMap?.info(),environment:environment()});
 }
 await post('checks-'+candidate,data);status.textContent='Separate input / DOM checks complete';
}

// Separate instrumented functional diagnostics, never installed in main FPS trials.
async function deadlineDiagnostic(app) {
  const set=app.w.setTimeout.bind(app.w),clear=app.w.clearTimeout.bind(app.w),events=[],inputs=[],samples=[];
  const clock=()=>app.w.performance.now();let lastInput=null,phase='prepare',recording=true,monitor,previous=0;
  const rasterCallback=fn=>typeof fn==='function'&&fn.toString().includes('zoomRasterTimer')&&fn.toString().includes('renderedZoom');
  for(const type of ['wheel','touchstart','touchmove','touchend'])app.viewer.addEventListener(type,()=>{
    lastInput=clock();inputs.push({at:lastInput,phase,type});
  },{capture:true});
  app.w.setTimeout=(callback,delay,...args)=>{
    if(!rasterCallback(callback))return set(callback,delay,...args);
    const armed=clock();let id;
    id=set(()=>{
      const before=app.layer.style.width,at=clock(),sinceInput=lastInput===null?null:at-lastInput;
      callback(...args);
      events.push({id,armed,delay,at,phase,sinceInput,before,after:app.layer.style.width,changed:before!==app.layer.style.width});
    },delay);return id;
  };
  function tick(t){if(previous)samples.push({phase,dt:t-previous,visibility:document.visibilityState,...snapshot(app)});previous=t;if(recording)monitor=requestAnimationFrame(tick);}
  monitor=requestAnimationFrame(tick);
  for(let cycle=0;cycle<3;cycle++)for(const[part,delta]of [['in',-1],['out',1]]){
    phase=`${part}-${cycle}`;
    await new Promise(resolve=>{let i=0;const send=()=>{wheel(app,delta);i++;if(i===24){clearInterval(timer);resolve();}};const timer=setInterval(send,50);send();});
    phase='settle';await sleep(400);
  }
  phase='final';await sleep(400);recording=false;cancelAnimationFrame(monitor);app.w.setTimeout=set;app.w.clearTimeout=clear;
  const active=samples.filter(x=>x.phase.startsWith('in-')||x.phase.startsWith('out-'));
  return {events,inputs,samples,active:stats(active.map(x=>x.dt)),matchedCallbacks:events.length,actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').getAttribute('src')};
}
async function diagnostic(){
  const data={environment:environment(),method:'independent nominal 50ms wheel input; capture listener timestamps actual handler arrival; external timeout wrapper identifies commit function; separate from uninstrumented main FPS',trials:[],errors};
  for(const language of ['ja','en'])for(const variant of ['baseline',candidate,candidate,'baseline']){
    status.textContent=`停止期限診断 ${data.trials.length+1}/8 ${language} ${variant}`;
    const app=await load(variant,language,'1F');if(controlled)await prepareControlled(app);await warm(app);
    data.trials.push({variant,language,...await deadlineDiagnostic(app),environment:environment()});await post('deadline-progress',data);
  }
  await post('deadline',data);status.textContent='停止期限診断完了 — 8試行を保存';
}
async function video(){
  status.textContent='Safari / 録画用 — 準備OK（8秒後に開始）';await post('video-startup',environment());await sleep(8000);
  const data={environment:environment(),note:'Separate recorded demonstration, excluded from primary FPS',trials:[]};
  for(const language of ['ja','en'])for(const variant of ['baseline',candidate]){
    status.textContent=`Safari / ${variant==='baseline'?'改善なしDev':'Version3.1（3項目適用）'} / ${language} 1F — 準備中`;
    const app=await load(variant,language,'1F');if(controlled)await prepareControlled(app);await warm(app);
    status.textContent=`Safari / ${variant==='baseline'?'改善なしDev':'Version3.1（3項目適用）'} / ${language} 1F — 動作開始`;
    const startedAt=new Date().toISOString(),result=await measure(app);data.trials.push({language,variant,startedAt,endedAt:new Date().toISOString(),...result});
    status.textContent=`Safari / ${variant==='baseline'?'Dev':variant} / ${language} — 完了（録画中のズーム ${result.zoom.fps.toFixed(2)} FPS）`;await sleep(1200);
  }
  await post('video-demonstration',data);status.textContent='Safari / 日英Dev・Version3.1 — 全比較完了';
}
async function run(task){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){status.textContent=String(e.name+': '+e.message+'\n'+e.stack);await post('failure',{error:String(e.name+': '+e.message+'\n'+e.stack),environment:environment(),errors});}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
document.querySelector('#perf').onclick=()=>run(perf);
document.querySelector('#stop').onclick=()=>run(stopQuality);
const action=new URL(location).searchParams.get('run');
if(action==='health')run(async()=>{await load('version31');const a=[];let prev=await raf();for(let i=0;i<180;i++){const t=await raf();a.push(t-prev);prev=t;}await post('frame-health',{environment:environment(),frames:stats(a)});status.textContent='Frame health complete';});else if(action==='transition')run(transition);else if(action==='fine')run(fineInput);else if(action==='hybrid-warm')run(hybridWarm);else if(action==='checks')run(checks);else if(action==='diagnostic')run(diagnostic);else if(action==='perf')run(perf);else if(action==='quality')run(quality);else if(action==='video')run(video);else await load('baseline');
