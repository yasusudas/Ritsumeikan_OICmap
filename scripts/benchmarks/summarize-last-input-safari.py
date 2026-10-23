"""Summarize this experiment only. Never substitute earlier measurements."""
import json,statistics,sys
from pathlib import Path
out=Path('output/last-input-safari-2026-10-21')
perf=json.loads((out/'performance.json').read_text())
assert len(perf['trials'])==32 and not perf['errors']
assets=json.loads((out/'assets.json').read_text());images={x['file'].split('/')[-1]:x for x in assets['images']}
groups=[]
for language,floor in [('ja','1F'),('en','1F'),('ja','5F'),('en','5F')]:
 for variant in ['baseline','last-input']:
  trials=[t for t in perf['trials'] if (t['language'],t['floor'],t['variant'])==(language,floor,variant)]
  assert len(trials)==4
  for t in trials:
   assert t['hiddenFrames']==0 and t['environment']['visibility']=='visible' and t['environment']['dpr']==1
   assert t['environment']['viewport']==[960,800]
   image=images[t['image'].split('/')[-1]]
   assert image['language']==t['actualLanguage']==language and image['floor'] in [floor,floor+'-viewer']
   assert all(p['trace'][-1]['scale']==1 for p in t['settlePhases'])
  raw=[v for t in trials for v in t['raw']['zoomIn']+t['raw']['zoomOut']]
  groups.append(dict(language=language,floor=floor,variant=variant,fps=statistics.median(t['zoom']['fps']for t in trials),fpsRange=[min(t['zoom']['fps']for t in trials),max(t['zoom']['fps']for t in trials)],zoomIn=statistics.median(t['zoomIn']['fps']for t in trials),zoomOut=statistics.median(t['zoomOut']['fps']for t in trials),p95Ms=statistics.median(t['zoom']['p95Ms']for t in trials),maxMs=max(raw),over25Percent=sum(v>25 for v in raw)/len(raw)*100,zoomAndSettleFps=statistics.median(t['zoomAndSettle']['fps']for t in trials),panFps=statistics.median(t['pan']['fps']for t in trials),maxCssScale=max(v['scale']for t in trials for p in t['zoomPhases']for v in p['trace'])))
summary={'environment':perf['environment'],'performance':groups}
if (out/'deadline.json').exists():
 diag=json.loads((out/'deadline.json').read_text());assert len(diag['trials'])==8 and not diag['errors'];timing=[]
 for language in ['ja','en']:
  for variant in ['baseline','last-input']:
   trials=[t for t in diag['trials'] if t['language']==language and t['variant']==variant];assert len(trials)==2
   for t in trials:assert t['matchedCallbacks']>0 and all(s['visibility']=='visible' for s in t['samples'])
   commits=[e for t in trials for e in t['events'] if e['changed']]
   active=[e for e in commits if e['phase'].startswith(('in-','out-'))]
   premature=[e for e in commits if e['sinceInput']<139.9]
   gaps=[b['at']-a['at']for t in trials for a,b in zip(t['inputs'],t['inputs'][1:])if a['phase']==b['phase']]
   row=dict(language=language,variant=variant,fps=statistics.median(t['active']['fps']for t in trials),matchedCallbacks=sum(t['matchedCallbacks']for t in trials),sizeCommits=len(commits),activeCommits=len(active),prematureCommits=len(premature),sinceInputMs=[min(e['sinceInput']for e in commits),statistics.median(e['sinceInput']for e in commits),max(e['sinceInput']for e in commits)]if commits else None,inputGapMs=[min(gaps),statistics.median(gaps),max(gaps)])
   if variant=='last-input':assert not premature
   timing.append(row)
 summary['deadline']=timing
if '--quality' in sys.argv:
 import numpy as np
 from PIL import Image
 crop=(33,367,993,941)  # browser chrome75 + header100 + map overlay192
 def pixels(p):
  im=Image.open(p).convert('RGB');assert im.width>=993 and im.height>=941,im.size
  im=im.crop(crop);im.save(p.with_name(p.stem+'-map.png'));return np.asarray(im).astype(float)
 def diff(a,b):
  d=np.abs(a-b);return dict(meanRGB=float(d.mean()),changedPixels=int((d.max(axis=2)>0).sum()),maxRGB=int(d.max()))
 def sharp(a):
  g=a@np.array([.299,.587,.114]);return float((g[:-2,1:-1]+g[2:,1:-1]+g[1:-1,:-2]+g[1:-1,2:]-4*g[1:-1,1:-1]).var())
 quality=[];html=['<!doctype html><meta charset="utf-8"><title>Last-input Safari quality</title><style>body{font:16px system-ui}img{width:48%;vertical-align:top}section{margin:2em 0}</style><h1>Safari画質比較</h1>']
 for language,floor,steps in [('ja','1F',11),('ja','1F',20),('ja','1F',23),('en','1F',23),('ja','5F',23),('en','5F',23)]:
  entries=[];stopped={};moving={}
  html.append(f'<section><h2>{language} {floor} {steps}段階</h2>')
  for variant in ['baseline','last-input']:
   name=f'quality-{variant}-{language}-{floor}-{steps}'
   a=json.loads((out/(name+'-moving.json')).read_text());b=json.loads((out/(name+'-stopped.json')).read_text())
   assert not a['errors'] and not b['errors'];assert a['actualLanguage']==b['actualLanguage']==language
   assert a['environment']['visibility']==b['environment']['visibility']=='visible'
   assert b['state']['scale']==1
   assert a['state']['frameRect']['width']==b['state']['frameRect']['width']==960
   assert a['state']['frameRect']['x']==b['state']['frameRect']['x']==32.5
   assert a['state']['frameRect']['y']==b['state']['frameRect']['y']==100
   x=pixels(out/(name+'-moving.png'));y=pixels(out/(name+'-stopped.png'));moving[variant]=x;stopped[variant]=y
   entries.append(dict(variant=variant,cssScale=a['state']['scale'],movingVsStopped=diff(x,y),edgeVarianceRatio=sharp(x)/sharp(y)*100))
   html.append(f'<h3>{variant}：拡大中 / 停止後</h3><img src="{name}-moving-map.png"><img src="{name}-stopped-map.png">')
  quality.append(dict(language=language,floor=floor,steps=steps,variants=entries,stoppedVsDev=diff(stopped['last-input'],stopped['baseline']),stoppedVsDevInterior=diff(stopped['last-input'][2:-2,2:-2],stopped['baseline'][2:-2,2:-2]),movingVsDev=diff(moving['last-input'],moving['baseline'])))
  html.append('</section>')
 summary['quality']=quality;(out/'quality-gallery.html').write_text(''.join(html))
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
