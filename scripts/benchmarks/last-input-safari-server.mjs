import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const baseline=resolve(process.argv[2]??'/tmp/oic-last-input-baseline'), candidate=resolve(process.argv[3]??'/tmp/oic-last-input-candidate');
const output=resolve(process.argv[4]??'output/last-input-safari-2026-10-21'), port=Number(process.argv[5]??5199);
await mkdir(output,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(await readFile(join(baseline,'.vite/manifest.json'),'utf8')), images=[];
for(const[source,asset]of Object.entries(manifest)){
  if(!source.includes('/floors/')&&!source.startsWith('_food-map-'))continue;
  const a=await readFile(join(baseline,asset.file)),b=await readFile(join(candidate,asset.file));assert.equal(sha(a),sha(b));
  images.push({source,file:asset.file,sha256:sha(a),bytes:a.length,
    language:source.includes('/en/')||source.includes('food-map-en')?'en':'ja',
    floor:source.startsWith('_food-map-')?'1F-viewer':source.split('/').at(-1).replace('.svg','')});
}
const metadata={commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),baseline,candidate,output,
  candidateVariant:'last-input',images,cases:[{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}],
  baselinePolicy:'every fourth changed zoom frame plus 140ms after settle',candidatePolicy:'every fourth changed zoom frame; settle 140ms from last processed input',
  previousImprovements:{svgo:false,maskFilterReplacement:false,leaflet:false,maxZoomChange:false},createdAt:new Date().toISOString()};
await writeFile(join(output,'assets.json'),JSON.stringify(metadata,null,2));
const requests={failures:[]};
const html=`<!doctype html><html lang="ja"><meta charset="UTF-8"><title>Dev / last-input 140ms / Safari</title><style>body{margin:0;background:#e9edf0;font:14px system-ui;color:#17212b}header{padding:12px 20px;height:100px;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}button,a{margin-right:12px}iframe{display:block;border:0;width:960px;height:800px;margin:0 auto;background:white}#status{font-variant-numeric:tabular-nums}</style><header><h1>Vanilla Dev / last input + 140ms / Safari</h1><button id="perf">FPS比較</button><button id="stop" disabled>停止後の描画</button><a href="/baseline/" target="_blank">Vanilla Dev</a><a href="/last-input/" target="_blank">Last input 140ms</a><div id="status">待機中</div></header><iframe id="app" title="比較対象の地図"></iframe><script type="module" src="/bench.js"></script></html>`;
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/save'&&req.method==='POST'){
    const chunks=[];for await(const c of req)chunks.push(c);const payload=JSON.parse(Buffer.concat(chunks));assert.match(payload.name,/^[\w-]+$/);
    await writeFile(join(output,payload.name+(payload.png?'.png':'.json')),payload.png?Buffer.from(payload.png,'base64'):JSON.stringify(payload.data,null,2));res.end('ok');return;
  }
  if(url.pathname==='/metadata'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(metadata));return;}
  if(url.pathname==='/requests'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(requests));return;}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(html);return;}
  if(url.pathname==='/bench.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('./last-input-safari-page.js',import.meta.url)));return;}
  if(url.pathname==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end('/* isolated experiment, no caches */');return;}
  if(url.pathname.startsWith('/_vercel/')){res.setHeader('Content-Type','text/javascript');res.end('');return;}
  const match=url.pathname.match(/^\/(baseline|last-input)\/(.*)$/);let relative=decodeURIComponent(match?.[2]??url.pathname.slice(1));if(!relative||relative.endsWith('/'))relative+='index.html';
  const root=match?.[1]==='last-input'?candidate:baseline,file=resolve(root,relative);assert.ok(file.startsWith(root+'/'));
  res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(e){requests.failures.push({url:req.url,error:String(e),time:new Date().toISOString()});res.writeHead(404).end(String(e));}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,url:`http://127.0.0.1:${port}/`,output,images:images.length})));
