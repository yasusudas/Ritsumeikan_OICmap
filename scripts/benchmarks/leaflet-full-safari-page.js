let lastApp;
const metadata=await fetch('/metadata').then(r=>r.json()),frame=document.querySelector('#app'),status=document.querySelector('#status');frame.style.marginLeft='32.5px';frame.style.marginRight='0';
if(new URL(location).searchParams.has('mobile')){frame.style.width='390px';frame.style.height='844px';}
const sleep=ms=>new Promise(r=>setTimeout(r,ms)),raf=()=>new Promise(requestAnimationFrame),errors=[];
const env=()=>({userAgent:navigator.userAgent,dpr:devicePixelRatio,parentViewport:[innerWidth,innerHeight],viewport:[frame.clientWidth,frame.clientHeight],screen:[screen.width,screen.height],visibility:document.visibilityState,timestamp:new Date().toISOString()});
const post=(name,data)=>fetch('/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,data})});
addEventListener('error',e=>errors.push(String(e.message)));addEventListener('unhandledrejection',e=>errors.push(String(e.reason)));
async function wait(check,label){const end=performance.now()+40000;while(performance.now()<end){if(check())return;await sleep(60);}throw Error('Timed out '+label);}
async function load(variant,language='ja',floor='1F'){
 localStorage.setItem('oicmap:lang',language);frame.src=`/${variant}/${language==='en'?'en/':''}index.html`;await new Promise(r=>frame.onload=r);
 const w=frame.contentWindow,d=frame.contentDocument;w.addEventListener('error',e=>errors.push(variant+': '+e.message));w.addEventListener('unhandledrejection',e=>errors.push(variant+': '+e.reason));
 await wait(()=>d.querySelector('.floor-svg')?.complete&&d.querySelector('#canvas-layer')?.style.width,'initial floor');
 if(floor!=='1F'){d.querySelector(`.floor-tab[data-floor="${floor}"]`).click();await wait(()=>d.querySelector('.floor-tab.is-active')?.dataset.floor===floor&&(d.querySelector('.floor-svg')?.dataset.originalSvgUrl??d.querySelector('.floor-svg')?.getAttribute('src'))?.includes(floor.replace('A-6-9F','6F7F8F9F_BldgA')),'floor');}
 await sleep(800);await post('load-debug',{variant,language,floor,info:w.__leafletBenchmark?.info(),environment:env()});if(w.__leafletBenchmark)await wait(()=>w.__leafletBenchmark.info().ready,'initial tiles');
 return lastApp={w,d,variant,language,floor,viewer:d.querySelector('#viewer'),layer:d.querySelector('#canvas-layer')};
}
function stats(a){const sorted=[...a].sort((a,b)=>a-b),total=a.reduce((x,y)=>x+y,0);return{frames:a.length,totalMs:total,fps:a.length*1000/total,p95Ms:sorted[Math.ceil(a.length*.95)-1],maxMs:Math.max(...a),over25ms:a.filter(v=>v>25).length};}
function state(app){const t=app.layer.style.transform,m=t.match(/scale\(([^)]+)\)/),scale=m?Number(m[1]):1;return{width:parseFloat(app.layer.style.width)*scale,height:parseFloat(app.layer.style.height)*scale,transform:t,tiles:app.w.__leafletBenchmark?.info()??null};}
function input(app,delta,method='native'){
 const r=app.viewer.getBoundingClientRect(),x=r.width*.52,y=r.height*.53;
 if(method==='common'&&app.variant==='full')app.w.__leafletBenchmark.setZoomAround(delta<0?1.1:1/1.1,x,y);
 else app.viewer.dispatchEvent(new app.w.WheelEvent('wheel',{deltaY:delta*(method==='native'?36:1),clientX:r.left+x,clientY:r.top+y,bubbles:true,cancelable:true}));
}
async function settled(app){await sleep(650);if(app.w.__leafletBenchmark)await wait(()=>app.w.__leafletBenchmark.info().ready&&!app.w.__leafletBenchmark.info().zoomAnimating,'settled tiles');await raf();}
async function warm(app,method){for(const delta of [-1,1]){for(let i=0;i<24;i++){input(app,delta,method);await raf();}await settled(app);}}
async function measure(app,method){
 const samples={zoomIn:[],zoomOut:[],settle:[],pan:[]},phases=[],hidden=[],serverBefore=await fetch('/tile-stats').then(r=>r.json());
 for(let cycle=0;cycle<3;cycle++)for(const [phase,delta]of [['zoomIn',-1],['zoomOut',1]]){
  let previous=await raf();const initial=state(app),trace=[],stop=[];
  for(let i=0;i<24;i++){input(app,delta,method);const now=await raf();samples[phase].push(now-previous);previous=now;trace.push(state(app));hidden.push(document.visibilityState);}
  for(let i=0;i<24;i++){const now=await raf();samples.settle.push(now-previous);previous=now;stop.push(state(app));}
  phases.push({cycle,phase,initial,trace,stop});
 }
 // Common enlarged scale for drag; full variant uses Leaflet public camera API.
 for(let i=0;i<16;i++){input(app,-1,'common');await raf();}await settled(app);
 const rect=app.viewer.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;
 app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:x,clientY:y,button:0,buttons:1,bubbles:true,cancelable:true,view:app.w}));
 let previous=await raf();const panInitial=state(app),panTrace=[];
 for(let i=0;i<60;i++){
  const target=app.viewer;
  target.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:x+120*Math.sin(i/10),clientY:y+70*Math.cos(i/10),buttons:1,bubbles:true,cancelable:true,view:app.w}));
  const now=await raf();samples.pan.push(now-previous);previous=now;panTrace.push(state(app));
 }
 app.viewer.dispatchEvent(new app.w.MouseEvent('mouseup',{clientX:x,clientY:y,button:0,bubbles:true,view:app.w}));await settled(app);
 return{method,zoom:stats([...samples.zoomIn,...samples.zoomOut]),zoomIn:stats(samples.zoomIn),zoomOut:stats(samples.zoomOut),settle:stats(samples.settle),pan:stats(samples.pan),raw:samples,phases,panInitial,panTrace,hiddenFrames:hidden.filter(v=>v!=='visible').length,actualLanguage:app.d.documentElement.lang,image:app.d.querySelector('.floor-svg').dataset.originalSvgUrl??app.d.querySelector('.floor-svg').getAttribute('src'),final:state(app),environment:env(),serverBefore,serverAfter:await fetch('/tile-stats').then(r=>r.json())};
}
async function perf(){
 await wait(()=>document.visibilityState==='visible','foreground');const smoke=new URL(location).searchParams.has('smoke'),checkOnly=new URL(location).searchParams.has('check'),prefix=checkOnly?'performance-check':smoke?'performance-smoke':'performance';
 const result={environment:env(),trials:[],errors,methods:{common:'same 24 x 1.1 camera targets, public Leaflet setZoomAround animate:false; baseline/render-only original wheel',native:'same wheel deltaY=36 pixels, 24 events per direction; Leaflet standard40ms debounce+sigmoid, original sign-based handler; record actual zoom coverage'}};
 for(const c of ((smoke||checkOnly)?metadata.cases.slice(0,1):metadata.cases)){
  for(const variant of ['render-only','full']){status.textContent='タイル準備 '+variant+' '+c.language+c.floor;for(const method of ['common','native']){const app=await load(variant,c.language,c.floor);await warm(app,method);if(errors.length)throw Error('Warmup error: '+errors.at(-1));}}
  const first=['baseline','render-only','full'],second=['render-only','full','baseline'],sequence=checkOnly?['full']:smoke?first:[...first,...first.toReversed(),...second,...second.toReversed()];
  for(const [index,variant]of sequence.entries()){
   status.textContent=`FPS ${c.language} ${c.floor} ${index+1}/${sequence.length} ${variant}`;const measurements={};
   for(const method of ['common','native']){const app=await load(variant,c.language,c.floor);await warm(app,method);measurements[method]=await measure(app,method);}
   if(errors.length)throw Error('Measurement error: '+errors.at(-1));result.trials.push({...c,index,variant,...measurements});await post(prefix+'-progress',result);
  }
 }
 await post(prefix,result);status.textContent='FPS完了 '+result.trials.length+'試行';
}
let qualityApp;
async function quality(){
 const p=new URL(location).searchParams,variant=p.get('variant')??'full',language=p.get('language')??'ja',floor=p.get('floor')??'1F',steps=Number(p.get('steps')??23),app=await load(variant,language,floor);
 for(let i=0;i<steps;i++){input(app,-1,'common');await raf();await post('quality-step-debug',{step:i,state:state(app),environment:env()});}await settled(app);
 if(variant==='full'&&p.has('alignX')){
  const current=state(app).tiles.view,rect=app.viewer.getBoundingClientRect(),x=rect.left+480,y=rect.top+400,dx=Math.round(Number(p.get('alignX')))-current.x,dy=Math.round(Number(p.get('alignY')))-current.y;
  app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:x,clientY:y,button:0,buttons:1,bubbles:true,cancelable:true,view:app.w}));
  for(const f of [.5,1]){app.viewer.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:x+dx*f,clientY:y+dy*f,buttons:1,bubbles:true,cancelable:true,view:app.w}));await raf();}
  await sleep(150);app.viewer.dispatchEvent(new app.w.MouseEvent('mouseup',{clientX:x+dx,clientY:y+dy,button:0,bubbles:true,view:app.w}));await settled(app);
 }
 qualityApp=app;
 await post(`quality-${variant}-${language}-${floor}-${steps}${p.has('mobile')?'-mobile':''}`,{environment:env(),variant,language,floor,steps,referenceOrigin:p.has('alignX')?[Number(p.get('alignX')),Number(p.get('alignY'))]:null,state:state(app),rects:{viewer:app.viewer.getBoundingClientRect().toJSON(),image:app.d.querySelector('.floor-svg').getBoundingClientRect().toJSON(),frame:frame.getBoundingClientRect().toJSON()},errors});status.textContent='画質 '+variant+' '+language+floor+' '+steps;
}
async function usage(){
 const p=new URL(location).searchParams,variant=p.get('variant')??'full',language=p.get('language')??'ja',query=language==='ja'?'AC130':'AS555',app=await load(variant,language),initial=state(app),input=app.d.querySelector('#search-input');
 input.value=query;input.dispatchEvent(new app.w.Event('input',{bubbles:true}));await wait(()=>[...app.d.querySelectorAll('.search-result[role="option"]')].some(n=>n.textContent.includes(query)),'search');[...app.d.querySelectorAll('.search-result[role="option"]')].find(n=>n.textContent.includes(query)).click();await sleep(1500);await settled(app);
 const highlight=app.d.querySelector('.search-highlight-area-outline, .search-highlight-pin');await post(`usage-${variant}-${language}`,{variant,language,query,initial,afterSearch:state(app),hash:app.w.location.hash,actualLanguage:app.d.documentElement.lang,highlight:highlight?.getBoundingClientRect().toJSON(),environment:env(),errors});status.textContent='検索完了 '+variant+' '+query;
}
async function controls(){
 const p=new URL(location).searchParams,variant=p.get('variant')??'full',language=p.get('language')??'ja',app=await load(variant,language),states=[];
 for(const floor of ['5F','1F','5F','1F']){app.d.querySelector(`.floor-tab[data-floor="${floor}"]`).click();await sleep(600);await settled(app);states.push({floor,active:app.d.querySelector('.floor-tab.is-active')?.dataset.floor,pins:app.d.querySelectorAll('.food-pin:not([hidden])').length,state:state(app)});}
 app.d.querySelector('[data-facility-key="toilet"]').click();await wait(()=>app.d.querySelectorAll('.facility-ring').length===35,'toilet rings');await raf();const rings=app.d.querySelectorAll('.facility-ring').length;app.d.querySelector('.food-pin[data-food-place]').click();await wait(()=>app.d.querySelector('#food-panel-title')?.textContent,'food panel');await settled(app);
 await post(`controls-${variant}-${language}`,{variant,language,states,rings,foodTitle:app.d.querySelector('#food-panel-title')?.textContent,state:state(app),environment:env(),errors});status.textContent='操作完了 '+variant+' '+language;
}
async function gestures(){
 const p=new URL(location).searchParams,variant=p.get('variant')??'full',language=p.get('language')??'ja',app=await load(variant,language),records=[];
 for(let i=0;i<10;i++){input(app,-1,'common');await raf();}await settled(app);
 records.push({phase:'before-pinch',state:state(app)});
 const r=app.viewer.getBoundingClientRect(),cx=r.left+r.width*.52,cy=r.top+r.height*.53;
 const pointer=(type,id,x,target)=>target.dispatchEvent(new app.w.PointerEvent(type,{pointerId:id,pointerType:'touch',isPrimary:id===11,clientX:x,clientY:cy,buttons:type==='pointerup'?0:1,bubbles:true,cancelable:true}));
 const touch=(type,distance,end=false)=>{const e=new app.w.Event(type,{bubbles:true,cancelable:true}),a=[{identifier:11,clientX:cx-distance,clientY:cy,target:app.viewer},{identifier:12,clientX:cx+distance,clientY:cy,target:app.viewer}];Object.defineProperties(e,{touches:{value:end?[]:a},changedTouches:{value:a}});app.viewer.dispatchEvent(e);};
 const usePointer=variant==='full'&&!('ontouchstart' in app.w);
 if(usePointer){pointer('pointerdown',11,cx-50,app.viewer);pointer('pointerdown',12,cx+50,app.viewer);}else touch('touchstart',50);
 for(let i=1;i<=20;i++){const dist=50+i*2.5;if(usePointer){pointer('pointermove',11,cx-dist,app.viewer);pointer('pointermove',12,cx+dist,app.viewer);}else touch('touchmove',dist);await raf();records.push({phase:'pinch-'+i,state:state(app)});}
 if(usePointer){pointer('pointerup',11,cx-100,app.viewer);pointer('pointerup',12,cx+100,app.viewer);}else touch('touchend',100,true);
 await settled(app);records.push({phase:'after-pinch',state:state(app)});
 const beforeDouble=state(app);app.viewer.dispatchEvent(new app.w.MouseEvent('dblclick',{clientX:cx,clientY:cy,button:0,bubbles:true,cancelable:true,view:app.w}));await settled(app);const afterDouble=state(app);app.viewer.focus();app.d.dispatchEvent(new app.w.KeyboardEvent('keydown',{key:'+',code:'Equal',keyCode:187,which:187,bubbles:true,cancelable:true}));await settled(app);const afterKeyboard=state(app);
 app.viewer.dispatchEvent(new app.w.MouseEvent('mousedown',{clientX:cx-120,clientY:cy-80,button:0,buttons:1,shiftKey:true,bubbles:true,cancelable:true,view:app.w}));
 app.viewer.dispatchEvent(new app.w.MouseEvent('mousemove',{clientX:cx+120,clientY:cy+80,buttons:1,shiftKey:true,bubbles:true,cancelable:true,view:app.w}));await raf();
 app.viewer.dispatchEvent(new app.w.MouseEvent('mouseup',{clientX:cx+120,clientY:cy+80,button:0,shiftKey:true,bubbles:true,cancelable:true,view:app.w}));await settled(app);const afterBox=state(app);
 await post(`gestures-${variant}-${language}`,{variant,language,usePointer,records,beforeDouble,afterDouble,afterKeyboard,afterBox,environment:env(),errors});qualityApp=app;status.textContent='ピンチ・ダブルクリック確認 '+variant;
}

