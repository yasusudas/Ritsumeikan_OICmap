// Isolated experiment: keep vanilla Dev intact; remove only the periodic redraw.
import { build } from 'vite';
import { resolve } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root=resolve(new URL('../../',import.meta.url).pathname);
execFileSync('git',['diff','--quiet','origin/dev','--','src','public','index.html','en','vite.config.js','package.json','package-lock.json'],{cwd:root});
const source=await readFile(resolve(root,'src/main.js'),'utf8');
const removed=`    if (defer && state.zoom !== state.lastFlushedZoom) {
      state.zoomFramesSinceRaster += 1;
      defer = state.zoomFramesSinceRaster < ZOOM_RASTER_EVERY_FRAMES;
    }
`;
assert.equal(source.split(removed).length-1,1);
const candidate=source.replace(removed,'');
const out=resolve(process.argv[2]??'/tmp/oic-scale-candidate');
await build({root,configFile:resolve(root,'vite.config.js'),plugins:[{name:'scale-only-during-zoom',enforce:'pre',transform(code,id){
  if(id.split('?')[0]!==resolve(root,'src/main.js'))return;
  assert.equal(code,source);return{code:candidate,map:null};
}}],build:{outDir:out,manifest:true,emptyOutDir:true}});
const evidence=resolve(process.argv[3]??'output/scale-only-safari-2026-10-21');await mkdir(evidence,{recursive:true});
await writeFile(resolve(evidence,'source-change.json'),JSON.stringify({commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),
  removed,sourceSha256:createHash('sha256').update(source).digest('hex'),candidateSha256:createHash('sha256').update(candidate).digest('hex'),
  onlyChange:'remove periodic every-fourth-zoom-frame redraw; keep 140ms settle redraw, SVGs, maxZoom and all other app code'},null,2));
