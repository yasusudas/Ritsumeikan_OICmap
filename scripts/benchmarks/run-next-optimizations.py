"""Sequential actual-Safari controller. Never build/capture during main trials."""
import json,time,subprocess,os,signal,sys,urllib.request
from pathlib import Path
root=Path.cwd();out=root/'output/next-optimizations-safari-2026-10-24';python='/Users/ichi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';window=59248
state={'controllerPid':os.getpid(),'stage':'geometry-cache','status':'starting','ownedServerPid':8472};completed=['ui-cache']
def save():
 state['updatedAt']=time.time();(out/'automation-state.json').write_text(json.dumps(state,indent=2))
def command(args,log=None):
 print('COMMAND',' '.join(map(str,args)),flush=True)
 if log:
  with open(out/log,'w')as f:subprocess.run(args,cwd=root,stdout=f,stderr=subprocess.STDOUT,check=True)
 else:subprocess.run(args,cwd=root,check=True)
def open_page(query):
 url='http://127.0.0.1:5211/?'+query
 script=f'tell application "Safari"\nactivate\nset URL of current tab of window id {window} to "{url}"\nend tell'
 command(['osascript','-e',script]);return time.time()
def wait(name,started,timeout=1800,expected=None):
 end=time.monotonic()+timeout;next_progress=0
 while time.monotonic()<end:
  f=out/(name+'.json')
  if f.exists()and f.stat().st_mtime>=started-1:
   data=json.loads(f.read_text());assert not data.get('errors'),data.get('errors')
   if expected is not None:assert len(data['trials'])==expected
   print('COMPLETE',name,flush=True);return data
  failure=out/'failure.json'
  if failure.exists()and failure.stat().st_mtime>started:raise RuntimeError(failure.read_text())
  if time.monotonic()>=next_progress:
   progress=out/(name+'-progress.json');n=len(json.loads(progress.read_text()).get('trials',[]))if progress.exists()else 0
   print('PROGRESS',name,n,flush=True);state.update(status='waiting',result=name,completedTrials=n);save();next_progress=time.monotonic()+30
  time.sleep(1)
 raise TimeoutError(name)
def browser_task(action,candidate,name,expected=None):
 started=open_page('run='+action+'&controlled=1&candidate='+candidate+'&controller=1');return wait(name,started,expected=expected)
def summarize(candidate):
 command(['python3','scripts/benchmarks/summarize-next-optimizations-safari.py',candidate]);completed.append(candidate)
 command(['python3','scripts/benchmarks/capture-next-optimizations-safari.py',candidate,'--camera','room','--window-id',str(window)],'capture-'+candidate+'.log')
 command([python,'scripts/benchmarks/summarize-next-optimizations-quality.py',*completed])
def build(candidate):command(['node','scripts/benchmarks/build-next-optimization.mjs',candidate],'build-'+candidate+'.log')
def power(candidate):
 p=subprocess.run(['swift','-module-cache-path','/tmp/oic-next-swift-cache',str(root/'scripts/benchmarks/inspect-macos-display.swift')],capture_output=True,text=True,check=True);(out/('environment-'+candidate+'.json')).write_text(p.stdout)
try:
 save();state.update(stage='geometry-cache',status='primary');save()
 wait('performance-geometry-cache',0,expected=36);summarize('geometry-cache')
 state.update(stage='adaptive-raster',status='build');save();build('adaptive-raster');power('adaptive-raster')
 browser_task('fine','adaptive-raster','fine-adaptive-raster',4)
 browser_task('checks','adaptive-raster','checks-adaptive-raster',4)
 state.update(status='primary');save();browser_task('perf','adaptive-raster','performance-adaptive-raster',36);summarize('adaptive-raster')
 state.update(stage='hybrid',status='build');save();build('hybrid')
 old=state['ownedServerPid'];args=subprocess.check_output(['ps','-p',str(old),'-o','command='],text=True);assert 'next-optimizations-safari-server.mjs'in args;os.kill(old,signal.SIGTERM);time.sleep(1)
 log=open(out/'server-hybrid.log','w');server=subprocess.Popen(['node','scripts/benchmarks/next-optimizations-safari-server.mjs'],cwd=root,stdout=log,stderr=subprocess.STDOUT);state['ownedServerPid']=server.pid;save()
 for _ in range(100):
  try:urllib.request.urlopen('http://127.0.0.1:5211/metadata',timeout=1).read();break
  except Exception:time.sleep(.1)
 else:raise RuntimeError('new hybrid server not ready')
 power('hybrid');state.update(status='warm');save();browser_task('hybrid-warm','hybrid','hybrid-warm',4)
 before=json.load(urllib.request.urlopen('http://127.0.0.1:5211/hybrid-stats'));(out/'hybrid-stats-before.json').write_text(json.dumps(before,indent=2))
 browser_task('checks','hybrid','checks-hybrid',4)
 state.update(status='primary');save();browser_task('perf','hybrid','performance-hybrid',36)
 after=json.load(urllib.request.urlopen('http://127.0.0.1:5211/hybrid-stats'));(out/'hybrid-stats-after.json').write_text(json.dumps(after,indent=2))
 summarize('hybrid');command(['python3','scripts/benchmarks/summarize-next-optimizations-safari.py',*completed])
 state.update(status='complete',completed=completed);save();print('ALL FOUR CANDIDATES MEASURED',flush=True)
except BaseException as error:
 state.update(status='failed',error=repr(error));save();raise
