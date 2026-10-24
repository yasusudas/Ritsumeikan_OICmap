"""Keep an owned benchmark awake; log any foreground recovery for triplet replays."""
import json,os,subprocess,time
from pathlib import Path
out=Path.cwd()/'output/next-optimizations-safari-2026-10-24'
awake=subprocess.Popen(['caffeinate','-dimsu','-t','7200']);record={'watcherPid':os.getpid(),'caffeinatePid':awake.pid,'recoveries':[]};path=out/'foreground-watch.json';path.write_text(json.dumps(record,indent=2))
try:
 while True:
  state=json.loads((out/'automation-state.json').read_text())
  if state['status']in ['complete','failed']:break
  name=state.get('result','');candidate=state.get('stage')
  if name==f'performance-{candidate}'and state.get('status')=='waiting':
   progress=out/(name+'-progress.json')
   if progress.exists()and time.time()-progress.stat().st_mtime>90:
    front=subprocess.check_output(['osascript','-e','tell application "Safari" to get frontmost'],text=True).strip()
    if front=='false'and(not record['recoveries']or time.time()-record['recoveries'][-1]['at']>90):
     data=json.loads(progress.read_text());row={'at':time.time(),'candidate':candidate,'completedTrials':len(data['trials']),'reason':'progress unchanged over90s and Safari not frontmost'};record['recoveries'].append(row);path.write_text(json.dumps(record,indent=2));print('RECOVERY',json.dumps(row),flush=True)
     subprocess.run(['osascript','-e','tell application "Safari"\nset index of window id 59248 to 1\nactivate\nend tell'],check=True)
  time.sleep(10)
finally:
 awake.terminate();awake.wait(timeout=10);record['endedAt']=time.time();path.write_text(json.dumps(record,indent=2))
