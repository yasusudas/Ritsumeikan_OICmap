import { chromium } from '@playwright/test';
import { readFile,writeFile,mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const args=process.argv.slice(2),option=(key,fallback)=>args.includes(key)?args[args.indexOf(key)+1]:fallback;
const out=path.resolve(option('--out',path.join(root,'tmp/walk-review-1f')));
const branch=execFileSync('git',['-c','core.fsmonitor=false','branch','--show-current'],{cwd:root,encoding:'utf8'}).trim();
if(branch!=='Version3.2')throw Error(`Expected Version3.2, got ${branch}`);
await mkdir(out,{recursive:true});
const svg=await readFile(path.join(root,'src/assets/floors/ja/1F.svg'),'utf8');
const data=await readFile(path.join(root,'public/manual-search-index.json'),'utf8');
const browser=await chromium.launch();
const esc=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
try {
 const page=await browser.newPage({viewport:{width:1200,height:900},deviceScaleFactor:1});
 await page.route('**/*',route=>{
  const pathname=new URL(route.request().url()).pathname;
  return route.fulfill({contentType:pathname.endsWith('.json')?'application/json':'image/svg+xml',body:pathname.endsWith('.json')?data:svg});
 });
 await page.goto('http://review.local/1F.svg');
 await page.evaluate(await readFile(path.join(root,'scripts/outlines/outline-kit.browser.js'),'utf8'));
 console.log(await page.evaluate(()=>OK.init('1F')));
 const geometry=await page.evaluate(()=>({fills:OK.fills,strokes:OK.strokes,entries:OK.entries}));
 await writeFile(path.join(out,'source-geometry.json'),JSON.stringify(geometry));
 const python=option('--python','python3'),arch=option('--python-arch',null);
 const pyargs=[path.join(root,'scripts/gps/walk-review-geometry.py'),path.join(out,'source-geometry.json'),out,root];
 console.log(execFileSync(arch?'arch':python,arch?['-'+arch,python,...pyargs]:pyargs,{cwd:root,encoding:'utf8',timeout:180000}).trim());
 const c=JSON.parse(await readFile(path.join(out,'candidates.json'),'utf8'));
 const png={};for(const key of ['indoor','outdoor','shared'])png[key]=(await readFile(path.join(out,key+'.png'))).toString('base64');
 const polyline=(pts,style)=>`<polyline points="${pts.map(p=>p.join(',')).join(' ')}" style="${style}"/>`;
 const placed=[...c.entrances,...c.vertical,...c.doors].map(p=>[p.xy[0]-2.7,p.xy[1]-2.7,p.xy[0]+2.7,p.xy[1]+2.7]);
 const label=(id,xy,color,size=4.6)=>{
  const width=size*.65*id.length+2,height=size+2;
  const offsets=[[4,-4],[4,8],[-width-3,-4],[-width-3,8],[4,-10],[4,14],[-width-3,-10],[-width-3,14],[7,-17],[7,21],[-width-6,-17],[-width-6,21]];
  const choices=offsets.map(([dx,dy])=>{const box=[xy[0]+dx-1,xy[1]+dy-height,xy[0]+dx+width,xy[1]+dy+1];const overlap=placed.filter(b=>box[0]<b[2]&&box[2]>b[0]&&box[1]<b[3]&&box[3]>b[1]).length;return {dx,dy,box,overlap};});
  const best=choices.find(q=>q.overlap===0)||choices.sort((a,b)=>a.overlap-b.overlap)[0];placed.push(best.box);
  const x=xy[0]+best.dx,y=xy[1]+best.dy;
  const leader=Math.hypot(best.dx,best.dy)>10?`<path d="M${xy.join(',')} L${x+(best.dx<0?width:0)},${y-size/2}" fill="none" stroke="${color}" stroke-width=".45"/>`:'';
  return leader+`<text x="${x}" y="${y}" style="font:700 ${size}px system-ui;fill:${color};stroke:white;stroke-width:1.7;paint-order:stroke;stroke-linejoin:round">${id}</text>`;
 };
 const dot=(item,color,r=2.3)=>`<g data-candidate="${item.id}"><title>${esc(item.id+' '+(item.label||item.kind))}</title><circle cx="${item.xy[0]}" cy="${item.xy[1]}" r="${r}" style="fill:${color};stroke:white;stroke-width:.8"/></g>`;
 const regionLabels=c.regions.map(p=>label(p.id,p.center,'#006950',6)).join('');
 const layers={
  base:`<g data-layer="base" opacity=".82"><image x="0" y="0" width="1190.55" height="841.89" href="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"/></g>`,
  boundaries:`<g data-layer="boundaries">${c.roomBoundaries.flatMap(r=>r.polygons.map(p=>`<polygon points="${p.map(q=>q.join(',')).join(' ')}" style="fill:#be365219;stroke:#be3652;stroke-width:.45"/>`)).join('')}</g>`,
  areas:`<g data-layer="areas">${['indoor','outdoor','shared'].map(k=>`<image href="data:image/png;base64,${png[k]}" x="0" y="0" width="1191" height="842"/>`).join('')}</g>`,
  routes:`<g data-layer="routes">${c.edges.map(e=>polyline(e.polyline,'fill:none;stroke:#087bc1;stroke-width:1.2;stroke-linejoin:round')).join('')}${c.nodes.map(n=>`<circle cx="${n.xy[0]}" cy="${n.xy[1]}" r="1" fill="white" stroke="#087bc1" stroke-width=".5"/>`).join('')}</g>`,
  connections:`<g data-layer="connections">${[...c.entrances,...c.vertical,...c.doors].filter(p=>p.attachment).map(p=>polyline([p.xy,...p.attachment.candidateApproach],'fill:none;stroke:#dd7800;stroke-width:.85;stroke-dasharray:2 1.2')).join('')}</g>`,
  entrances:`<g data-layer="entrances">${c.entrances.map(p=>dot(p,'#005f66',2.6)).join('')}</g>`,
  doors:`<g data-layer="doors">${c.doors.map(p=>dot(p,'#d97500',1.9)).join('')}</g>`,
  vertical:`<g data-layer="vertical">${c.vertical.map(p=>dot(p,'#7735b7',2.8)).join('')}</g>`,
  labels:`<g data-layer="labels">${regionLabels}${c.entrances.map(p=>label(p.id,p.xy,'#005f66',5.3)).join('')}${c.doors.map(p=>label(p.id,p.xy,'#b65900',4.1)).join('')}${c.vertical.map(p=>label(p.id,p.xy,'#7735b7',5.3)).join('')}</g>`
 };
 const views={overview:{title:'1F 全体',box:[70,90,1060,730]},A:{title:'A棟',box:[620,210,420,310]},B:{title:'B棟',box:[365,500,280,320]},H:{title:'H棟',box:[80,305,400,195]},CD:{title:'C・D棟',box:[470,90,175,395]},G:{title:'G棟',box:[125,245,310,100]}};
 function render(view,{areasOnly=false,header=true}={}) {
  const [x,y,w,h]=view.box,head=header?w*.105:0;
  const inner=Object.entries(layers).filter(([k])=>!areasOnly||!['routes','connections','doors','entrances','vertical'].includes(k)).map(([k,v])=>areasOnly&&k==='labels'?`<g data-layer="labels">${regionLabels}</g>`:v).join('');
  const text=(dy,str,size=w*.0125,color='#334155')=>`<text x="${x+w*.014}" y="${y-head+dy}" style="font:${size}px system-ui;fill:${color}">${esc(str)}</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y-head} ${w} ${h+head}" width="100%" style="display:block;background:white"><defs><clipPath id="review-map-clip"><rect x="${x}" y="${y}" width="${w}" height="${h}"/></clipPath></defs><g clip-path="url(#review-map-clip)">${inner}</g>${header?`<rect x="${x}" y="${y-head}" width="${w}" height="${head}" fill="#f5f8fc"/>`+text(w*.028,`${view.title} — 自動抽出候補 / 未確認`,w*.023,'#112337')+text(w*.051,'緑：床色由来の通路候補　黄：屋外・共有空間候補　赤：部屋境界の参考')+text(w*.071,'青線：中心線候補　E：三角記号　V：階段・EV等　D：推定ドア位置　橙点線：未確認の接続')+text(w*.09,'Dは扉を検出した結果ではありません。領域・壁・入口・接続はすべて要確認。本番未適用。',w*.0105,'#9a4600'):''}</svg>`;
 }
 await page.unroute('**/*');
 await page.goto('about:blank');
 for(const [key,view] of Object.entries(views)) {
  const width=key==='overview'?3600:key==='CD'?1200:2400;
  const height=Math.ceil(width*(view.box[3]/view.box[2]+.105));
  const doc=render(view);
  await writeFile(path.join(out,`1F-${key}.svg`),doc);
  await page.setViewportSize({width,height});await page.setContent(`<html><head><meta charset="utf-8"></head><body style="margin:0">${doc}</body></html>`);
  await page.evaluate(()=>document.fonts.ready);
  await page.screenshot({path:path.join(out,`1F-${key}.png`)});
 }
 const overview=views.overview;
 await page.setViewportSize({width:3600,height:Math.ceil(3600*(overview.box[3]/overview.box[2]+.105))});
 await page.setContent(`<body style="margin:0">${render(overview,{areasOnly:true})}</body>`);
 await page.screenshot({path:path.join(out,'1F-areas.png')});
 const all=[...c.regions.map(p=>({...p,xy:p.center,label:'通路領域候補'})),...c.edges.map(p=>({...p,xy:p.polyline[Math.floor(p.polyline.length/2)],label:p.sourceRegion+' 中心線候補'})),...c.entrances,...c.vertical,...c.doors];
 const csv=['id,kind,label,x,y,review,enabled',...all.map(p=>[p.id,p.kind,JSON.stringify(p.label||''),...p.xy.map(v=>v.toFixed(3)),'pending','false'].join(','))].join('\n');
 await writeFile(path.join(out,'review-list.csv'),csv+'\n');
 const viewButtons=Object.entries(views).map(([key,v])=>`<button data-view="${key}">${v.title}</button>`).join('');
 const controls=Object.keys(layers).map((key,i)=>`<label><input type="checkbox" data-key="${key}" checked>${['原図','部屋境界','通路候補','中心線','接続候補','記号 E','推定ドア D','階段・EV V','番号'][i]}</label>`).join('');
 const rows=all.map(p=>`<button class="row" data-id="${p.id}" data-xy="${p.xy.join(',')}"><b>${p.id}</b> ${esc(p.label||({stairs:'階段',escalator:'エスカレーター',elevator:'EV','entrance-symbol-candidate':'出入口記号候補'}[p.kind]||p.kind))}<small>${p.kind==='walkable-area-candidate'?'床色から抽出した領域':p.kind==='centerline-candidate'?'領域内の中心線':p.attachment?'経路への接近線あり／未確認':'経路との接続未解決'} · 未承認</small></button>`).join('');
 const html=`<!doctype html><html lang="ja"><meta charset="utf-8"><title>1F 通路・接続候補レビュー</title><style>body{margin:0;font:14px system-ui;color:#183047;background:#eef2f7}header{padding:18px 24px;background:white;border-bottom:1px solid #ccd5df}h1{font-size:22px;margin:0 0 8px}p{margin:7px 0}.controls{display:flex;gap:14px;flex-wrap:wrap;padding:12px 24px;background:white}button{font:inherit;cursor:pointer;border:1px solid #bdcad8;border-radius:6px;padding:7px 12px;background:white;color:inherit}button:hover{background:#e7f1fb}main{display:grid;grid-template-columns:minmax(0,1fr) 270px;gap:12px;padding:12px}#drawing{background:white;min-height:70vh;overflow:auto}aside{height:78vh;overflow:auto;background:white;padding:12px}.row{display:block;text-align:left;width:100%;margin:6px 0}.row[hidden]{display:none}small{display:block;color:#707c87;font-size:11px}input[type=search]{box-sizing:border-box;padding:8px;width:100%;position:sticky;top:0}#drawing svg{max-height:78vh}#review-focus{pointer-events:none}@media(max-width:800px){main{grid-template-columns:1fr}aside{height:30vh}}</style><header><h1>1F 通路・接続候補の確認</h1><p>自動生成した候補です。公開中の測位補正には使っていません。Dは部屋境界からの幾何推定で、扉の検出結果ではありません。</p><p>緑＝床色由来、黄＝屋外・共有空間、赤＝部屋境界、青＝中心線、橙点線＝未確認の接続。候補番号で修正箇所を指定できます。</p>${viewButtons}</header><div class="controls">${controls}</div><main><div id="drawing">${render(overview,{header:false})}</div><aside><input id="search" type="search" placeholder="番号・部屋名を検索">${rows}</aside></main><script>const views=${JSON.stringify(views)};const svg=document.querySelector('#drawing>svg');document.querySelectorAll('[data-key]').forEach(el=>el.onchange=()=>svg.querySelector('[data-layer="'+el.dataset.key+'"]').style.display=el.checked?'':'none');document.querySelectorAll('[data-view]').forEach(el=>el.onclick=()=>{svg.setAttribute('viewBox',views[el.dataset.view].box.join(' '));document.getElementById('review-focus')?.remove()});document.querySelectorAll('.row').forEach(el=>el.onclick=()=>{const [x,y]=el.dataset.xy.split(',').map(Number);svg.setAttribute('viewBox',[x-65,y-50,130,100].join(' '));document.getElementById('review-focus')?.remove();const n=document.createElementNS('http://www.w3.org/2000/svg','circle');n.id='review-focus';n.setAttribute('cx',x);n.setAttribute('cy',y);n.setAttribute('r','7');n.setAttribute('fill','none');n.setAttribute('stroke','#e41c43');n.setAttribute('stroke-width','1');svg.append(n)});document.querySelector('#search').oninput=e=>document.querySelectorAll('.row').forEach(el=>el.hidden=!el.textContent.toLowerCase().includes(e.target.value.toLowerCase()));</script></html>`;
 await writeFile(path.join(out,'review.html'),html);
 console.log('Review files written: '+out);
} finally {await browser.close();}
