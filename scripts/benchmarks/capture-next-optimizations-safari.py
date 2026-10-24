"""Lossless native Safari screenshots, kept separate from unrecorded FPS runs."""
import argparse,hashlib,json,subprocess,time,urllib.request,urllib.parse
from pathlib import Path
out=Path('output/next-optimizations-safari-2026-10-24').resolve();base='http://127.0.0.1:5211/'
p=argparse.ArgumentParser();p.add_argument('variants',nargs='+');p.add_argument('--window-id',type=int,default=59248);p.add_argument('--camera',choices=['room','centered'],default='room');args=p.parse_args()
assert all(v in ['baseline','version31','ui-cache','geometry-cache','adaptive-raster','hybrid']for v in args.variants)
info=json.loads(subprocess.check_output(['swift','-module-cache-path','/tmp/oic-next-swift-cache',str(Path(__file__).with_name('find-macos-window.swift')),'Safari','Next optimizations'],text=True));w=next(x for x in info if x['kCGWindowNumber']==args.window_id);bounds=w['kCGWindowBounds'];manifest_path=out/'capture-manifest.json';manifest=json.loads(manifest_path.read_text())if manifest_path.exists()else[]
def wait(name,started,timeout=60):
 end=time.monotonic()+timeout
 while time.monotonic()<end:
  f=out/(name+'.json')
  if f.exists()and f.stat().st_mtime>started:return json.loads(f.read_text())
  f=out/'failure.json'
  if f.exists()and f.stat().st_mtime>started:raise RuntimeError(f.read_text())
  time.sleep(.1)
 raise TimeoutError(name)
def capture(name,data):
 target=out/(name+'.png');command=['/usr/sbin/screencapture','-x','-o','-t','png','-l',str(args.window_id),str(target)]
 subprocess.run(command,check=True,timeout=20);raw=target.read_bytes();assert raw.startswith(b'\x89PNG\r\n\x1a\n')and len(raw)>10000
 manifest.append({'file':target.name,'bounds':bounds,'parentViewport':data['environment']['parentViewport'],'sha256':hashlib.sha256(raw).hexdigest(),'at':time.time(),'command':command});manifest_path.write_text(json.dumps(manifest,indent=2))
for language in ['ja','en']:
 for steps in [20,23]:
  for variant in args.variants:
   name=f'quality-{args.camera}-{variant}-{language}-1F-{steps}';started=time.time();url=base+'?'+urllib.parse.urlencode({'run':'quality','candidate':variant,'variant':variant,'language':language,'floor':'1F','steps':steps,'camera':'room'if args.camera=='room'else'center','auto':1,'controlled':1})
   script=f'tell application "Safari"\nactivate\nset URL of current tab of window id {args.window_id} to "{url}"\nend tell'
   subprocess.run(['osascript','-e',script],check=True,timeout=25)
   d=wait(name+'-moving',started);assert not d['errors'];assert d['heldSettleCallbacks']>0 or d['state']['scale']==1
   capture(name+'-moving',d)
   urllib.request.urlopen(urllib.request.Request(base+'captured?name='+name,method='POST'),timeout=10).read()
   d=wait(name+'-stopped',started);assert not d['errors']and d['state']['scale']==1;capture(name+'-stopped',d)
   print(name,'moving and stopped saved',flush=True)
