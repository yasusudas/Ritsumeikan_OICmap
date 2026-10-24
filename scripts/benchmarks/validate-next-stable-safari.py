"""Run recording/regression only after all primary and quality captures finish."""
import json,subprocess,time,os,concurrent.futures
from pathlib import Path
root=Path.cwd();out=root/'output/next-optimizations-safari-2026-10-24';python='/Users/ichi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';awake=subprocess.Popen(['caffeinate','-dimsu','-t','7200']);state={'pid':os.getpid(),'caffeinatePid':awake.pid,'status':'waiting'}
def save():state['updatedAt']=time.time();(out/'post-stable-state.json').write_text(json.dumps(state,indent=2))
try:
 save()
 for _ in range(7200):
  d=json.loads((out/'stable-state.json').read_text())
  if d['status']=='failed':raise RuntimeError(d)
  if d['status']=='complete':break
  time.sleep(1)
 else:raise TimeoutError('stable run')
 state['status']='transition';save()
 for args,log in [(['python3','scripts/benchmarks/capture-next-transition.py'],'capture-transition.log'),([python,'scripts/benchmarks/analyze-next-transition.py'],'analyze-transition.log')]:
  with open(out/log,'w')as f:p=subprocess.run(args,cwd=root,stdout=f,stderr=subprocess.STDOUT)
  if p.returncode:state.setdefault('diagnosticFailures',[]).append({'command':args,'exit':p.returncode});save()
 state['status']='regression';save();builds=json.loads((out/'builds.json').read_text());source=builds['variants']['version31']['root']
 def test(item):
  i,candidate=item;directory=f'/tmp/oic-next-{candidate}-e2e';env=dict(os.environ,NEXT_CANDIDATE=candidate,E2E_PORT=str(4289+i),E2E_OUTPUT_DIR=directory,E2E_CROSS_BROWSER='1',E2E_WORKERS='1')
  command=['npm','run','test:e2e','--','--config','playwright-next.config.mjs','e2e/search.spec.js','e2e/food.spec.js','--grep','MAP every floor|MAP wheel|MAP mobile touch|FOOD every pin']
  with open(out/f'e2e-{candidate}.log','w')as f:p=subprocess.run(command,cwd=source,env=env,stdout=f,stderr=subprocess.STDOUT)
  report=Path(directory)/'results.json';stats=json.loads(report.read_text())['stats']if report.exists()else{}
  return {'candidate':candidate,'exit':p.returncode,'stats':stats,'report':str(report)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:results=list(pool.map(test,enumerate(['ui-cache','geometry-cache','adaptive-raster','hybrid'])))
 (out/'e2e-summary.json').write_text(json.dumps(results,indent=2));state.update(status='complete'if not any(r['exit']for r in results)else'failed',results=results);save();print(json.dumps(state,indent=2),flush=True)
finally:awake.terminate();awake.wait(timeout=10)
