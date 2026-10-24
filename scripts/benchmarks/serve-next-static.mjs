import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname} from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(process.argv[2]),port=Number(process.argv[3]??4289);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.json':'application/json','.woff2':'font/woff2'};
createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname.startsWith('/tiles/')){const response=await fetch('http://127.0.0.1:5211'+url.pathname);res.writeHead(response.status,{'Content-Type':'image/png'});res.end(Buffer.from(await response.arrayBuffer()));return;}
 let relative=decodeURIComponent(url.pathname.slice(1));if(!relative||relative.endsWith('/'))relative+='index.html';const file=resolve(root,relative);assert.ok(file.startsWith(root+'/'));res.writeHead(200,{'Content-Type':types[extname(file)]??'application/octet-stream'});res.end(await readFile(file));
}catch(error){res.writeHead(404).end(String(error));}}).listen(port,'127.0.0.1',()=>console.log('Prototype static test server '+port));
