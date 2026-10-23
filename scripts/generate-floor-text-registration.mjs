import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { optimizeMapSvg } from './map-svg-optimization.mjs';
import { getFloorAlignment } from '../src/floor-alignment.js';

// The source drawings store their lettering as references to glyph outlines.
// Measure those in SVG units, then keep connected lettering in one transform.
export function measureLettering() {
  const root = document.querySelector('svg'), inverse = root.getScreenCTM().inverse();
  const uses = [...root.querySelectorAll('use')].filter(n => !n.closest('defs'));
  return uses.flatMap((node, index) => {
    const ref = document.getElementById((node.getAttribute('href') || node.getAttribute('xlink:href'))?.slice(1));
    if (!ref) return [];
    const b = ref.getBBox();
    if (!(b.x >= -3 && b.y >= -25 && b.y + b.height <= 4 && b.x + b.width <= 30 && b.height > 0)) return [];
    const box = node.getBBox(), matrix = inverse.multiply(node.getScreenCTM());
    const corners = [[box.x, box.y], [box.x + box.width, box.y + box.height]].map(p => new DOMPoint(...p).matrixTransform(matrix));
    return [{ index, fill: getComputedStyle(node).fill, parent: [...root.querySelectorAll('g')].indexOf(node.parentElement), bounds: [corners[0].x, corners[0].y, corners[1].x, corners[1].y] }];
  });
}
export function measureBoundaryBadges(patches) {
  const root=document.querySelector('svg'), inv=root.getScreenCTM().inverse();
  const nodes=[...root.querySelectorAll('path,use,rect,circle,ellipse,line,polyline,polygon')].filter(n=>!n.closest('defs'));
  const shapes=nodes.flatMap((n,primitive)=>{
    if(n.tagName!=='path')return[];
    const b=n.getBBox(), m=inv.multiply(n.getScreenCTM());
    const p=[new DOMPoint(b.x,b.y),new DOMPoint(b.x+b.width,b.y+b.height)].map(p=>p.matrixTransform(m));
    const bounds=[p[0].x,p[0].y,p[1].x,p[1].y],rgb=getComputedStyle(n).fill.match(/[\d.]+/g)?.map(Number);
    if(!rgb||b.width<=0||b.height<=0||b.width>30||b.height>30)return[];
    return [{primitive,bounds,dark:Math.max(...rgb.slice(0,3))<100,white:Math.min(...rgb.slice(0,3))>240}];
  });
  const badges=shapes.filter(s=>s.dark&&patches.some(p=>{
    const [l,t,r,b]=p.bounds,[x,y,x2,y2]=s.bounds;
    return x<r&&x2>l&&y<b&&y2>t&&!(x>=l&&x2<=r&&y>=t&&y2<=b);
  }));
  return shapes.filter(s=>badges.includes(s)||s.white&&badges.some(b=>s.bounds[0]>=b.bounds[0]&&s.bounds[1]>=b.bounds[1]&&s.bounds[2]<=b.bounds[2]&&s.bounds[3]<=b.bounds[3]));
}
export function measureBoundaryLeaders(patches) {
  const root=document.querySelector('svg'), inv=root.getScreenCTM().inverse();
  return [...root.querySelectorAll('path,use,rect,circle,ellipse,line,polyline,polygon')].filter(n=>!n.closest('defs')).flatMap((n,primitive)=>{
    if(n.tagName!=='path'||getComputedStyle(n).fill!=='none')return[];
    const color=getComputedStyle(n).stroke.match(/[\d.]+/g)?.map(Number),b=n.getBBox();
    if(!color||Math.max(...color.slice(0,3))>100||b.width>250||b.height>250)return[];
    const tokens=n.getAttribute('d').match(/[a-z]|[-+]?(?:\d*\.\d+|\d+\.?\d*)(?:e[-+]?\d+)?/gi)??[];
    if(tokens.some(t=>/^[a-z]$/i.test(t)&&!/[mlhvz]/i.test(t)))return[];
    const m=inv.multiply(n.getScreenCTM()),back=m.inverse(),points=[];let x=0,y=0,sx=0,sy=0,i=0,cmd;
    while(i<tokens.length){
      if(/^[a-z]$/i.test(tokens[i]))cmd=tokens[i++];
      const relative=cmd===cmd.toLowerCase(),upper=cmd.toUpperCase();
      if(upper==='Z'){x=sx;y=sy;cmd=null;points.push({command:'Z'});continue;}
      const oldX=x,oldY=y;
      if(upper==='H')x=+tokens[i++]+(relative?oldX:0);
      else if(upper==='V')y=+tokens[i++]+(relative?oldY:0);
      else{x=+tokens[i++]+(relative?oldX:0);y=+tokens[i++]+(relative?oldY:0);}
      if(upper==='M'){sx=x;sy=y;cmd=relative?'l':'L';}
      const q=new DOMPoint(x,y).matrixTransform(m);
      const patch=patches.find(p=>q.x>=p.bounds[0]&&q.x<=p.bounds[2]&&q.y>=p.bounds[1]&&q.y<=p.bounds[3]);
      const [a,b,c,d,e,f]=patch?.matrix??[1,0,0,1,0,0];
      const target=new DOMPoint(a*q.x+c*q.y+e,b*q.x+d*q.y+f),local=target.matrixTransform(back);
      points.push({command:upper==='M'?'M':'L',source:[q.x,q.y],target:[target.x,target.y],local:[local.x,local.y],region:patch?.id??null});
    }
    if(new Set(points.filter(p=>p.source).map(p=>p.region)).size<=1)return[];
    return [{primitive,points,d:points.map(p=>p.command+(p.local?p.local.map(v=>+v.toFixed(9)).join(' '):'')).join(' ')}];
  });
}
function runs(glyphs, patches) {
  const pending = [...glyphs], result = [];
  const close = (a, b) => {
    const overlap = a.bounds[0]<=b.bounds[2] && a.bounds[2]>=b.bounds[0] && a.bounds[1]<=b.bounds[3] && a.bounds[3]>=b.bounds[1];
    if(a.primitive!==undefined || b.primitive!==undefined)return overlap;
    if (a.fill !== b.fill) return false;
    const x = a.bounds, y = b.bounds, h = Math.max(x[3] - x[1], y[3] - y[1]);
    const dx = Math.max(x[0] - y[2], y[0] - x[2], 0), dy = Math.max(x[1] - y[3], y[1] - x[3], 0);
    return dx <= h * 1.2 && dy <= h * .85;
  };
  while (pending.length) {
    const group = [pending.shift()];
    for (let i = 0; i < group.length; i++) for (let j = pending.length - 1; j >= 0; j--) if (close(group[i], pending[j])) group.push(...pending.splice(j, 1));
    group.sort((a, b) => a.index - b.index);
    const bounds = [Math.min(...group.map(g => g.bounds[0])), Math.min(...group.map(g => g.bounds[1])), Math.max(...group.map(g => g.bounds[2])), Math.max(...group.map(g => g.bounds[3]))];
    const x = (bounds[0] + bounds[2]) / 2, y = (bounds[1] + bounds[3]) / 2;
    const patch = patches.find(p => x >= p.bounds[0] && x <= p.bounds[2] && y >= p.bounds[1] && y <= p.bounds[3]);
    result.push({ indices: group.filter(g=>g.index!==undefined).map(g => g.index), primitives: group.filter(g=>g.primitive!==undefined).map(g=>g.primitive), bounds, region: patch?.id ?? null });
  }
  return result;
}
if (process.argv[1] === new URL(import.meta.url).pathname) {
  const browser = await chromium.launch(), page = await browser.newPage();
  const data = {};
  try {
    for (const language of ['ja', 'en']) for (const floor of ['2F', '3F', '4F', '5F']) {
      const filename = `${language}/${floor}.svg`, source = await readFile(new URL(`../src/assets/floors/${filename}`, import.meta.url), 'utf8');
      const svg = optimizeMapSvg(source, { filename });
      await page.setContent('<!doctype html><body>' + svg);
      const glyphs = await page.evaluate(measureLettering);
      const badges = await page.evaluate(measureBoundaryBadges, getFloorAlignment(floor, language));
      const leaders = await page.evaluate(measureBoundaryLeaders, getFloorAlignment(floor, language));
      if (!glyphs.length) throw new Error('No lettering measured: ' + filename);
      data[filename] = { optimizedSha256: createHash('sha256').update(svg).digest('hex'), glyphCount: glyphs.length, leaders, runs: runs([...glyphs,...badges], getFloorAlignment(floor, language)) };
      console.log(filename, glyphs.length, 'glyphs', data[filename].runs.length, 'runs');
    }
    await writeFile(new URL('../src/assets/floor-text-registration.json', import.meta.url), JSON.stringify(data, null, 2) + '\n');
  } finally { await browser.close(); }
}
