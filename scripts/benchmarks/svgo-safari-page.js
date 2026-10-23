// Runs inside real Safari. No WebDriver/WebKit emulator and no changes to the app's zoom code.
const metadata = await fetch('/metadata').then(r => r.json());
// The original SVGO experiment keeps its defaults; other isolated SVG experiments
// can reuse exactly the same load/warm/wheel/measure functions and timings.
const candidate = metadata.candidateVariant ?? 'svgo';
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
async function measure(app) {
  const samples = { zoomIn: [], zoomOut: [], pan: [], settle: [] }, visibility = [], layerWidths = [];
  // Three identical 24-step zoom-in / zoom-out cycles; 1.1^24 = 9.85, no max-zoom plateau.
  for (let cycle=0;cycle<3;cycle++) {
    for (const [phase,delta] of [['zoomIn',-1],['zoomOut',1]]) {
      let previous = await raf();
      for (let i=0;i<24;i++) {
        wheel(app,delta);
        const now = await raf(); samples[phase].push(now-previous); previous=now;
        layerWidths.push(app.layer.style.width); visibility.push(document.visibilityState);
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
    image: app.d.querySelector('.floor-svg').getAttribute('src'), viewport:[app.viewer.clientWidth,app.viewer.clientHeight] };
}
async function perf() {
  await waitFor(() => document.visibilityState === 'visible', 'Safari foreground');
  const data = { environment: environment(), method: 'actual Safari, production build, synthetic wheel/mouse input through unmodified app handlers; parent rAF intervals; warmup per trial; 3 x 24 in/out steps; settles recorded separately; paired ABBA/BAAB order', trials: [], errors };
  for (const c of cases) {
    const sequence=['baseline',candidate,candidate,'baseline',candidate,'baseline','baseline',candidate];
    for (const [index,variant] of sequence.entries()) {
      status.textContent=`FPS計測 ${c.language} ${c.floor} ${index+1}/8 — ${variant} （Safariを前面に維持）`;
      const app=await load(variant,c.language,c.floor); await warm(app);
      const result=await measure(app);
      data.trials.push({ ...c, variant, index, ...result, environment: environment() });
      await post('performance-progress',data);
    }
  }
  await post('performance',data); status.textContent=`FPS計測完了 — ${data.trials.length}試行の生データを保存しました`;
  return data;
}
function canvas(width,height) { const c=document.createElement('canvas'); c.width=width;c.height=height; return c; }
async function image(url) { const i=new Image();i.src=url;await i.decode();return i; }
async function visual() {
  const data={environment:environment(),method:metadata.visualMethod ?? 'actual Safari canvas SVG rasterization; white background; full-sheet 1x, full-sheet 4x, 10x 1600x1100 crop centred at 70% x / 45% y (room area rather than blank sheet centre); all source and viewer-derived floors',views,comparisons:[]};
  frame.src='about:blank';
  for(const item of metadata.images) {
    const before=await image(`/baseline/${item.file}`), after=await image(`/${candidate}/${item.file}`);
    const text=await fetch(`/baseline/${item.file}`).then(r=>r.text());
    const vb=text.match(/viewBox=["']([^"']+)/)[1].trim().split(/[ ,]+/).map(Number);
    for(const view of views) {
      const { scale, id } = view, center = view.center ?? [.5,.5];
      status.textContent=`見た目の比較 ${item.language} ${item.floor} ${id}`;
      const width=view.width ?? Math.round(vb[2]*scale), height=view.height ?? Math.round(vb[3]*scale);
      const a=canvas(width,height),b=canvas(width,height),diff=canvas(width,height);
      for(const [c,i]of[[a,before],[b,after]]){const ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.drawImage(i,width/2-vb[2]*scale*center[0],height/2-vb[3]*scale*center[1],vb[2]*scale,vb[3]*scale);}
      const ad=a.getContext('2d').getImageData(0,0,width,height).data,bd=b.getContext('2d').getImageData(0,0,width,height).data;
      const dd=diff.getContext('2d').createImageData(width,height);let changed=0,over8=0,over32=0,total=0,max=0,minX=width,minY=height,maxX=0,maxY=0;
      for(let p=0;p<ad.length;p+=4){let delta=0;for(let k=0;k<3;k++){const d=Math.abs(ad[p+k]-bd[p+k]);delta=Math.max(delta,d);total+=d;}if(delta){changed++;max=Math.max(max,delta);}if(delta>8)over8++;if(delta>32){over32++;const n=p/4,x=n%width,y=Math.floor(n/width);minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);}dd.data[p]=delta?255:255;dd.data[p+1]=delta?Math.max(0,255-delta*4):255;dd.data[p+2]=dd.data[p+1];dd.data[p+3]=255;}
      diff.getContext('2d').putImageData(dd,0,0);
      const entry={language:item.language,floor:item.floor,view:id,scale,width,height,changedPixels:changed,totalPixels:width*height,changedPercent:changed/(width*height)*100,over8,over32,maxChannelDelta:max,meanChannelDelta:total/(width*height*3),boundsOver32:over32?[minX,minY,maxX,maxY]:null};
      data.comparisons.push(entry);
      if(scale===1 || scale===10 || metadata.saveAllVisuals || over32/(width*height)>.001){const name=`visual-${item.language}-${item.floor}-${id}`;await savePng(`${name}-before`,a);await savePng(`${name}-after`,b);await savePng(`${name}-diff`,diff);}
      a.width=b.width=diff.width=1;
      await post('visual-progress',data);await sleep(40);
    }
  }
  await post('visual',data); status.textContent=`見た目の比較完了 — 全${metadata.images.length}画像×${views.length}条件の画素差と画像を保存しました`;return data;
}
async function run(task){document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await task();}catch(e){status.textContent=String(e.stack??e);await post('failure',{error:String(e.stack??e),environment:environment(),errors});}finally{document.querySelectorAll('button').forEach(b=>b.disabled=false);}}
document.querySelector('#perf').onclick=()=>run(perf);
document.querySelector('#visual').onclick=()=>run(visual);
const action=new URL(location).searchParams.get('run');
if(action==='perf')run(perf);else if(action==='visual')run(visual);else await load('baseline');
