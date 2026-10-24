"""After all native primary trials: independent transition video and UI regression."""
import concurrent.futures,json,os,subprocess,time
from pathlib import Path
root=Path.cwd();out=root/'output/next-optimizations-safari-2026-10-24';python='/Users/ichi/.cache/codex-runtimes/codex-primary-runtime/dependencies/python/bin/python3';awake=subprocess.Popen(['caffeinate','-dimsu','-t','3600']);state={'pid':os.getpid(),'caffeinatePid':awake.pid,'status':'waiting-for-main'}
def save():state['updatedAt']=time.time();(out/'validation-state.json').write_text(json.dumps(state,indent=2))
def run(args,log):
 with open(out/log,'w')as f:subprocess.run(args,cwd=root,stdout=f,stderr=subprocess.STDOUT,check=True)
try:
 save()
 for _ in range(7200):
  try:primary=json.loads((out/'automation-state.json').read_text())
  except(json.JSONDecodeError,FileNotFoundError):time.sleep(1);continue
  if primary['status']=='failed':raise RuntimeError(primary)
  if primary['status']=='complete':break
  time.sleep(1)
 else:raise TimeoutError('all primary trials')
 state['status']='transition-video';save();print('PRIMARY COMPLETE: starting separate native transition recording',flush=True)
 run(['python3','scripts/benchmarks/capture-next-transition.py'],'capture-transition.log')
 run([python,'scripts/benchmarks/analyze-next-transition.py'],'analyze-transition.log')
 state['status']='ui-regression';save();builds=json.loads((out/'builds.json').read_text());source=builds['variants']['version31']['root']
 def test(item):
  index,candidate=item;directory=f'/tmp/oic-next-{candidate}-e2e';env=dict(os.environ,NEXT_CANDIDATE=candidate,E2E_PORT=str(4289+index),E2E_OUTPUT_DIR=directory,E2E_CROSS_BROWSER='1',E2E_WORKERS='1')
  command=['npm','run','test:e2e','--','--config','playwright-next.config.mjs','e2e/search.spec.js','e2e/food.spec.js','--grep','MAP every floor|MAP wheel|MAP mobile touch|FOOD every pin']
  print('UI TEST',candidate,flush=True)
  with open(out/f'e2e-{candidate}.log','w')as f:p=subprocess.run(command,cwd=source,env=env,stdout=f,stderr=subprocess.STDOUT)
  report=Path(directory)/'results.json';stats=json.loads(report.read_text())['stats']if report.exists()else{}
  return {'candidate':candidate,'exit':p.returncode,'stats':stats,'report':str(report)}
 with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:results=list(pool.map(test,enumerate(['ui-cache','geometry-cache','adaptive-raster','hybrid'])))
 (out/'e2e-summary.json').write_text(json.dumps(results,indent=2));print(json.dumps(results,indent=2),flush=True)
 if any(r['exit']for r in results):raise RuntimeError('UI regression failures; inspect each log')
 state.update(status='complete',results=results);save();print('VALIDATION COMPLETE',flush=True)
except BaseException as error:
 state.update(status='failed',error=repr(error));save();raise
finally:
 awake.terminate();awake.wait(timeout=10)
