// Real Safari. Original 1/4 raster cadence and flush-based 140ms deadline remain unchanged.
const metadata = await fetch('/metadata').then(r => r.json());
// The original SVGO experiment keeps its defaults; other isolated SVG experiments
// can reuse exactly the same load/warm/wheel/measure functions and timings.
const candidate = 'svg-cull';
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
  const loadStarted=performance.now();
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
    await waitFor(() => d.querySelector('.floor-svg')?.complete && (d.querySelector('.floor-svg')?.dataset.originalSvgUrl??d.querySelector('.floor-svg')?.getAttribute('src'))?.includes(floor.replace('A-6-9F', '6F7F8F9F_BldgA')), 'floor image');
  }
  if(variant!=='baseline')await waitFor(()=>w.__svgViewportBenchmark?.info().ready,'inline SVG ready');
  const navigationToReadyMs=performance.now()-loadStarted;
  await sleep(1200);
  await waitFor(() => d.querySelector('.floor-svg')?.complete && d.querySelector('.floor-svg').naturalWidth > 0, 'decoded image');
  return { w, d, viewer: d.querySelector('#viewer'), layer: d.querySelector('#canvas-layer'),loadStats:{navigationToReadyMs} };
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
async function measure(app) {
  const samples = { zoomIn: [], zoomOut: [], pan: [], settle: [] }, visibility = [], layerWidths = [], zoomPhases=[], settlePhases=[];
  // Three identical 24-step zoom-in / zoom-out cycles; 1.1^24 = 9.85, no max-zoom plateau.
  for (let cycle=0;cycle<3;cycle++) {
    for (const [phase,delta] of [['zoomIn',-1],['zoomOut',1]]) {
      let previous = await raf();
      const phaseStart=snapshot(app), trace=[], settleTrace=[]; let lastInput=0;
      for (let i=0;i<24;i++) {
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
    loadStats:app.loadStats,actualLanguage:app.d.documentElement.lang, image: app.d.querySelector('.floor-svg').dataset.originalSvgUrl??app.d.querySelector('.floor-svg').getAttribute('src'), viewport:[app.viewer.clientWidth,app.viewer.clientHeight] };
}
async function perf() {
  await waitFor(() => document.visibilityState === 'visible', 'Safari foreground');
  const data = { environment: environment(), method: 'actual Safari, production build, synthetic wheel/mouse input through unmodified app handlers; parent rAF intervals; warmup per trial; 3 x 24 in/out steps; settles recorded separately; three conditions, four repetitions, mirrored balanced orders', trials: [], errors };
  const smoke=new URL(location).searchParams.has('smoke'), prefix=smoke?'performance-smoke':'performance';
  for (const c of (smoke?cases.slice(0,1):cases)) {
    const first=['baseline','inline-all','svg-cull'],second=['inline-all','svg-cull','baseline'];
    const sequence=smoke?first:[...first,...first.toReversed(),...second,...second.toReversed()];
    for (const [index,variant] of sequence.entries()) {
      status.textContent=`FPS計測 ${c.language} ${c.floor} ${index+1}/${sequence.length} — ${variant} （Safariを前面に維持）`;
      const app=await load(variant,c.language,c.floor); await warm(app);
      const result=await measure(app);
      data.trials.push({ ...c, variant, index, ...result, environment: environment() });
      await post(prefix+'-progress',data);
    }
  }
  await post(prefix,data); status.textContent=`FPS計測完了 — ${data.trials.length}試行の生データを保存しました`;
  return data;
}
function snapshot(app,geometry=false) {
  const {width,height,transform}=app.layer.style, match=transform.match(/scale\(([^)]+)\)/);
  const scale=match?Number(match[1]):1;
  return {width,height,transform,scale,vector:app.w.__svgViewportBenchmark?.info()??null,logicalWidth:parseFloat(width)*scale,logicalHeight:parseFloat(height)*scale,
    ...(geometry?{viewerRect:app.viewer.getBoundingClientRect().toJSON(),imageRect:app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON(),frameRect:frame.getBoundingClientRect().toJSON()}: {})};
}
let qualityContext;
async function quality() {
  // Keep the same half-pixel origin as the 1025px FPS window, independent of outer resize.
  frame.style.marginLeft = "32.5px"; frame.style.marginRight = "0";
  const params=new URL(location).searchParams,variant=params.get('variant')??candidate,language=params.get('language')??'ja',floor=params.get('floor')??'1F',steps=Number(params.get('steps')??23);
  const app=await load(variant,language,floor),initial=snapshot(app,true);
  const set=app.w.setTimeout.bind(app.w),clear=app.w.clearTimeout.bind(app.w),pending=new Map();
  // Quality screenshots only: hold the identified raster-settle callback so native capture
  // does not replace the in-zoom compositor state with a sharp stopped frame.
  // Performance runs never install this hook. No canvas SVG rerender is used.
  const hold=()=>{ app.w.setTimeout=(callback,delay,...args)=>{
    if(typeof callback==='function' && callback.toString().includes('zoomRasterTimer') && callback.toString().includes('renderedZoom')){const id=set(()=>{},2147483647);pending.set(id,{callback,args});return id;}
    return set(callback,delay,...args);
  };
  app.w.clearTimeout=id=>{pending.delete(id);clear(id);}; };
  for(let i=0;i<steps;i++){if(i===steps-1)hold();wheel(app,-1);await raf();}await raf();
  const pan=params.has('pan');
  if(pan){
    const r=app.viewer.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;
    app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:x,clientY:y,button:0,bubbles:true}));
    for(const dx of [-2500,1800,-1000]){app.w.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:x+dx,clientY:y-100,buttons:1,bubbles:true}));await raf();await raf();}
    app.w.dispatchEvent(new app.w.MouseEvent('mouseup',{bubbles:true}));await raf();
  }
  const prefix=`quality-${variant}-${language}-${floor}-${steps}${pan?'-pan':''}`;
  qualityContext={app,set,clear,pending,prefix,variant,language,floor,steps,initial};
  await post(prefix+'-moving',{environment:environment(),variant,language,floor,steps,phase:'moving-state-held',initial,state:snapshot(app,true),
    heldSettleCallbacks:pending.size,actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').dataset.originalSvgUrl??app.d.querySelector('.floor-svg').getAttribute('src'),
    method:'Native Safari screenshot to be captured externally; preserve terminal zoom state by holding the identified raster callback only before the final input; variable timer delays supported; no canvas rerasterization',errors});
  status.textContent=`画質確認 ${variant} ${language} ${floor} ${steps}段階 — 拡大中の状態を保持（停止描き直しを保留）`;
}
async function stopQuality() {
  if(!qualityContext)throw Error('Open a quality scenario first');
  const {app,set,clear,pending,prefix,initial,variant,language,floor,steps}=qualityContext;
  app.w.setTimeout=set;app.w.clearTimeout=clear;
  for(const[id,{callback,args}]of pending){clear(id);set(callback,140,...args);}pending.clear();
  await sleep(1000);await raf();await raf();
  await post(prefix+'-stopped',{environment:environment(),variant,language,floor,steps,phase:'stopped',initial,state:snapshot(app,true),
    actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').dataset.originalSvgUrl??app.d.querySelector('.floor-svg').getAttribute('src'),errors});
  status.textContent=`画質確認 ${variant} ${language} ${floor} ${steps}段階 — 停止後の実寸描画が完了`;
}

async function usability(){
 await waitFor(()=>document.visibilityState==='visible','Safari foreground');
 const p=new URL(location).searchParams,variant=p.get('variant')??'baseline',language=p.get('language')??'ja',query=p.get('query')??(language==='ja'?'AC130':'AS555');
 const app=await load(variant,language,'1F'),initial=snapshot(app,true),input=app.d.querySelector('#search-input');
 input.value=query;input.dispatchEvent(new app.w.Event('input',{bubbles:true}));
 await waitFor(()=>[...app.d.querySelectorAll('.search-result[role="option"]')].some(n=>n.textContent.includes(query)),'search suggestion');
 const result=[...app.d.querySelectorAll('.search-result[role="option"]')].find(n=>n.textContent.includes(query));const suggestion=result.textContent;result.click();
 await sleep(1200);await raf();await raf();
 const afterSearch=snapshot(app,true),highlight=app.d.querySelector('.search-highlight-area-outline, .search-highlight-pin');
 const data={variant,language,query,initial,afterSearch,suggestion,hash:app.w.location.hash,actualLanguage:app.d.documentElement.lang,highlight:highlight?.getBoundingClientRect().toJSON()??null,environment:environment(),errors};
 await post(`usage-${variant}-${language}-${query}`,data);status.textContent=`使い勝手 ${variant} ${language} ${query} — 検索移動完了`;
}
async function controls(){
 await waitFor(()=>document.visibilityState==='visible','Safari foreground');
 const p=new URL(location).searchParams,variant=p.get('variant')??'baseline',language=p.get('language')??'ja';
 const app=await load(variant,language,'1F'),states=[];
 const capture=label=>states.push({label,...snapshot(app,true),activeFloor:app.d.querySelector('.floor-tab.is-active')?.dataset.floor,pins:app.d.querySelectorAll('.food-pin:not([hidden])').length,language:app.d.documentElement.lang});
 capture('initial');
 for(const floor of ['5F','1F','5F','1F']){
  app.d.querySelector(`.floor-tab[data-floor="${floor}"]`).click();
  await waitFor(()=>app.d.querySelector('.floor-tab.is-active')?.dataset.floor===floor&& (app.d.querySelector('.floor-svg')?.dataset.originalSvgUrl??app.d.querySelector('.floor-svg')?.getAttribute('src'))?.includes(floor==='1F'?'food-map':floor),'floor swap');
  await sleep(450);await raf();capture('floor-'+floor);
 }
 app.d.querySelector('[data-facility-key="toilet"]').click();await raf();await raf();
 const facilityRings=app.d.querySelectorAll('.facility-ring').length;
 const pin=app.d.querySelector('.food-pin[data-food-place]');const selectedPlace=pin?.dataset.foodPlace;pin?.click();
 await waitFor(()=>app.d.querySelector('#food-panel-title')?.textContent,'food panel');await sleep(400);await raf();capture('food-panel');
 await post(`controls-${variant}-${language}`,{variant,language,states,facilityRings,selectedPlace,foodTitle:app.d.querySelector('#food-panel-title')?.textContent,environment:environment(),errors});
 status.textContent=`操作確認 ${variant} ${language} — フロア往復・施設・店舗詳細完了`;
}

async function inspect(){
 const app=await load('svg-cull','ja','5F');for(let i=0;i<23;i++){wheel(app,-1);await raf();}await sleep(1000);await raf();
 const svg=app.d.querySelector('.svg-vector-host').shadowRoot.querySelector('svg'),nodes=[];
 for(const [index,node]of [...svg.children].entries()){
  if(!node.getBBox)continue;
  const originalStyle=node.getAttribute('style'),hidden=node.style.display==='none';
  if(hidden)node.style.removeProperty('display');
  const b=node.getBBox(),r=node.getBoundingClientRect(),m=node.getCTM();
  nodes.push({index,hidden,tag:node.localName,box:{x:b.x,y:b.y,width:b.width,height:b.height},rect:r.toJSON(),ctm:m?{a:m.a,b:m.b,c:m.c,d:m.d,e:m.e,f:m.f}:null,html:node.outerHTML.slice(0,1800)});
  if(originalStyle===null)node.removeAttribute('style');else node.setAttribute('style',originalStyle);
 }
 await post('diagnostic-ja-5F-bounds',{state:snapshot(app,true),nodes,environment:environment(),errors});status.textContent='境界矩形の診断を保存';
}

async function run(task){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){status.textContent=String(e.stack??e);await post('failure',{error:String(e.stack??e),environment:environment(),errors});}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
document.querySelector('#perf').onclick=()=>run(perf);document.querySelector('#stop').onclick=()=>run(stopQuality);
const action=new URL(location).searchParams.get('run');if(action==='perf')run(perf);else if(action==='quality')run(quality);else if(action==='usage')run(usability);else if(action==='controls')run(controls);else if(action==='inspect')run(inspect);else await load('baseline');
