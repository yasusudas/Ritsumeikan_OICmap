// Isolated Vite transforms: change only the maxZoom state initializer.
import {build} from 'vite';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const root=process.cwd(),output=resolve('output/max-zoom-safari-2026-10-21');
execFileSync('git',['-c','core.fsmonitor=false','diff','--quiet','origin/dev','--','src','public','index.html','en','vite.config.js','package.json','package-lock.json']);
const source=await readFile('src/main.js','utf8'),original='    maxZoom: 10,';
assert.equal(source.split(original).length-1,1);await mkdir(output,{recursive:true});
const evidence={commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),sourceSha256:createHash('sha256').update(source).digest('hex'),onlyChange:'maxZoom initializer; original 1/4 cadence, flush+140ms timer, SVGs, input handlers, search focus and dependencies unchanged',candidates:[]};
for(const maxZoom of [2,4,6]){
 const replacement=`    maxZoom: ${maxZoom},`,code=source.replace(original,replacement),outDir=`/tmp/oic-max-zoom-${maxZoom}`;
 await build({root,configFile:resolve('vite.config.js'),plugins:[{name:'max-zoom-only',enforce:'pre',transform(input,id){if(id.split('?')[0]!==resolve('src/main.js'))return;assert.equal(input,source);return {code,map:null};}}],build:{outDir,manifest:true,emptyOutDir:true}});
 evidence.candidates.push({maxZoom,outDir,original,replacement,sha256:createHash('sha256').update(code).digest('hex')});
 await writeFile(resolve(output,`candidate-${maxZoom}.patch`),`--- vanilla-dev/src/main.js\n+++ max-${maxZoom}/src/main.js\n@@ -292 +292 @@\n-${original}\n+${replacement}\n`);
}
await writeFile(resolve(output,'build-evidence.json'),JSON.stringify(evidence,null,2));
