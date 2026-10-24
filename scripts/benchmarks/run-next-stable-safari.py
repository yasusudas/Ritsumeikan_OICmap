"""Rerun all four independent candidates in one stable refresh regime."""
import json,time,subprocess,os,urllib.request
from pathlib import Path
root=Path.cwd();out=root/'output/next-optimizations-safari-2026-10-24';python='/Users/ichi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';variants=['ui-cache','geometry-cache','adaptive-raster','hybrid'];awake=subprocess.Popen(['caffeinate','-dimsu','-t','7200']);state={'pid':os.getpid(),'caffeinatePid':awake.pid,'status':'starting','pairs':2}
def save():state['updatedAt']=time.time();(out/'stable-state.json').write_text(json.dumps(state,indent=2))
def command(args,name=None):
 print('COMMAND',' '.join(args),flush=True)
 if name:
  with open(out/name,'w')as f:subprocess.run(args,cwd=root,check=True,stdout=f,stderr=subprocess.STDOUT)
 else:subprocess.run(args,cwd=root,check=True)
def task(action,candidate,name):
 url=f'http://127.0.0.1:5211/?run={action}&controlled=1&candidate={candidate}&pairs=2'
 started=time.time();command(['osascript','-e',f'tell application "Safari"\nactivate\nset URL of current tab of window id 59248 to "{url}"\nend tell'])
 for tick in range(1200):
  f=out/(name+'.json')
  if f.exists()and f.stat().st_mtime>=started:
   d=json.loads(f.read_text());assert not d.get('errors'),d;print('COMPLETE',name,flush=True);return d
  fail=out/'failure.json'
  if fail.exists()and fail.stat().st_mtime>=started:raise RuntimeError(fail.read_text())
  if tick%30==0:
   f=out/(name+'-progress.json');n=len(json.loads(f.read_text()).get('trials',[]))if f.exists()and f.stat().st_mtime>=started else 0
   state.update(status='measuring',task=name,trials=n);save();print(name,n,flush=True)
  time.sleep(1)
 raise TimeoutError(name)
def power(name):
 p=subprocess.run(['swift','-module-cache-path','/tmp/oic-next-swift-cache',str(root/'scripts/benchmarks/inspect-macos-display.swift')],capture_output=True,text=True,check=True);d=json.loads(p.stdout);assert not d['lowPower']and d['thermalState']==0,d;(out/(name+'.json')).write_text(p.stdout)
try:
 save();power('environment-stable-start');task('health','ui-cache','frame-health');d=json.loads((out/'frame-health.json').read_text());assert 50<d['frames']['fps']<70,d
 # Primary trials run without captures, builds or regression tests alongside them.
 for v in variants:
  state.update(candidate=v,status='primary');save();power('environment-'+v)
  existing=out/('performance-'+v+'.json')
  if existing.exists():
   d=json.loads(existing.read_text());assert not d['errors']and len(d['trials'])==24
   command(['python3','scripts/benchmarks/summarize-next-optimizations-safari.py',v],f'summarize-{v}.log')
   print('RESUME: retaining every original trial',v,flush=True);continue
  if v=='hybrid':task('hybrid-warm',v,'hybrid-warm')
  if v=='hybrid':(out/'hybrid-stats-before.json').write_text(urllib.request.urlopen('http://127.0.0.1:5211/hybrid-stats').read().decode())
  d=task('perf',v,'performance-'+v);assert len(d['trials'])==24
  if v=='hybrid':(out/'hybrid-stats-after.json').write_text(urllib.request.urlopen('http://127.0.0.1:5211/hybrid-stats').read().decode())
  command(['python3','scripts/benchmarks/summarize-next-optimizations-safari.py',v],f'summarize-{v}.log')
 power('environment-stable-end');state.update(status='diagnostics');save()
 task('fine','adaptive-raster','fine-adaptive-raster')
 for v in variants:task('checks',v,'checks-'+v)
 command(['python3','scripts/benchmarks/capture-next-optimizations-safari.py','baseline','version31',*variants],'capture-stable.log')
 command([python,'scripts/benchmarks/summarize-next-optimizations-quality.py',*variants],'quality-stable.log')
 command(['python3','scripts/benchmarks/summarize-next-optimizations-safari.py',*variants],'summary-stable.log')
 state.update(status='complete');save()
except BaseException as e:
 state.update(status='failed',error=repr(e));save();raise
finally:awake.terminate();awake.wait(timeout=10)
