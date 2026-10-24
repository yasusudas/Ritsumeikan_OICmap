// On-demand PNG preparation. Main trials must run after an independent warm run.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire('/tmp/oic-leaflet-tools/package.json'),sharp=require('sharp');
const output=resolve('output/next-optimizations-safari-2026-10-24'),directory=join(output,'hybrid-tiles');
const evidence=JSON.parse(await readFile(join(output,'builds.json'),'utf8'));
const root=evidence.variants.version31.dist,manifest=JSON.parse(await readFile(join(root,'.vite/manifest.json'),'utf8'));
const sources=new Map(),pending=new Map();
export const hybridTileStats={generated:0,hits:0,bytes:0,generationMs:0,generations:[],failures:[]};
await mkdir(directory,{recursive:true});
for(const[key,item]of Object.entries(manifest))if(key.includes('/floors/')||key.startsWith('_food-map-')){
 const svg=await readFile(join(root,item.file),'utf8');const vb=svg.match(/\bviewBox=["']([^"']+)/)[1].trim().split(/[ ,]+/).map(Number);
 const tag=svg.match(/<svg\b[^>]*>/)[0];const width=parseFloat(tag.match(/\bwidth=["']([^"']+)/)?.[1])||vb[2],height=parseFloat(tag.match(/\bheight=["']([^"']+)/)?.[1])||vb[3];
 sources.set(item.file.split('/').at(-1),{svg,vb,width,height,sha256:createHash('sha256').update(svg).digest('hex')});
}
export async function hybridTile(file,z,x,y){
 assert.ok(sources.has(file)&&Number.isInteger(z)&&z>=0&&z<=4&&Number.isInteger(x)&&x>=0&&Number.isInteger(y)&&y>=0);
 const key=`${file}-${z}-${x}-${y}`,path=join(directory,key+'.png');
 try{const bytes=await readFile(path);hybridTileStats.hits++;return bytes;}catch{}
 if(pending.has(key))return pending.get(key);
 const job=(async()=>{
  const start=performance.now(),source=sources.get(file),units=256/2**z,factor=source.width/1024,gutter=units*factor/512;
  const vb=[x*units*factor-gutter,y*units*factor-gutter,units*factor+2*gutter,units*factor+2*gutter];
  // Preserve the original nested SVG's viewBox, aspect ratio and viewport clipping.
  const inner=source.svg.replace(/<svg\b[^>]*>/,tag=>tag.replace(/\bwidth=["'][^"']*["']/,`width="${source.width}"`).replace(/\bheight=["'][^"']*["']/,`height="${source.height}"`));
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="514" height="514" viewBox="${vb.join(' ')}">${inner}</svg>`;
  const bytes=await sharp(Buffer.from(svg)).png().toBuffer();await writeFile(path,bytes);hybridTileStats.generated++;hybridTileStats.bytes+=bytes.length;hybridTileStats.generationMs+=performance.now()-start;hybridTileStats.generations.push({file,z,x,y,completedAt:new Date().toISOString(),durationMs:performance.now()-start});return bytes;
 })();pending.set(key,job);try{return await job;}catch(error){hybridTileStats.failures.push({key,error:String(error)});throw error;}finally{pending.delete(key);}
}
