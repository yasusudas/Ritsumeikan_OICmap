"""Validate and summarize maxZoom-only Safari experiments. Earlier runs are not reused."""
from pathlib import Path
import json,statistics,sys
out=Path('output/max-zoom-safari-2026-10-21')
metadata=json.loads((out/'assets.json').read_text());data=json.loads((out/'performance.json').read_text())
assert len(data['trials'])==48 and not data['errors']
images={i['file'].split('/')[-1]:i for i in metadata['images']}
summary={'environment':data['environment'],'groups':[]}
for language,floor in [('ja','1F'),('en','1F'),('ja','5F'),('en','5F')]:
 for variant in metadata['variants']:
  ts=[t for t in data['trials']if (t['language'],t['floor'],t['variant'])==(language,floor,variant)]
  assert len(ts)==(4 if floor=='1F'else 2)
  for t in ts:
   assert t['hiddenFrames']==0 and t['environment']['visibility']=='visible' and t['environment']['dpr']==1 and t['viewport']==[960,800]
   image=images[t['image'].split('/')[-1]];assert t['actualLanguage']==image['language']==language and image['floor'] in [floor,floor+'-viewer']
   assert abs(t['ceilingZoom']-metadata['caps'][variant])<1e-5
   for r in t['routes']:
    assert all(abs(p['end']['logicalHeight']/t['base']['baseHeight']-p['trace'][-1]['expectedAfter'])<1e-5 for p in r['phases'])
    assert all(x['expectedAfter']<=t['cap']+1e-7 for x in r['samples'])
    if r['name']=='common':assert all(x['accepted']for x in r['samples'])
  row={'language':language,'floor':floor,'variant':variant,'cap':metadata['caps'][variant],'trials':len(ts),'initialZoom':ts[0]['initialZoom'],'relativeCeiling':statistics.median(t['relativeCeiling']for t in ts),'ceilingWidth':statistics.median(t['ceiling']['logicalWidth']for t in ts),'ceilingHeight':statistics.median(t['ceiling']['logicalHeight']for t in ts),'panFps':statistics.median(t['ceilingPan']['stats']['fps']for t in ts),'routes':[]}
  for name in ['common','to-cap']:
   rs=[next(r for r in t['routes']if r['name']==name)for t in ts];samples=[x for r in rs for x in r['samples']if x['accepted']]
   row['routes'].append(dict(name=name,fps=statistics.median(r['active']['fps']for r in rs),fpsRange=[min(r['active']['fps']for r in rs),max(r['active']['fps']for r in rs)],allInputFps=statistics.median(r['all']['fps']for r in rs),inFps=statistics.median(r['zoomIn']['fps']for r in rs),outFps=statistics.median(r['zoomOut']['fps']for r in rs),p95Ms=statistics.median(r['active']['p95Ms']for r in rs),maxMs=max(x['dt']for x in samples),over25Percent=sum(x['dt']>25 for x in samples)/len(samples)*100,acceptedInputsPerTrial=[r['active']['frames']for r in rs],clampedInputsPerTrial=[r['clamped']['frames']if r['clamped']else 0 for r in rs],settleMaxMs=max(r['settle']['maxMs']for r in rs),inputMs=statistics.median(r['all']['totalMs']for r in rs),settleMs=statistics.median(r['settle']['totalMs']for r in rs),totalRouteMs=statistics.median(r['all']['totalMs']+r['settle']['totalMs']for r in rs),allAndSettleFps=statistics.median((r['all']['frames']+r['settle']['frames'])*1000/(r['all']['totalMs']+r['settle']['totalMs'])for r in rs)))
  summary['groups'].append(row)
if '--quality' in sys.argv:
 import numpy as np
 from PIL import Image
 def pixels(p,meta):
  im=Image.open(p).convert('RGB');assert meta['environment']['dpr']==1 and meta['state']['frameRect']['x']==32.5 and meta['state']['frameRect']['y']==100
  # Browser chrome is measured from each native window, so the same iframe body is compared.
  chrome=im.height-meta['environment']['parentViewport'][1];assert chrome in [75,113],chrome
  box=(33,chrome+292,993,chrome+866);assert im.width>=993 and im.height>=box[3]
  im=im.crop(box);im.save(p.with_name(p.stem+'-map.png'));return np.asarray(im).astype(float)
 def diff(a,b):
  d=np.abs(a-b);return dict(meanRGB=float(d.mean()),changedPixels=int((d.max(axis=2)>0).sum()),maxRGB=int(d.max()))
 def sharp(a):
  g=a@np.array([.299,.587,.114]);return float((g[:-2,1:-1]+g[2:,1:-1]+g[1:-1,:-2]+g[1:-1,2:]-4*g[1:-1,1:-1]).var())
 quality=[];common={};html=['<!doctype html><meta charset="utf-8"><title>Maximum zoom Safari comparison</title><style>body{font:16px system-ui}img{width:48%;vertical-align:top}section{margin:2em 0}</style><h1>最大ズームの画質・表示範囲</h1>']
 for language,floor,mode in [('ja','1F','common'),('ja','1F','ceiling'),('en','1F','ceiling'),('ja','5F','ceiling')]:
  html.append(f'<section><h2>{language} {floor} {mode}</h2>')
  for variant in metadata['variants']:
   name=f'quality-{variant}-{language}-{floor}-{mode}';a=json.loads((out/(name+'-moving.json')).read_text());b=json.loads((out/(name+'-stopped.json')).read_text())
   assert not a['errors'] and not b['errors'] and a['actualLanguage']==b['actualLanguage']==language
   assert a['environment']['visibility']==b['environment']['visibility']=='visible';assert b['state']['scale']==1
   x=pixels(out/(name+'-moving.png'),a);y=pixels(out/(name+'-stopped.png'),b)
   if mode=='ceiling':assert abs(b['state']['logicalHeight']/b['base']['baseHeight']-b['cap'])<1e-5
   row=dict(language=language,floor=floor,mode=mode,variant=variant,cap=b['cap'],steps=b['steps'],cssScale=a['state']['scale'],movingVsStopped=diff(x,y),edgeVarianceRatio=sharp(x)/sharp(y)*100,stoppedZoom=b['state']['logicalHeight']/b['base']['baseHeight'])
   if mode=='common':
    common[variant]=y
    if variant!='baseline':row['commonVsDev']=diff(y,common['baseline']);row['commonVsDevInterior']=diff(y[2:-2,2:-2],common['baseline'][2:-2,2:-2])
   quality.append(row);html.append(f'<h3>{variant}：拡大中 / 停止後</h3><img src="{name}-moving-map.png"><img src="{name}-stopped-map.png">')
  html.append('</section>')
 summary['quality']=quality
 usage=[]
 for language,query in [('ja','AC130'),('en','AS555')]:
  html.append(f'<section><h2>検索 {language} {query}</h2>')
  for variant in metadata['variants']:
   name=f'usage-{variant}-{language}-{query}';a=json.loads((out/(name+'.json')).read_text());assert not a['errors'] and a['highlight'] and a['actualLanguage']==language
   a['searchZoom']=a['afterSearch']['logicalHeight']/a['base']['baseHeight'];usage.append(a);html.append(f'<h3>{variant} / zoom {a["searchZoom"]:.2f}</h3><img src="{name}.png">')
  html.append('</section>')
 summary['usage']=usage;(out/'quality-gallery.html').write_text(''.join(html))
(out/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2));print(json.dumps(summary,ensure_ascii=False,indent=2))
