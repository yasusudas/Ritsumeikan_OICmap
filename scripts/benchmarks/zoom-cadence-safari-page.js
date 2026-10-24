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
function snapshot(app,geometry=false) {
  const {width,height,transform}=app.layer.style, match=transform.match(/scale\(([^)]+)\)/);
  const scale=match?Number(match[1]):1;
  return {width,height,transform,scale,logicalWidth:parseFloat(width)*scale,logicalHeight:parseFloat(height)*scale,
    ...(geometry?{viewerRect:app.viewer.getBoundingClientRect().toJSON(),imageRect:app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON(),frameRect:frame.getBoundingClientRect().toJSON()}: {})};
}


const oldPaths=[[{"x1": 180, "y1": 480, "x2": 200, "y2": 480, "dt_ms": 0}, {"x1": 175, "y1": 480, "x2": 205, "y2": 480, "dt_ms": 50}, {"x1": 170, "y1": 480, "x2": 210, "y2": 480, "dt_ms": 50}, {"x1": 165, "y1": 480, "x2": 215, "y2": 480, "dt_ms": 50}, {"x1": 160, "y1": 480, "x2": 220, "y2": 480, "dt_ms": 50}, {"x1": 155, "y1": 480, "x2": 225, "y2": 480, "dt_ms": 50}, {"x1": 150, "y1": 480, "x2": 230, "y2": 480, "dt_ms": 50}, {"x1": 145, "y1": 480, "x2": 235, "y2": 480, "dt_ms": 50}, {"x1": 140, "y1": 480, "x2": 240, "y2": 480, "dt_ms": 50}, {"x1": 135, "y1": 480, "x2": 245, "y2": 480, "dt_ms": 50}, {"x1": 130, "y1": 480, "x2": 250, "y2": 480, "dt_ms": 50}, {"x1": 125, "y1": 480, "x2": 255, "y2": 480, "dt_ms": 50}, {"x1": 120, "y1": 480, "x2": 260, "y2": 480, "dt_ms": 50}, {"x1": 115, "y1": 480, "x2": 265, "y2": 480, "dt_ms": 50}, {"x1": 110, "y1": 480, "x2": 270, "y2": 480, "dt_ms": 50}, {"x1": 105, "y1": 480, "x2": 275, "y2": 480, "dt_ms": 50}, {"x1": 100, "y1": 480, "x2": 280, "y2": 480, "dt_ms": 50}, {"x1": 95, "y1": 480, "x2": 285, "y2": 480, "dt_ms": 50}, {"x1": 90, "y1": 480, "x2": 290, "y2": 480, "dt_ms": 50}, {"x1": 85, "y1": 480, "x2": 295, "y2": 480, "dt_ms": 50}, {"x1": 80, "y1": 480, "x2": 300, "y2": 480, "dt_ms": 50}, {"x1": 75, "y1": 480, "x2": 305, "y2": 480, "dt_ms": 50}, {"x1": 70, "y1": 480, "x2": 310, "y2": 480, "dt_ms": 50}, {"x1": 65, "y1": 480, "x2": 315, "y2": 480, "dt_ms": 50}, {"x1": 60, "y1": 480, "x2": 320, "y2": 480, "dt_ms": 50}, {"x1": 55, "y1": 480, "x2": 325, "y2": 480, "dt_ms": 50}, {"x1": 50, "y1": 480, "x2": 330, "y2": 480, "dt_ms": 50}, {"x1": 45, "y1": 480, "x2": 335, "y2": 480, "dt_ms": 50}, {"x1": 40, "y1": 480, "x2": 340, "y2": 480, "dt_ms": 50}, {"x1": 40, "y1": 480, "x2": 340, "y2": 480, "dt_ms": 50}], [{"x1": 40, "y1": 600, "x2": 340, "y2": 600, "dt_ms": 0}, {"x1": 48, "y1": 600, "x2": 332, "y2": 600, "dt_ms": 50}, {"x1": 56, "y1": 600, "x2": 324, "y2": 600, "dt_ms": 50}, {"x1": 64, "y1": 600, "x2": 316, "y2": 600, "dt_ms": 50}, {"x1": 72, "y1": 600, "x2": 308, "y2": 600, "dt_ms": 50}, {"x1": 80, "y1": 600, "x2": 300, "y2": 600, "dt_ms": 50}, {"x1": 88, "y1": 600, "x2": 292, "y2": 600, "dt_ms": 50}, {"x1": 96, "y1": 600, "x2": 284, "y2": 600, "dt_ms": 50}, {"x1": 104, "y1": 600, "x2": 276, "y2": 600, "dt_ms": 50}, {"x1": 112, "y1": 600, "x2": 268, "y2": 600, "dt_ms": 50}, {"x1": 120, "y1": 600, "x2": 260, "y2": 600, "dt_ms": 50}, {"x1": 128, "y1": 600, "x2": 252, "y2": 600, "dt_ms": 50}, {"x1": 136, "y1": 600, "x2": 244, "y2": 600, "dt_ms": 50}, {"x1": 144, "y1": 600, "x2": 236, "y2": 600, "dt_ms": 50}, {"x1": 150, "y1": 600, "x2": 230, "y2": 600, "dt_ms": 50}, {"x1": 144, "y1": 600, "x2": 236, "y2": 600, "dt_ms": 50}, {"x1": 136, "y1": 600, "x2": 244, "y2": 600, "dt_ms": 50}, {"x1": 128, "y1": 600, "x2": 252, "y2": 600, "dt_ms": 50}, {"x1": 120, "y1": 600, "x2": 260, "y2": 600, "dt_ms": 50}, {"x1": 112, "y1": 600, "x2": 268, "y2": 600, "dt_ms": 50}, {"x1": 104, "y1": 600, "x2": 276, "y2": 600, "dt_ms": 50}, {"x1": 96, "y1": 600, "x2": 284, "y2": 600, "dt_ms": 50}, {"x1": 88, "y1": 600, "x2": 292, "y2": 600, "dt_ms": 50}, {"x1": 80, "y1": 600, "x2": 300, "y2": 600, "dt_ms": 50}, {"x1": 72, "y1": 600, "x2": 308, "y2": 600, "dt_ms": 50}, {"x1": 64, "y1": 600, "x2": 316, "y2": 600, "dt_ms": 50}, {"x1": 56, "y1": 600, "x2": 324, "y2": 600, "dt_ms": 50}, {"x1": 48, "y1": 600, "x2": 332, "y2": 600, "dt_ms": 50}, {"x1": 40, "y1": 600, "x2": 340, "y2": 600, "dt_ms": 50}, {"x1": 40, "y1": 600, "x2": 340, "y2": 600, "dt_ms": 50}], [{"x": 200, "y": 720, "dt_ms": 0}, {"x": 200, "y": 690, "dt_ms": 40}, {"x": 200, "y": 660, "dt_ms": 40}, {"x": 200, "y": 630, "dt_ms": 40}, {"x": 200, "y": 600, "dt_ms": 40}, {"x": 200, "y": 570, "dt_ms": 40}, {"x": 200, "y": 540, "dt_ms": 40}, {"x": 200, "y": 510, "dt_ms": 40}, {"x": 200, "y": 480, "dt_ms": 40}, {"x": 200, "y": 450, "dt_ms": 40}, {"x": 200, "y": 420, "dt_ms": 40}, {"x": 200, "y": 450, "dt_ms": 40}, {"x": 200, "y": 480, "dt_ms": 40}, {"x": 200, "y": 510, "dt_ms": 40}, {"x": 200, "y": 540, "dt_ms": 40}, {"x": 200, "y": 570, "dt_ms": 40}, {"x": 200, "y": 600, "dt_ms": 40}, {"x": 200, "y": 630, "dt_ms": 40}, {"x": 200, "y": 660, "dt_ms": 40}, {"x": 200, "y": 690, "dt_ms": 40}, {"x": 200, "y": 720, "dt_ms": 40}]];
function touch(app,type,points){
 const event=new app.w.Event(type,{bubbles:true,cancelable:true});
 Object.defineProperties(event,{touches:{value:points},targetTouches:{value:points},changedTouches:{value:points}});
 app.viewer.dispatchEvent(event);
}
async function timedPoints(points,send,delay){
 send(points[0],0);
 await new Promise(resolve=>{let i=1;const timer=setInterval(()=>{send(points[i],i);i++;if(i===points.length){clearInterval(timer);resolve();}},delay);});
}
async function measureCadence(app,mode){
 const probe=app.w.__zoomProbe;probe.events=[];probe.enabled=true;probe.active=false;
 const samples=[];let previous=0,previousWall=0,previousKey='',recording=true,phase='prepare',lastInput=0;let monitoring;
 function tick(stamp){
  const now=performance.now(),state=snapshot(app),key=state.width+'|'+state.transform;
  if(previous)samples.push({stamp,dt:stamp-previous,wallDt:now-previousWall,visibility:document.visibilityState,phase,changed:key!==previousKey,...state,afterInputMs:now-lastInput});
  previous=stamp;previousWall=now;previousKey=key;
  if(recording)monitoring=requestAnimationFrame(tick);
 }
 monitoring=requestAnimationFrame(tick);
 const inputs=[],phaseTimes=[];
 function begin(name){phase=name;probe.active=true;probe.context={phase,step:0};phaseTimes.push({phase,begin:performance.timeOrigin+performance.now()});}
 function sendInput(step,send){probe.context={phase,step};lastInput=performance.now();probe.emit('input-enter');send();probe.emit('input-exit');inputs.push({phase,step,at:performance.timeOrigin+lastInput});}
 async function finish(){phaseTimes.at(-1).end=performance.timeOrigin+performance.now();probe.active=false;probe.context={phase:'settle-'+phase,step:0};phase='settle';for(let i=0;i<18;i++)await raf();}
 if(mode.input==='wheel50'){
  for(let cycle=0;cycle<3;cycle++)for(const[part,delta]of[['in',-1],['out',1]]){
   begin(`${part}-${cycle}`);await timedPoints(Array.from({length:24},(_,i)=>i),(_,i)=>sendInput(i+1,()=>wheel(app,delta)),50);await finish();
  }
 }else{
  const rect=app.viewer.getBoundingClientRect(),cx=rect.left+rect.width*.52,cy=rect.top+rect.height*.53;
  for(let pathIndex=0;pathIndex<3;pathIndex++){
   const points=oldPaths[pathIndex];begin(['old-pinch-in','old-pinch-out-and-in','old-pan'][pathIndex]);
   await timedPoints(points,(point,i)=>sendInput(i,()=>{
    const touches=pathIndex<2?[{identifier:1,clientX:cx-(point.x2-point.x1)/2,clientY:cy},{identifier:2,clientX:cx+(point.x2-point.x1)/2,clientY:cy}]:[{identifier:1,clientX:cx,clientY:cy+point.y-720}];
    touch(app,i===0?'touchstart':'touchmove',touches);
   }),pathIndex<2?50:40);
   touch(app,'touchend',[]);await finish();await sleep(100);
  }
 }
 phase='final-settle';await sleep(300);recording=false;cancelAnimationFrame(monitoring);
 const active=samples.filter(x=>x.phase!=='settle'&&x.phase!=='prepare'&&x.phase!=='final-settle'),motion=active.filter(x=>x.changed);
 const oldScope=samples.filter(x=>x.phase!=='prepare'),oldMotion=oldScope.filter(x=>x.changed);
 return {inputMode:mode.input,samples,inputs,phaseTimes,events:probe.events,active:stats(active.map(x=>x.dt)),motionConditional:stats(motion.map(x=>x.dt)),oldHudConditional:stats(oldMotion.map(x=>x.dt)),
  activeCssChanges:motion.length,activeObservedChangeRate:motion.length*1000/active.reduce((a,b)=>a+b.dt,0),
  slowFramesDiscardedByMotionFilter:active.filter(x=>!x.changed&&x.dt>25).length,
  hidden:document.visibilityState,actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').getAttribute('src')};
}
async function perf(){
 const data={environment:environment(),method:'independent timer input (50ms), continuously sampled parent rAF; wheel trajectory or historical touch distances/pan projected into current viewport; synthetic TouchEvent properties; not a physical iPhone rerun',trials:[],errors};
 for(const input of ['wheel50','oldTouch50']){
  const order=[2,3,4,5,5,4,3,2];
  for(const[nIndex,n]of order.entries()){
   status.textContent=`入力方式診断 ${data.trials.length+1}/16 ${input} 1/${n} — Safariを前面に維持`;
   const app=await load(`trace-${n}`,'ja','1F');await warm(app);const result=await measureCadence(app,{input});
   data.trials.push({n,index:nIndex,...result,environment:environment()});await post('cadence-progress',data);
  }
 }
 await post('cadence',data);status.textContent=`入力方式診断完了 — ${data.trials.length}試行を保存`;
}
async function run(){document.querySelector('#perf').disabled=true;try{await perf();}catch(e){status.textContent=String(e.stack??e);await post('cadence-failure',{error:String(e.stack??e),errors,environment:environment()});}finally{document.querySelector('#perf').disabled=false;}}
document.querySelector('#perf').onclick=run;
if(new URL(location).searchParams.get('run')==='cadence')run();else await load('plain-4');
