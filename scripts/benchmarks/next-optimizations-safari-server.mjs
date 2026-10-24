import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
const output=resolve('output/next-optimizations-safari-2026-10-24'),port=5211;
await mkdir(output,{recursive:true});
const requests={failures:[]},waiters=new Map(),acknowledged=new Set();
const html=`<!doctype html><html lang="ja"><meta charset="UTF-8"><title>Safari / Next optimizations</title><style>body{margin:0;background:#e9edf0;font:14px system-ui;color:#17212b}header{padding:12px 20px;height:100px;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}button{margin-right:12px}iframe{display:block;border:0;width:960px;height:800px;margin-left:32.5px;background:white}#status{font-variant-numeric:tabular-nums;position:absolute;right:20px;top:58px;font-weight:bold}</style><header><h1>Safari — Dev / Version3.1 / 追加候補</h1><button id="perf">FPS比較</button><button id="stop" disabled>停止後の描画</button><div id="status">準備OK</div></header><iframe id="app" title="比較対象の地図"></iframe><script type="module" src="/bench.js"></script></html>`;
const isolation=`<script>window.__benchmarkErrors=[];addEventListener('error',e=>window.__benchmarkErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>window.__benchmarkErrors.push(String(e.reason)));try{navigator.geolocation.watchPosition=function(success,error){setTimeout(()=>error&&error({code:1,message:'Benchmark location disabled'}),0);return 1};navigator.geolocation.clearWatch=function(){};navigator.geolocation.getCurrentPosition=function(success,error){setTimeout(()=>error&&error({code:1,message:'Benchmark location disabled'}),0)}}catch(e){};try{Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({installing:null,waiting:null,active:null,addEventListener(){}}),ready:new Promise(()=>{}),controller:null,addEventListener(){},getRegistration:async()=>undefined,getRegistrations:async()=>[]}})}catch(e){};<\/script>`;
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,`http://127.0.0.1:${port}`);res.setHeader('Cache-Control','no-store');
 const evidence=JSON.parse(await readFile(join(output,'builds.json'),'utf8'));
 if(url.pathname==='/save'&&req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);const p=JSON.parse(Buffer.concat(chunks));assert.match(p.name,/^[\w-]+$/);await writeFile(join(output,p.name+(p.png?'.png':'.json')),p.png?Buffer.from(p.png,'base64'):JSON.stringify(p.data,null,2));return res.end('ok')}
 if(url.pathname==='/wait-capture'){const name=url.searchParams.get('name');if(acknowledged.has(name)){acknowledged.delete(name);return res.end('captured')}waiters.set(name,res);return}
 if(url.pathname==='/captured'&&req.method==='POST'){const name=url.searchParams.get('name');if(waiters.has(name)){waiters.get(name).end('captured');waiters.delete(name)}else acknowledged.add(name);return res.end('ok')}
 if(url.pathname==='/metadata'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({...evidence,candidateVariant:'ui-cache',cases:[{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}]}))}
 if(url.pathname==='/hybrid-stats'){const module=await import('./next-hybrid-tiles.mjs');res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(module.hybridTileStats))}
 const tile=url.pathname.match(/^\/tiles\/([^/]+)\/(\d+)\/(\d+)\/(\d+)\.png$/);
 if(tile){const module=await import('./next-hybrid-tiles.mjs');res.setHeader('Content-Type','image/png');return res.end(await module.hybridTile(tile[1],Number(tile[2]),Number(tile[3]),Number(tile[4])))}
 if(url.pathname==='/requests'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(requests))}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}
 if(url.pathname==='/bench.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(new URL('./next-optimizations-safari-page.js',import.meta.url)))}
 if(url.pathname==='/sw.js'||url.pathname.startsWith('/_vercel/')){res.setHeader('Content-Type','text/javascript');return res.end('/* isolated fixture */')}
 if(url.pathname==='/favicon.ico')return res.writeHead(204).end();
 const match=url.pathname.match(/^\/([^/]+)\/(.*)$/),variant=match?.[1];
 let relative=decodeURIComponent(evidence.variants[variant]?match[2]:url.pathname.slice(1));if(!relative||relative.endsWith('/'))relative+='index.html';
 const root=evidence.variants[variant]?.dist??evidence.variants.baseline.dist,file=resolve(root,relative);assert.ok(file.startsWith(root+'/'));
 let content=await readFile(file);if(extname(file)==='.html')content=content.toString().replace('<head>','<head>'+isolation).replace(/<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>/g,'');
 res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(content);
 }catch(error){requests.failures.push({url:req.url,error:String(error)});res.writeHead(404).end(String(error))}
});server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,url:`http://127.0.0.1:${port}/`,output})));
