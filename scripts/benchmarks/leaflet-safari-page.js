// Runs inside real Safari. No WebDriver/WebKit emulator and no changes to the app's zoom code.
const metadata = await fetch('/metadata').then(r => r.json());
// The original SVGO experiment keeps its defaults; other isolated SVG experiments
// can reuse exactly the same load/warm/wheel/measure functions and timings.
const candidate = metadata.candidateVariant ?? 'svgo';
const cases = metadata.cases ?? [{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}];
const views = [{id:'fit',steps:0},{id:'3x',steps:12},{id:'10x',steps:24}];
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
  // The origin is isolated for this experiment. Manual language checks must not
  // leak their saved preference into a later Japanese trial.
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
    await waitFor(() => d.querySelector('.floor-svg')?.complete && (d.querySelector('.floor-svg')?.dataset.originalSvgUrl ?? d.querySelector('.floor-svg')?.getAttribute('src'))?.includes(floor.replace('A-6-9F', '6F7F8F9F_BldgA')), 'floor image');
  }
  await sleep(1200);
  await waitFor(() => d.querySelector('.floor-svg')?.complete && d.querySelector('.floor-svg').naturalWidth > 0, 'decoded image');
  if (w.__leafletBenchmark) await waitFor(() => w.__leafletBenchmark.info().ready, 'initial tiles');
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
async function measure(app) {
  const samples = { zoomIn: [], zoomOut: [], pan: [], settle: [] }, visibility = [], layerWidths = [], tileFrames = [];
  const tilesBefore = app.w.__leafletBenchmark?.info();
  const serverBefore = await fetch('/tile-stats').then(r=>r.json());
  // Three identical 24-step zoom-in / zoom-out cycles; 1.1^24 = 9.85, no max-zoom plateau.
  for (let cycle=0;cycle<3;cycle++) {
    for (const [phase,delta] of [['zoomIn',-1],['zoomOut',1]]) {
      let previous = await raf();
      for (let i=0;i<24;i++) {
        wheel(app,delta);
        const now = await raf(); samples[phase].push(now-previous); previous=now;
        layerWidths.push(app.layer.style.width); visibility.push(document.visibilityState);
        if (app.w.__leafletBenchmark) tileFrames.push(app.w.__leafletBenchmark.info());
      }
      // Include pending rasterization and the 140ms settle timer separately.
      for (let i=0;i<18;i++) { const now=await raf(); samples.settle.push(now-previous); previous=now; }
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
    pan: stats(samples.pan), settle: stats(samples.settle), raw: samples,
    hiddenFrames: visibility.filter(v=>v!=='visible').length, distinctRasterWidths: new Set(layerWidths).size,
    tilesBefore, tilesAfter: app.w.__leafletBenchmark?.info(), tileFrames,
    serverBefore, serverAfter: await fetch('/tile-stats').then(r=>r.json()),
    actualLanguage:app.d.documentElement.lang,
    image: app.d.querySelector('.floor-svg').dataset.originalSvgUrl ?? app.d.querySelector('.floor-svg').getAttribute('src'), viewport:[app.viewer.clientWidth,app.viewer.clientHeight] };
}
async function perf() {
  await waitFor(() => document.visibilityState === 'visible', 'Safari foreground');
  const data = { environment: environment(), method: 'actual Safari, production build, synthetic wheel/mouse input through unmodified app handlers; parent rAF intervals; warmup per trial; 3 x 24 in/out steps; settles recorded separately; paired ABBA/BAAB order', trials: [], errors };
  const smoke=new URL(location).searchParams.has('smoke'), prefix=smoke?'performance-smoke':'performance';
  for (const c of (smoke?cases.slice(0,1):cases)) {
    status.textContent=`タイル生成の事前準備 ${c.language} ${c.floor}`;
    const preload=await load(candidate,c.language,c.floor); await warm(preload); await measure(preload);
    await sleep(1000);
    const sequence=smoke?['baseline',candidate]:['baseline',candidate,candidate,'baseline',candidate,'baseline','baseline',candidate];
    for (const [index,variant] of sequence.entries()) {
      status.textContent=`FPS計測 ${c.language} ${c.floor} ${index+1}/8 — ${variant} （Safariを前面に維持）`;
      const app=await load(variant,c.language,c.floor); await warm(app);
      const result=await measure(app);
      data.trials.push({ ...c, variant, index, ...result, environment: environment() });
      await post(prefix+'-progress',data);
    }
  }
  await post(prefix,data); status.textContent=`FPS計測完了 — ${data.trials.length}試行の生データを保存しました`;
  return data;
}
function canvas(width,height) { const c=document.createElement('canvas'); c.width=width;c.height=height; return c; }
async function settled(app) {
  await sleep(800);
  if (app.w.__leafletBenchmark) await waitFor(() => app.w.__leafletBenchmark.info().ready, 'settled tiles');
  await sleep(200);
}
function capture(app) {
  const viewer=app.viewer, c=canvas(viewer.clientWidth,viewer.clientHeight), ctx=c.getContext('2d');
  ctx.fillStyle=app.w.getComputedStyle(viewer).backgroundColor;ctx.fillRect(0,0,c.width,c.height);
  if(app.w.__leafletBenchmark) app.w.__leafletBenchmark.draw(c,viewer);
  else {
    const img=app.d.querySelector('.floor-svg'), a=img.getBoundingClientRect(), b=viewer.getBoundingClientRect();
    ctx.drawImage(img,a.left-b.left,a.top-b.top,a.width,a.height);
  }
  return c;
}
function compare(a,b) {
  const ad=a.getContext('2d').getImageData(0,0,a.width,a.height).data,bd=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
  const diff=canvas(a.width,a.height),ctx=diff.getContext('2d'),dd=ctx.createImageData(a.width,a.height);
  let changed=0,over8=0,over32=0,total=0,max=0;
  for(let p=0;p<ad.length;p+=4){let delta=0;for(let k=0;k<3;k++){const d=Math.abs(ad[p+k]-bd[p+k]);delta=Math.max(delta,d);total+=d;}
    if(delta)changed++;if(delta>8)over8++;if(delta>32)over32++;max=Math.max(max,delta);
    dd.data[p]=255;dd.data[p+1]=dd.data[p+2]=Math.max(0,255-delta*4);dd.data[p+3]=255;
  }ctx.putImageData(dd,0,0);
  return {diff,metrics:{width:a.width,height:a.height,totalPixels:a.width*a.height,changedPixels:changed,changedPercent:changed/(a.width*a.height)*100,over8,over32,maxChannelDelta:max,meanChannelDelta:total/(a.width*a.height*3)}};
}
async function visual() {
  const data={environment:environment(),method:'Actual Safari iframe; same wheel steps and viewport; base-map-only captures from actual SVG img rect or Leaflet loaded tile rects; original UI overlays excluded from pixel diff',views,comparisons:[],errors};
  for(const c of cases) for(const view of views){
    const captures=[],diagnostics=[];
    for(const variant of ['baseline',candidate]){
      status.textContent=`表示比較 ${c.language} ${c.floor} ${view.id} ${variant}`;
      const app=await load(variant,c.language,c.floor);
      for(let i=0;i<view.steps;i++){wheel(app,-1);await raf();}await settled(app);
      captures.push(capture(app));diagnostics.push({variant,tiles:app.w.__leafletBenchmark?.info(),snapshot:app.w.__leafletBenchmark?.snapshot,
        layerWidth:app.layer.style.width,layerTransform:app.layer.style.transform,status:app.d.querySelector('#status')?.textContent});
    }
    const result=compare(...captures), name=`visual-${c.language}-${c.floor}-${view.id}`;
    await savePng(`${name}-before`,captures[0]);await savePng(`${name}-after`,captures[1]);await savePng(`${name}-diff`,result.diff);
    data.comparisons.push({...c,view:view.id,steps:view.steps,...result.metrics,diagnostics});
    await post('visual-progress',data);
  }
  await post('visual',data);status.textContent=`表示比較完了 — ${data.comparisons.length}条件の画像と画素差を保存しました`;
}
async function inspect() {
  const params=new URL(location).searchParams,variant=params.get('variant')??candidate,language=params.get('language')??'ja',floor=params.get('floor')??'1F',steps=Number(params.get('steps')??0);
  const started=performance.now(),serverBefore=await fetch('/tile-stats').then(r=>r.json());
  const app=await load(variant,language,floor);
  if(params.get('blend')==='normal') { const style=app.d.createElement('style');style.textContent='.leaflet-container img.leaflet-tile{mix-blend-mode:normal}';app.d.head.append(style); }
  for(let i=0;i<steps;i++){wheel(app,-1);await raf();}await settled(app);
  if(params.get('hash')) { app.w.location.hash=params.get('hash'); await sleep(2000); await settled(app); }
  const result={environment:environment(),variant,language,floor,steps,elapsedMs:performance.now()-started,tiles:app.w.__leafletBenchmark?.info(),snapshot:app.w.__leafletBenchmark?.snapshot,
    serverBefore,serverAfter:await fetch('/tile-stats').then(r=>r.json()),errors,
    tileGeometry:[...app.d.querySelectorAll('.leaflet-tile-loaded')].map(tile=>({src:tile.src,width:app.w.getComputedStyle(tile).width,height:app.w.getComputedStyle(tile).height,margin:app.w.getComputedStyle(tile).margin,rect:tile.getBoundingClientRect().toJSON()}))};
  await post(`inspect-${variant}-${language}-${floor}-${steps}`,result);
  status.textContent=`表示確認 ${variant} ${language} ${floor} ${steps} steps — タイル ${result.tiles?.loadedTiles??0}、エラー ${errors.length}`;
}
async function run(task){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){status.textContent=String(e.stack??e);await post('failure',{error:String(e.stack??e),environment:environment(),errors});}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
document.querySelector('#perf').onclick=()=>run(perf);
document.querySelector('#visual').onclick=()=>run(visual);
const action=new URL(location).searchParams.get('run');
if(action==='perf')run(perf);else if(action==='visual')run(visual);else if(action==='inspect')run(inspect);else await load('baseline');
