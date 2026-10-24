import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const baseline=resolve(process.argv[2]??'/tmp/oic-frequency-baseline');
const roots={baseline,...Object.fromEntries([2,3,4,5].map(n=>[`every-${n}`,`/tmp/oic-frequency-${n}`]))};
const output=resolve(process.argv[3]??'output/redraw-frequency-safari-2026-10-21'), port=Number(process.argv[4]??5195);
await mkdir(output,{recursive:true});
const sha=value=>createHash('sha256').update(value).digest('hex');
const manifest=JSON.parse(await readFile(join(baseline,'.vite/manifest.json'),'utf8')), images=[];
for(const[source,asset]of Object.entries(manifest)){
  if(!source.includes('/floors/')&&!source.startsWith('_food-map-'))continue;
  const a=await readFile(join(baseline,asset.file)); for(const root of Object.values(roots))assert.equal(sha(a),sha(await readFile(join(root,asset.file))));
  images.push({source,file:asset.file,sha256:sha(a),bytes:a.length,
    language:source.includes('/en/')||source.includes('food-map-en')?'en':'ja',
    floor:source.startsWith('_food-map-')?'1F-viewer':source.split('/').at(-1).replace('.svg','')});
}
const metadata={commit:execFileSync('git',['rev-parse','origin/dev'],{encoding:'utf8'}).trim(),baseline,roots,output,
  variants:['baseline','every-2','every-3','every-4','every-5'],images,cases:[{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}],
  baselinePolicy:'every fourth changed zoom frame plus 140ms after settle',candidatePolicy:'redraw every N changed zoom frames (2/3/4/5), or 140ms after settle',
  previousImprovements:{svgo:false,maskFilterReplacement:false,leaflet:false,maxZoomChange:false},createdAt:new Date().toISOString()};
await writeFile(join(output,'assets.json'),JSON.stringify(metadata,null,2));
const requests={failures:[]};
const html=`<!doctype html><html lang="ja"><meta charset="UTF-8"><title>Dev / redraw interval / Safari</title><style>body{margin:0;background:#e9edf0;font:14px system-ui;color:#17212b}header{padding:12px 20px;height:100px;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}button,a{margin-right:12px}iframe{display:block;border:0;width:960px;height:800px;margin:0 auto;background:white}#status{font-variant-numeric:tabular-nums}</style><header><h1>Vanilla Dev / 1/2 · 1/3 · 1/4 · 1/5 / Safari</h1><button id="perf">FPS比較</button><button id="stop" disabled>停止後の描画</button><a href="/baseline/" target="_blank">Vanilla Dev</a><div id="status">待機中</div></header><iframe id="app" title="比較対象の地図"></iframe><script type="module" src="/bench.js"></script></html>`;
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
  if(url.pathname==='/bench.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('./redraw-frequency-safari-page.js',import.meta.url)));return;}
  if(url.pathname==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end('/* isolated experiment, no caches */');return;}
  if(url.pathname.startsWith('/_vercel/')){res.setHeader('Content-Type','text/javascript');res.end('');return;}
  const match=url.pathname.match(/^\/(baseline|every-2|every-3|every-4|every-5)\/(.*)$/);let relative=decodeURIComponent(match?.[2]??url.pathname.slice(1));if(!relative||relative.endsWith('/'))relative+='index.html';
  const root=roots[match?.[1]??'baseline'],file=resolve(root,relative);assert.ok(file.startsWith(root+'/'));
  res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(e){requests.failures.push({url:req.url,error:String(e),time:new Date().toISOString()});res.writeHead(404).end(String(e));}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,url:`http://127.0.0.1:${port}/`,output,images:images.length})));