async function alignment(){
 const app=await load('full','ja'),search=app.d.querySelector('#search-input');search.value='AC130';search.dispatchEvent(new app.w.Event('input',{bubbles:true}));await wait(()=>[...app.d.querySelectorAll('.search-result')].some(n=>n.textContent.includes('AC130')),'AC130');[...app.d.querySelectorAll('.search-result')].find(n=>n.textContent.includes('AC130')).click();await sleep(1500);await settled(app);
 const node=app.d.querySelector('.search-highlight-area-outline'),base=node.getBoundingClientRect(),camera=app.w.__leafletBenchmark.info().view,worldH=1024*camera.height/camera.width;
 const world={left:(base.left-camera.x)/camera.width*1024,right:(base.right-camera.x)/camera.width*1024,top:(base.top-camera.y)/camera.height*worldH,bottom:(base.bottom-camera.y)/camera.height*worldH},samples=[];
 let direction=-1;
 for(let i=0;i<150;i++){
  if(i===75)direction=1;if(i%3===0)input(app,direction,'native');await raf();
  const tile=[...app.d.querySelectorAll('.leaflet-tile-container')].sort((a,b)=>Number(b.style.zIndex)-Number(a.style.zIndex)).flatMap(n=>[...n.querySelectorAll('.leaflet-tile-loaded')])[0];if(!tile)continue;
  const match=tile.src.match(/\/(\d+)\/(-?\d+)\/(-?\d+)\.png$/);if(!match)continue;const [z,x,y]=match.slice(1).map(Number),r=tile.getBoundingClientRect(),actual=node.getBoundingClientRect(),unit=2**z;
  const px=v=>r.left+(.5+(v-x*256/unit)*unit)*r.width/257,py=v=>r.top+(.5+(v-y*256/unit)*unit)*r.height/257;
  const expected={left:px(world.left),right:px(world.right),top:py(world.top),bottom:py(world.bottom)},delta=Math.max(...Object.keys(expected).map(k=>Math.abs(actual[k]-expected[k])));
  samples.push({frame:i,delta,actual:actual.toJSON(),expected,animating:app.w.__leafletBenchmark.info().zoomAnimating,overlayMatrix:app.w.getComputedStyle(app.d.querySelector('.leaflet-full-overlays')).transform,tile:tile.src});
 }
 await settled(app);await post('animation-alignment',{environment:env(),world,samples,errors});qualityApp=app;status.textContent='アニメーション中のタイルと検索枠の追従を保存';
}

