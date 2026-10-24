"""A narrow video ROI check for visible disappearance during Canvas/SVG switching."""
import json,subprocess,shutil
from datetime import datetime
from pathlib import Path
import numpy as np
out=Path('output/next-optimizations-safari-2026-10-24');video=out/'safari-hybrid-transition-original.mov';meta=json.loads((out/'hybrid-transition-recording.json').read_text());data=json.loads((out/'hybrid-transition.json').read_text());ffmpeg=shutil.which('ffmpeg');ffprobe=shutil.which('ffprobe');assert ffmpeg and ffprobe
probe=json.loads(subprocess.check_output([ffprobe,'-v','error','-show_streams','-show_format','-of','json',str(video)]));(out/'hybrid-transition-ffprobe.json').write_text(json.dumps(probe,indent=2))
frames=json.loads(subprocess.check_output([ffprobe,'-v','error','-select_streams','v:0','-show_frames','-show_entries','frame=best_effort_timestamp_time','-of','json',str(video)]))['frames'];times=np.array([float(f['best_effort_timestamp_time'])for f in frames]);times-=times[0]
raw=subprocess.check_output([ffmpeg,'-v','fatal','-i',str(video),'-vf','crop=80:80:473:535','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);pixels=np.frombuffer(raw,dtype=np.uint8).reshape(-1,80,80,3).astype(np.int16);assert len(pixels)==len(times)
r,g,b=pixels[...,0],pixels[...,1],pixels[...,2];green=((g>r+10)&(g>b+25)&(g>100)).mean((1,2));white=((r>245)&(g>245)&(b>245)).mean((1,2));rows=[]
marker=None
if data.get('videoMarker'):
 x,y,w,h=data['videoMarker']['nativeRoi'];raw=subprocess.check_output([ffmpeg,'-v','fatal','-i',str(video),'-vf',f'crop={w}:{h}:{x}:{y}','-vsync','0','-f','rawvideo','-pix_fmt','rgb24','pipe:1']);marker=np.frombuffer(raw,dtype=np.uint8).reshape(-1,h,w,3).mean((1,2));assert len(marker)==len(times)
for segment in data['segments']:
 if marker is not None:
  color=np.array(data['videoMarker']['colors'][segment['language']]);select=(np.abs(marker-color).max(1)<35);assert select.any();start=times[select].min();end=times[select].max()
 else:
  start=datetime.fromisoformat(segment['startedAt'].replace('Z','+00:00')).timestamp()-meta['recordStartedAt']+.3;end=datetime.fromisoformat(segment['endedAt'].replace('Z','+00:00')).timestamp()-meta['recordStartedAt']-.3;select=(times>=start)&(times<=end);assert select.any()
 rows.append({'language':segment['language'],'videoStartSeconds':float(start),'videoEndSeconds':float(end),'sampledVideoFrames':int(select.sum()),'minimumGreenFraction':float(green[select].min()),'maximumWhiteFraction':float(white[select].max()),'nearWhiteFrames':int(((green<.02)&(white>.95)&select).sum()),'lowGreenFrames':int(((green<.1)&select).sum())})
method='Visible marker colors in each decoded frame identify operation/stop segments; page-loading frames are outside marker segments.'if marker is not None else'Approximate wall-clock alignment, excluding .3s segment edges; page loading can be misclassified.'
result={'method':'Independent native Safari window recording; narrow 80x80 AC130 green-room ROI at x473 y535. '+method+' Descriptive disappearance check, not a proof about all map regions/GPU frames.','roi':[473,535,80,80],'scenes':rows,'videoFrames':len(times)};(out/'hybrid-transition-analysis.json').write_text(json.dumps(result,indent=2));print(json.dumps(result,indent=2))
mp4=out/'safari-hybrid-transition.mp4';subprocess.run([ffmpeg,'-v','error','-n','-i',str(video),'-vf','crop=1324:1094:0:75','-an','-r','60','-c:v','libx264','-preset','fast','-crf','20','-pix_fmt','yuv420p','-movflags','+faststart',str(mp4)],check=True)
