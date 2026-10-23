"""Scripted native macOS PNG/video capture, no Computer Use for capture.
Run after unrecorded FPS trials. Safari page is opened with macOS open(1).
"""
import argparse,hashlib,json,subprocess,time,urllib.request,urllib.parse
from pathlib import Path
out=Path('output/version31-combined-safari-2026-10-24').resolve()
base='http://127.0.0.1:5210/'
p=argparse.ArgumentParser();p.add_argument('mode',choices=['quality','video']);p.add_argument('--window-id',type=int);p.add_argument('--bounds');args=p.parse_args()
if args.window_id is None:
 info=json.loads(subprocess.check_output(['swift',str(Path(__file__).with_name('find-macos-window.swift')),'Safari','Dev vs Version3.1'],text=True));assert info,'Safari comparison window not found'
 args.window_id=info[0]['kCGWindowNumber'];b=info[0]['kCGWindowBounds'];bounds=[b['X'],b['Y'],b['Width'],b['Height']]
else:
 assert args.bounds,'--bounds x,y,width,height is required with explicit --window-id'
 bounds=list(map(int,args.bounds.split(',')))
manifest=[]
def open_page(query):subprocess.run(['open','-a','Safari',base+'?'+urllib.parse.urlencode(query)],check=True)
def wait_json(name,started,timeout=55):
 deadline=time.monotonic()+timeout;path=out/(name+'.json')
 while time.monotonic()<deadline:
  if path.exists() and path.stat().st_mtime>started:
   try:return json.loads(path.read_text())
   except json.JSONDecodeError:pass
  failure=out/'failure.json'
  if failure.exists() and failure.stat().st_mtime>started:raise RuntimeError(failure.read_text())
  time.sleep(.1)
 raise TimeoutError(name)
def capture(name,data):
 path=out/(name+'.png');cmd=['/usr/sbin/screencapture','-x','-o','-t','png','-l',str(args.window_id),str(path)]
 subprocess.run(cmd,check=True,timeout=20);assert path.stat().st_size>10000;assert path.read_bytes().startswith(b'\x89PNG\r\n\x1a\n')
 manifest.append(dict(file=path.name,windowId=args.window_id,bounds=bounds,parentViewport=data['environment']['parentViewport'],capturedAt=time.time(),sha256=hashlib.sha256(path.read_bytes()).hexdigest(),command=cmd))
 (out/'script-capture-manifest.json').write_text(json.dumps(manifest,indent=2))
if args.mode=='quality':
 for language in ['ja','en']:
  for steps in [20,23]:
   for variant in ['baseline','version31']:
    name=f'quality-centered-{variant}-{language}-1F-{steps}';started=time.time()
    open_page(dict(run='quality',variant=variant,language=language,floor='1F',steps=steps,camera='center',auto=1))
    d=wait_json(name+'-moving',started);assert d['heldSettleCallbacks']>0 and not d['errors'];capture(name+'-moving',d)
    urllib.request.urlopen(urllib.request.Request(base+'captured?name='+name,method='POST'),timeout=10).read()
    d=wait_json(name+'-stopped',started);assert d['state']['scale']==1 and not d['errors'];capture(name+'-stopped',d)
    print(name,'saved moving/stopped',flush=True)
else:
 # Capture only the chosen window, even when another app covers it. No audio.
 # Use viewport metadata to crop browser chrome from the viewing MP4 afterward.
 started=time.time();open_page(dict(run='video',controlled=1));startup=wait_json('video-startup',started)
 # Record long enough to include all four labeled cases and completion.
 x,y,w,h=bounds;chrome=h-startup['parentViewport'][1]
 path=out/'safari-version31-comparison-original.mov'
 cmd=['/usr/sbin/screencapture','-v','-o','-V','75','-l',str(args.window_id),str(path)]
 print('recording',path,flush=True);record_start=time.time();subprocess.run(cmd,check=True,timeout=90);record_end=time.time()
 data=wait_json('video-demonstration',started,timeout=20)
 (out/'recording-metadata.json').write_text(json.dumps(dict(command=cmd,windowId=args.window_id,bounds=bounds,startedAt=started,recordStartedAt=record_start,recordEndedAt=record_end,videoData=data['environment'],contentCrop=[0,chrome,w,h-chrome],captureScope='Safari window ID only, independent of desktop occlusion',note='Separate controlled demonstration, excluded from unrecorded FPS; no audio'),indent=2));print('recorded',path,flush=True)
