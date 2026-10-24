import { build } from 'vite';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, mkdtemp, symlink, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { candidateSource } from './next-optimization-candidates.mjs';
const root = process.cwd(), output = resolve('output/next-optimizations-safari-2026-10-24');
const candidate = process.argv[2] ?? 'ui-cache';
const published = '2a07e9e4b80083197639a66bdba0994f2f4c5087', dev = 'cb403e0a0c882b0de79ae0182a3a98988f9097e4';
const sha = v => createHash('sha256').update(v).digest('hex');
const git = (...args) => execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], { encoding: 'utf8', maxBuffer: 128*1024*1024 }).trim();
assert.equal(git('branch', '--show-current'), 'Version3.1');
// The branch may contain later documentation commits; exports stay pinned.
git('cat-file', '-e', published + '^{commit}');
git('cat-file', '-e', dev + '^{commit}');
await mkdir(output,{recursive:true});
let evidence;
try { evidence=JSON.parse(await readFile(join(output,'builds.json'),'utf8')); assert.equal(evidence.published,published); }
catch {
 evidence={published,dev,variants:{},createdAt:new Date().toISOString(),sourceWorktree:git('status','--short')};
 for (const [variant,commit] of [['baseline',dev],['version31',published]]) {
  const exported=await realpath(await mkdtemp('/tmp/oic-next-'+variant+'-'));
  execFileSync('tar',['-x','-C',exported],{input:execFileSync('git',['archive',commit],{maxBuffer:128*1024*1024})});
  await symlink(join(root,'node_modules'),join(exported,'node_modules'));
  const dist=join(exported,'dist');
  await build({root:exported,configFile:join(exported,'vite.config.js'),build:{outDir:dist,manifest:true,emptyOutDir:true}});
  evidence.variants[variant]={root:exported,dist,commit,mainSha256:sha(await readFile(join(exported,'src/main.js')))};
  await writeFile(join(output,'builds.json'),JSON.stringify(evidence,null,2));
 }
}
const sourceRoot=evidence.variants.version31.root;
const configTemplate = await readFile(new URL('./next-optimizations-playwright.config.template.mjs', import.meta.url), 'utf8');
const configMarker = '"__OIC_NEXT_BENCHMARK_SERVER__"';
assert.equal(configTemplate.split(configMarker).length, 2);
await writeFile(join(sourceRoot, 'playwright-next.config.mjs'), configTemplate.replace(
  configMarker, JSON.stringify(join(root, 'scripts/benchmarks/serve-next-static.mjs')),
));
const dist=resolve('/tmp/oic-next-'+candidate+'-dist'),changes=[];
await build({root:sourceRoot,configFile:join(sourceRoot,'vite.config.js'),plugins:[{
 name:'isolated-next-'+candidate,enforce:'pre',transform(code,id){
  const file=id.split('?')[0].slice(sourceRoot.length+1);
  if(!['src/main.js','src/food-guide-viewer.js'].includes(file))return;
  const next=candidateSource(code,file,candidate);
  if(next!==code){changes.push({file,before:sha(code),after:sha(next)});return {code:next,map:null};}
 }
}],build:{outDir:dist,manifest:true,emptyOutDir:true}});
assert.ok(changes.length);
const a=JSON.parse(await readFile(join(evidence.variants.version31.dist,'.vite/manifest.json'),'utf8'));
const b=JSON.parse(await readFile(join(dist,'.vite/manifest.json'),'utf8'));let images=0;
for(const[key,entry]of Object.entries(a))if(key.includes('/floors/')||key.startsWith('_food-map-')){
 assert.ok(b[key],key);assert.equal(sha(await readFile(join(evidence.variants.version31.dist,entry.file))),sha(await readFile(join(dist,b[key].file))));images++;
}assert.equal(images,18);
evidence.variants[candidate]={root:sourceRoot,dist,commit:published,changes,svgAssetsIdenticalToPublished:images,builtAt:new Date().toISOString()};
await writeFile(join(output,'builds.json'),JSON.stringify(evidence,null,2));
await writeFile(join(output,candidate+'-main.js'),candidateSource(await readFile(join(sourceRoot,'src/main.js'),'utf8'),'src/main.js',candidate));
console.log(JSON.stringify({candidate,dist,changes,images}));
