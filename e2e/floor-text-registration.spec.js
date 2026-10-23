import { readFileSync } from 'node:fs';
import { test, expect, readyMap, chooseFloor, floors } from './helpers.js';
import { optimizeMapSvg } from '../scripts/map-svg-optimization.mjs';
import { measureLettering } from '../scripts/generate-floor-text-registration.mjs';
import records from '../src/assets/floor-text-registration.json' with { type: 'json' };

for (const language of ['ja', 'en']) test(`MAP lettering stays whole and retains original ink on every floor ${language}`, async ({ page, context }, testInfo) => {
  test.setTimeout(180_000);
  await readyMap(page, language);
  const report = [];
  for (const floor of floors) {
    await chooseFloor(page, floor);
    const served = await page.locator('#canvas-layer img.floor-svg').evaluate(async image => (await fetch(image.src)).text());
    const file = { 'A-6-9F': '6F7F8F9F_BldgA', 'H-6-9F': '6F7F8F9F_BldgH' }[floor] ?? floor;
    const filename = `${language}/${file}.svg`;
    const source = optimizeMapSvg(readFileSync(new URL(`../src/assets/floors/${filename}`, import.meta.url), 'utf8'), { filename, firstFloor: floor === '1F' });
    const reference = await context.newPage(), actual = await context.newPage();
    try {
      await reference.setContent('<!doctype html><body>' + source);
      const glyphs = await reference.evaluate(measureLettering);
      if (!glyphs.length) {
        // This sheet's outlines are flattened at diagram coordinates. Require
        // the entire served SVG to match, rather than comparing empty text masks.
        expect(served, filename + ' unchanged drawing bytes').toBe(source);
        await actual.setContent('<!doctype html><body>' + served);
        await testInfo.attach(`${language}-${floor}-flattened-lettering`, { body: await actual.screenshot(), contentType: 'image/png' });
        report.push({ floor, glyphs: 0, paintScope: 'entire SVG byte identity and native screenshot', identicalSvgBytes: true });
        continue;
      }
      const expected = await reference.evaluate(indices => {
        const root = document.querySelector('svg'), inv = root.getScreenCTM().inverse();
        const uses = [...root.querySelectorAll('use')].filter(n => !n.closest('defs'));
        return indices.map(i => {
          const n = uses[i], b = n.getBBox(), m = inv.multiply(n.getScreenCTM());
          const pts = [[b.x,b.y],[b.x+b.width,b.y+b.height]].map(p => new DOMPoint(...p).matrixTransform(m));
          return { index:i, fill:getComputedStyle(n).fill, points:pts.map(p=>[p.x,p.y]) };
        });
      }, glyphs.map(g => g.index));
      await actual.setContent('<!doctype html><body>' + served);
      const registered = records[filename];
      const actualGlyphs = registered ? null : await actual.evaluate(measureLettering);
      expect(registered ? registered.glyphCount : actualGlyphs.length).toBe(glyphs.length);
      const geometry = await actual.evaluate(({ expected, indices, registered }) => {
        const root = document.querySelector('svg'), inv = root.getScreenCTM().inverse();
        const nodes = registered ? [...root.querySelectorAll('[data-label-glyph]')] : [...root.querySelectorAll('use')].filter(n=>!n.closest('defs')).filter((_,i)=>indices.includes(i));
        const ids = nodes.map((n,i) => registered ? +n.dataset.labelGlyph : indices[i]);
        let maxError=0;
        const errors=[];
        if (registered) for (const n of root.querySelectorAll('#oic-floor-alignment-drawing use')) {
          const ref=document.getElementById((n.getAttribute('href')||n.getAttribute('xlink:href'))?.slice(1));
          const b=ref?.getBBox();
          if(b && b.x>=-3 && b.y>=-25 && b.y+b.height<=4 && b.x+b.width<=30 && b.height>0) errors.push('Duplicate lettering in clipped base');
        }
        for (let i=0;i<nodes.length;i++) {
          const n=nodes[i], original=registered ? expected.find(e=>e.index===ids[i]) : expected[i], run=n.closest('[data-floor-label-run]');
          let m=inv.multiply(n.getScreenCTM());
          if (run) {
            const region=run.dataset.labelRegion;
            const target=region==='outside' ? new DOMMatrix() : root.querySelector(`[data-alignment-region="${region}"]`).transform.baseVal.consolidate().matrix;
            const matrix=run.transform.baseVal.consolidate().matrix;
            if (['a','b','c','d','e','f'].some(k=>Math.abs(matrix[k]-target[k])>1e-9)) errors.push('Wrong label matrix '+ids[i]);
            for(let p=run;p && p!==root;p=p.parentElement) if(p.hasAttribute('clip-path')) errors.push('Clipped lettering '+ids[i]);
            m=new DOMMatrix([matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f]).inverse().multiply(m);
          }
          if(getComputedStyle(n).fill!==original.fill) errors.push('Changed glyph colour '+ids[i]);
          const b=n.getBBox();
          for(const [j,p] of [[b.x,b.y],[b.x+b.width,b.y+b.height]].entries()) {
            const q=new DOMPoint(...p).matrixTransform(m);
            maxError=Math.max(maxError,Math.hypot(q.x-original.points[j][0],q.y-original.points[j][1]));
          }
        }
        return { count:nodes.length, unique:new Set(ids).size,maxError,errors };
      }, { expected, indices:actualGlyphs?.map(g=>g.index), registered:Boolean(registered) });
      expect(geometry.count).toBe(glyphs.length);
      expect(geometry.unique).toBe(glyphs.length);
      expect(geometry.errors).toEqual([]);
      expect(geometry.maxError).toBeLessThan(.0001);
      const leaderAudit = await actual.evaluate(leaders=>{
        const root=document.querySelector('svg'),inv=root.getScreenCTM().inverse();let maxError=0,vertices=0;
        for(const leader of leaders){
          const node=root.querySelector(`[data-label-leader="${leader.primitive}"]`);
          if(!node||node.closest('[data-alignment-region]')||getComputedStyle(node).stroke==='none')throw new Error('Missing or clipped label leader');
          const matrix=inv.multiply(node.getScreenCTM());
          for(const p of leader.points.filter(p=>p.local)){
            const q=new DOMPoint(...p.local).matrixTransform(matrix);
            maxError=Math.max(maxError,Math.hypot(q.x-p.target[0],q.y-p.target[1]));vertices++;
          }
        }
        return {leaders:leaders.length,vertices,maxError};
      },registered?.leaders??[]);
      expect(leaderAudit.maxError).toBeLessThan(.0001);

      // Normalize only the intentional run transforms; the original ink must
      // be pixel-identical, so clipping, missing letters and style loss fail.
      const isolate = ({ indices, primitives = [], registered, zoom }) => {
        document.body.style.margin='0';
        const root=document.querySelector('svg');root.setAttribute('width',1190.55*zoom);root.setAttribute('height',841.89*zoom);
        if(root.hasAttribute('data-lettering-isolated'))return;
        root.setAttribute('data-lettering-isolated','true');
        // The H upper-floor sheet has flattened lettering paths, so compare
        // the entire unchanged drawing instead of a blank glyph-only image.
        if(!registered && indices.length===0)return;
        if(registered) {
          root.querySelector('[data-floor-leaders]')?.remove();
          for(const child of [...root.children]) if(child.tagName!=='defs' && !child.hasAttribute('data-floor-lettering')) child.remove();
          for(const run of root.querySelectorAll('[data-floor-label-run]')) run.removeAttribute('transform');
        } else {
          const uses=[...root.querySelectorAll('use')].filter(n=>!n.closest('defs'));
          const graphics=[...root.querySelectorAll('path,use,rect,circle,ellipse,line,polyline,polygon')].filter(n=>!n.closest('defs'));
          for(const n of root.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon,image,use,text')) {
            if(n.closest('defs'))continue;
            if(n.tagName==='use' && indices.includes(uses.indexOf(n)))continue;
            if(primitives.includes(graphics.indexOf(n)))continue;
            n.remove();
          }
        }
      };
      const pixelDiffs=[];
      for(const zoom of [1,2]) {
        await reference.setViewportSize({width:2400,height:1800});await actual.setViewportSize({width:2400,height:1800});
        await reference.evaluate(isolate,{indices:glyphs.map(g=>g.index),primitives:registered?.runs.flatMap(r=>r.primitives??[])??[],registered:false,zoom});
        await actual.evaluate(isolate,{indices:actualGlyphs?.map(g=>g.index),registered:Boolean(registered),zoom});
        const clip={x:0,y:0,width:Math.ceil(1190.55*zoom),height:Math.ceil(841.89*zoom)};
        const png1=await reference.screenshot({clip,scale:'css'}),png2=await actual.screenshot({clip,scale:'css'});
        const difference=await actual.evaluate(async images=>{
          const load=async source=>{const im=new Image();im.src='data:image/png;base64,'+source;await im.decode();const c=document.createElement('canvas');c.width=im.width;c.height=im.height;const ctx=c.getContext('2d');ctx.drawImage(im,0,0);return ctx.getImageData(0,0,c.width,c.height).data;};
          const [a,b]=await Promise.all(images.map(load));let different=0;for(let i=0;i<a.length;i+=4)if(a[i]!==b[i]||a[i+1]!==b[i+1]||a[i+2]!==b[i+2]||a[i+3]!==b[i+3])different++;return different;
        },[png1.toString('base64'),png2.toString('base64')]);
        expect(difference,`${filename} original text ink at ${zoom}x`).toBe(0);
        pixelDiffs.push(difference);
      }
      report.push({floor,glyphs:glyphs.length,paintScope:glyphs.length ? 'lettering' : 'whole drawing including flattened lettering',...geometry,leaderAudit,pixelDiffs});
      console.log('Lettering',testInfo.project.name,filename,glyphs.length,'glyphs; pixel diff',pixelDiffs);
    } finally { await reference.close();await actual.close(); }
  }
  await testInfo.attach('lettering-audit',{body:JSON.stringify(report,null,2),contentType:'application/json'});
});
