// Isolated experiment: change only the redraw interval, including an identical 1/4 control.
import { build } from 'vite';
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(new URL('../../',import.meta.url).pathname);
execFileSync('git',['diff','--quiet','origin/dev','--','src','public','index.html','en','vite.config.js','package.json','package-lock.json'],{cwd:root});
const source=await readFile(resolve(root,'src/main.js'),'utf8');
const interval=Number(process.argv[2]);
assert.ok([2,3,4,5].includes(interval));
const original='const ZOOM_RASTER_EVERY_FRAMES = 4;';
assert.equal(source.split(original).length-1,1);
const replacement=`const ZOOM_RASTER_EVERY_FRAMES = ${interval};`;
const candidate=source.replace(original,replacement);
const out=resolve(process.argv[3]??`/tmp/oic-frequency-${interval}`);
await build({root,configFile:resolve(root,'vite.config.js'),plugins:[{name:'zoom-redraw-interval',enforce:'pre',transform(code,id){
  if(id.split('?')[0]!==resolve(root,'src/main.js'))return;
  assert.equal(code,source);return{code:candidate,map:null};
}}],build:{outDir:out,manifest:true,emptyOutDir:true}});
const evidence=resolve(process.argv[4]??'output/redraw-frequency-safari-2026-10-21');await mkdir(evidence,{recursive:true});
await writeFile(resolve(evidence,`source-change-${interval}.json`),JSON.stringify({commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),
  interval,original,replacement,sourceSha256:createHash('sha256').update(source).digest('hex'),candidateSha256:createHash('sha256').update(candidate).digest('hex'),
  onlyChange:'replace only ZOOM_RASTER_EVERY_FRAMES; keep 140ms settle redraw, SVGs, maxZoom and all other app code'},null,2));
