import {createServer} from 'node:http';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,join,extname} from 'node:path';
import assert from 'node:assert/strict';
const output=resolve('output/version31-combined-safari-2026-10-24'),port=5210;
await mkdir(output,{recursive:true});
const evidence=JSON.parse(await readFile(join(output,'build-evidence.json'),'utf8'));
const metadata={...evidence,candidateVariant:'version31',cases:[{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}],protocol:'960x800 iframe; 8 balanced pairs per language on 1F; 4 on 5F; unrecorded primary; separate recording'};
const requests={failures:[]};const captureWaiters=new Map(),captureAcknowledged=new Set();
const html=`<!doctype html><html lang="ja"><meta charset="UTF-8"><title>Safari / Dev vs Version3.1</title><style>body{margin:0;background:#e9edf0;font:14px system-ui;color:#17212b}header{padding:12px 20px;height:100px;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}button{margin-right:12px}iframe{display:block;border:0;width:960px;height:800px;margin-left:32.5px;background:white}#status{font-variant-numeric:tabular-nums;position:absolute;right:20px;top:58px;font-weight:bold}</style><header><h1>Safari — 改善なしDev / Version3.1</h1><button id="perf">FPS比較</button><button id="stop" disabled>停止後の描画</button><div id="status">準備OK</div></header><iframe id="app" title="比較対象の地図"></iframe><script type="module" src="/bench.js"></script></html>`;
// Both builds receive identical fixture-only isolation before their application module.
const isolation=`<script>window.__benchmarkErrors=[];addEventListener('error',e=>window.__benchmarkErrors.push(String(e.message)));addEventListener('unhandledrejection',e=>window.__benchmarkErrors.push(String(e.reason)));try{navigator.geolocation.watchPosition=function(success,error){setTimeout(()=>error&&error({code:1,message:'Benchmark: location disabled'}),0);return 1};navigator.geolocation.clearWatch=function(){};navigator.geolocation.getCurrentPosition=function(success,error){setTimeout(()=>error&&error({code:1,message:'Benchmark: location disabled'}),0)}}catch(e){};try{Object.defineProperty(navigator,'serviceWorker',{value:{register:async()=>({installing:null,waiting:null,active:null,addEventListener(){}}),ready:new Promise(()=>{}),controller:null,addEventListener(){},getRegistration:async()=>undefined,getRegistrations:async()=>[]}})}catch(e){};<\/script>`;
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,`http://127.0.0.1:${port}`);res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/save'&&req.method==='POST'){const chunks=[];for await(const c of req)chunks.push(c);const p=JSON.parse(Buffer.concat(chunks));assert.match(p.name,/^[\w-]+$/);await writeFile(join(output,p.name+(p.png?'.png':'.json')),p.png?Buffer.from(p.png,'base64'):JSON.stringify(p.data,null,2));return res.end('ok')}
 if(url.pathname==='/wait-capture'){const name=url.searchParams.get('name');if(captureAcknowledged.has(name)){captureAcknowledged.delete(name);return res.end('captured')}captureWaiters.set(name,res);return}
 if(url.pathname==='/captured'&&req.method==='POST'){const name=url.searchParams.get('name');if(captureWaiters.has(name)){captureWaiters.get(name).end('captured');captureWaiters.delete(name)}else captureAcknowledged.add(name);return res.end('ok')}
 if(url.pathname==='/metadata'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(metadata))}
 if(url.pathname==='/requests'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(requests))}
 if(url.pathname==='/'){res.setHeader('Content-Type','text/html');return res.end(html)}
 if(url.pathname==='/bench.js'){res.setHeader('Content-Type','text/javascript');return res.end(await readFile(new URL('./version31-safari-page.js',import.meta.url)))}
 if(url.pathname==='/sw.js'||url.pathname.startsWith('/_vercel/')){res.setHeader('Content-Type','text/javascript');return res.end('/* benchmark isolation */')}
 const match=url.pathname.match(/^\/(baseline|version31)\/(.*)$/);let relative=decodeURIComponent(match?.[2]??url.pathname.slice(1));if(!relative||relative.endsWith('/'))relative+='index.html';
 const root=match?.[1]==='version31'?evidence.candidate:evidence.baseline,file=resolve(root,relative);assert.ok(file.startsWith(root+'/'));
 let content=await readFile(file);if(extname(file)==='.html'){content=content.toString().replace('<head>','<head>'+isolation).replace(/<link[^>]+(?:fonts\.googleapis|fonts\.gstatic)[^>]*>/g,'');}
 res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(content);
 }catch(e){requests.failures.push({url:req.url,error:String(e)});res.writeHead(404).end(String(e))}
}).listen(port,'127.0.0.1',()=>console.log(`Safari comparison http://127.0.0.1:${port}/`));
