"""Native window video for hybrid switching, separate from main FPS."""
import json,subprocess,time
from pathlib import Path
out=Path('output/next-optimizations-safari-2026-10-24').resolve();video=out/'safari-hybrid-transition-original.mov';assert not video.exists()
script='tell application "Safari"\nactivate\nset URL of current tab of window id 59248 to "http://127.0.0.1:5211/?run=transition&candidate=hybrid"\nend tell'
start=time.time();subprocess.run(['osascript','-e',script],check=True,timeout=30)
startup=out/'hybrid-transition-startup.json'
for _ in range(300):
 if startup.exists()and startup.stat().st_mtime>=start:break
 time.sleep(.1)
else:raise TimeoutError('transition startup')
command=['/usr/sbin/screencapture','-v','-o','-V','45','-l','59248',str(video)];record_start=time.time();subprocess.run(command,check=True,timeout=70)
result=out/'hybrid-transition.json';assert result.exists()and result.stat().st_mtime>=start;data=json.loads(result.read_text());assert len(data['segments'])==2 and not data['errors']
(out/'hybrid-transition-recording.json').write_text(json.dumps({'command':command,'windowId':59248,'startedAt':start,'recordStartedAt':record_start,'recordEndedAt':time.time(),'video':str(video),'viewport':data['environment']['parentViewport'],'note':'No audio; native window only; separate from primary FPS; crop browser chrome for viewing MP4'},indent=2))
print(video,flush=True)
