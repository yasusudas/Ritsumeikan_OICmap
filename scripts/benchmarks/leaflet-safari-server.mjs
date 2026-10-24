// SVGs come byte-for-byte from vanilla Dev. Tiles bake in the original masks and
// filters with librsvg/sharp; no SVGO or previous opacity replacement is used.
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir, stat, readdir } from 'node:fs/promises';
import { resolve, join, extname } from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const tools = process.env.LEAFLET_TOOLS ?? '/tmp/oic-leaflet-tools/node_modules';
const require = createRequire(resolve(tools, '../package.json'));
const sharp = require('sharp');
const baseline = resolve(process.argv[2] ?? '/tmp/oic-leaflet-baseline');
const candidate = resolve(process.argv[3] ?? '/tmp/oic-leaflet-candidate');
const output = resolve(process.argv[4] ?? 'output/leaflet-safari-2026-10-21');
const port = Number(process.argv[5] ?? 5193);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const manifest = JSON.parse(await readFile(join(baseline, '.vite/manifest.json'), 'utf8'));
const images = [], sourceByName = new Map(), tileCache = new Map();
const tileStats = { generated: 0, hits: 0, bytes: 0, generationMs: 0, requests: 0, failures: [] };
await mkdir(join(output,'tiles'), { recursive: true });
for (const [source,asset] of Object.entries(manifest)) {
  if (!source.includes('/floors/') && !source.startsWith('_food-map-')) continue;
  const svg = await readFile(join(baseline,asset.file),'utf8');
  const vb = svg.match(/\bviewBox=["']([^"']+)/)[1].trim().split(/[ ,]+/).map(Number);
  const language = source.includes('/en/') || source.includes('food-map-en') ? 'en' : 'ja';
  const floor = source.startsWith('_food-map-') ? '1F-viewer' : source.split('/').at(-1).replace('.svg','');
  const item = { source, file: asset.file, language, floor, viewBox: vb, bytes: Buffer.byteLength(svg), sha256: sha(svg),
    masks: (svg.match(/<mask\b/g)??[]).length, filters: (svg.match(/<filter\b/g)??[]).length };
  const candidateBytes = await readFile(join(candidate,asset.file));
  if (sha(candidateBytes) !== item.sha256) throw Error('Candidate source SVG differs from vanilla Dev: '+source);
  images.push(item); sourceByName.set(asset.file.split('/').at(-1), { svg, vb, item });
}
const sourceCommit = execFileSync('git',['rev-parse','dev'],{encoding:'utf8'}).trim();
const metadata = { commit: sourceCommit, baseline, candidate, output, candidateVariant: 'leaflet',
  leafletVersion: require('leaflet/package.json').version, rasterizer: sharp.versions,
  tile: { cssSize: 256, pngSize: 514, contentPixels: 512, gutterPixels: 1, blendMode: 'normal', worldWidth: 1024, minNativeZoom: 0, maxNativeZoom: 4, keepBuffer: 1 },
  previousImprovements: { svgo: false, maskFilterReplacement: false, scalePolicyChange: false, maxZoomChange: false },
  cases: [{language:'ja',floor:'1F'},{language:'en',floor:'1F'},{language:'ja',floor:'5F'},{language:'en',floor:'5F'}],
  prewarmCandidate: true, images, createdAt: new Date().toISOString() };
await writeFile(join(output,'assets.json'),JSON.stringify(metadata,null,2));
const page = `<!doctype html><html lang="ja"><meta charset="UTF-8"><title>Vanilla Dev / Leaflet tiles / Safari</title><style>body{margin:0;background:#e9edf0;font:14px system-ui;color:#17212b}header{padding:12px 20px;height:100px;box-sizing:border-box}h1{font-size:20px;margin:0 0 8px}button,a{margin-right:12px}iframe{display:block;border:0;width:960px;height:800px;margin:0 auto;background:white}#status{font-variant-numeric:tabular-nums}</style><header><h1>Vanilla Dev / Leaflet tiles / Safari</h1><button id="visual">表示比較</button><button id="perf">FPS比較</button><a href="/baseline/" target="_blank">Vanilla Dev</a><a href="/leaflet/" target="_blank">Leaflet tiles</a><div id="status">待機中</div></header><iframe id="app" title="比較対象の地図"></iframe><script type="module" src="/bench.js"></script></html>`;
const types={'.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.html':'text/html','.json':'application/json','.png':'image/png','.webp':'image/webp','.woff2':'font/woff2'};
const server=createServer(async(req,res)=>{try{
  const url=new URL(req.url,`http://127.0.0.1:${port}`);res.setHeader('Cache-Control','no-store');
  if(url.pathname==='/save'&&req.method==='POST'){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const payload=JSON.parse(Buffer.concat(chunks).toString());
    if(!/^[\w-]+$/.test(payload.name))throw Error('Invalid evidence name');
    await writeFile(join(output,payload.name+(payload.png?'.png':'.json')),payload.png?Buffer.from(payload.png,'base64'):JSON.stringify(payload.data,null,2));res.end('ok');return;
  }
  if(url.pathname==='/metadata'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(metadata));return;}
  if(url.pathname==='/tile-stats'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify(tileStats));return;}
  if(url.pathname==='/'){res.setHeader('Content-Type','text/html');res.end(page);return;}
  if(url.pathname==='/bench.js'){res.setHeader('Content-Type','text/javascript');res.end(await readFile(new URL('./leaflet-safari-page.js',import.meta.url)));return;}
  if(url.pathname==='/sw.js'){res.setHeader('Content-Type','text/javascript');res.end('/* isolated experiment: no cache handlers */');return;}
  if(url.pathname.startsWith('/_vercel/')){res.setHeader('Content-Type','text/javascript');res.end('');return;}
  const tile=url.pathname.match(/^\/tiles\/([^/]+)\/(\d+)\/(-?\d+)\/(-?\d+)\.png$/);
  if(tile){
    tileStats.requests++;const[,filename,zText,xText,yText]=tile,z=Number(zText),x=Number(xText),y=Number(yText);
    const source=sourceByName.get(filename);if(!source||z>4)throw Error('Unknown tile');
    const key=`${filename}-${z}-${x}-${y}-g1`;let png=tileCache.get(key);
    if(!png){
      const file=join(output,'tiles',key+'.png');try{png=await readFile(file);tileStats.hits++;}catch{
        const started=performance.now(),units=256/2**z,factor=source.vb[2]/1024;
        const gutter=units*factor/512;
        const viewBox=[source.vb[0]+x*units*factor-gutter,source.vb[1]+y*units*factor-gutter,units*factor+2*gutter,units*factor+2*gutter];
        // Only the export viewport changes. Paths, masks and filters remain intact.
        const svg=source.svg.replace(/<svg\b[^>]*>/,tag=>tag.replace(/\bwidth=["'][^"']*["']/,'width="514"').replace(/\bheight=["'][^"']*["']/,'height="514"').replace(/\bviewBox=["'][^"']*["']/,`viewBox="${viewBox.join(' ')}"`));
        png=await sharp(Buffer.from(svg)).png().toBuffer();
        tileStats.generated++;tileStats.bytes+=png.length;tileStats.generationMs+=performance.now()-started;
        await writeFile(file,png);
      }tileCache.set(key,png);
    }else tileStats.hits++;
    res.setHeader('Content-Type','image/png');res.end(png);return;
  }
  const match=url.pathname.match(/^\/(baseline|leaflet)\/(.*)$/),variant=match?.[1]??'baseline';let relative=decodeURIComponent(match?.[2]??url.pathname.slice(1));
  if(!relative||relative.endsWith('/'))relative+='index.html';const root=variant==='leaflet'?candidate:baseline,file=resolve(root,relative);
  if(!file.startsWith(root+'/')){res.writeHead(403).end();return;}res.setHeader('Content-Type',types[extname(file)]??'application/octet-stream');res.end(await readFile(file));
}catch(error){tileStats.failures.push(String(error));res.writeHead(404);res.end(String(error));}});
server.listen(port,'127.0.0.1',()=>console.log(JSON.stringify({pid:process.pid,url:`http://127.0.0.1:${port}/`,output,images:images.length})));