async function floors(){
 const language=new URL(location).searchParams.get('language')??'ja',app=await load('full',language),records=[];
 for(const floor of ['2F','3F','4F','5F','A-6-9F','H-6-9F','1F']){
  app.d.querySelector(`.floor-tab[data-floor="${floor}"]`).click();await sleep(500);await settled(app);records.push({floor,active:app.d.querySelector('.floor-tab.is-active')?.dataset.floor,state:state(app)});
 }
 app.d.querySelector('[data-facility-key="printer"]').click();await sleep(500);await settled(app);records.push({floor:'printer',state:state(app)});
 app.d.querySelector('.floor-tab[data-floor="1F"]').click();await sleep(500);await settled(app);
 for(let i=0;i<12;i++){input(app,-1,'common');await raf();}await settled(app);const beforeLanguage=state(app);
 app.d.querySelector('[data-lang-toggle]').click();await wait(()=>app.d.documentElement.lang!==language,'language flip');await sleep(600);await settled(app);
 const afterLanguage=state(app);await post(`floors-full-${language}`,{language,records,beforeLanguage,afterLanguage,actualLanguage:app.d.documentElement.lang,environment:env(),errors});qualityApp=app;status.textContent='全フロアと表示位置を保つ言語切替を確認';
}

async function run(fn){try{await fn();}catch(e){status.textContent=String(e.stack??e);await post('failure',{error:String(e.stack??e),environment:env(),state:lastApp?state(lastApp):null,viewer:lastApp?.viewer.getBoundingClientRect().toJSON(),errors});}}
document.querySelector('#perf').onclick=()=>run(perf);document.querySelector('#stop').onclick=async()=>{if(qualityApp){await settled(qualityApp);await post('manual-state',{environment:env(),variant:qualityApp.variant,state:state(qualityApp),errors});}};
const action=new URL(location).searchParams.get('run');if(action==='perf')run(perf);else if(action==='quality')run(quality);else if(action==='usage')run(usage);else if(action==='controls')run(controls);else if(action==='gestures')run(gestures);else if(action==='alignment')run(alignment);else if(action==='floors')run(floors);else load(new URL(location).searchParams.get('variant')??'baseline');
