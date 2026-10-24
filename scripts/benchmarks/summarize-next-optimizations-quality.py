"""Native lossless Safari pixels and descriptive edge metrics, no SVG rerender."""
import json,sys
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw
out=Path('output/next-optimizations-safari-2026-10-24')
variants=['baseline','version31']+(sys.argv[1:]or['ui-cache','geometry-cache','adaptive-raster','hybrid'])
records={r['file']:r for r in json.loads((out/'capture-manifest.json').read_text())};crop=(213,310,813,750)
def pixels(path):
 raw=path.read_bytes();assert raw.startswith(b'\x89PNG\r\n\x1a\n');im=Image.open(path).convert('RGB');r=records[path.name];chrome=im.height-r['parentViewport'][1];box=(crop[0],crop[1]+chrome,crop[2],crop[3]+chrome);im=im.crop(box);im.save(path.with_name(path.stem+'-map.png'));return np.asarray(im).astype(float)
def diff(a,b):
 d=np.abs(a-b);return {'meanAbsoluteRGB':float(d.mean()),'changedPixelPercent':float((d.max(2)>0).mean()*100),'over32PixelPercent':float((d.max(2)>32).mean()*100),'maxRGB':int(d.max())}
def edge(a):
 g=a@np.array([.299,.587,.114]);return float((g[:-2,1:-1]+g[2:,1:-1]+g[1:-1,:-2]+g[1:-1,2:]-4*g[1:-1,1:-1]).var())
rows=[]
for language in ['ja','en']:
 for steps in [20,23]:
  images={};states={};entries=[]
  for variant in variants:
   for phase in ['moving','stopped']:
    name=f'quality-room-{variant}-{language}-1F-{steps}-{phase}';d=json.loads((out/(name+'.json')).read_text());assert not d['errors']and d['actualLanguage']==language and d['environment']['visibility']=='visible';state=d['state'];assert state['frameRect']['x']==32.5 and state['frameRect']['y']==100
    if phase=='stopped':assert state['scale']==1
    states[variant,phase]=state;images[variant,phase]=pixels(out/(name+'.png'))
   if variant!='baseline':
    for phase in ['moving','stopped']:
     a=states['baseline',phase];b=states[variant,phase];assert abs(a['logicalWidth']-b['logicalWidth'])<.01 and abs(a['logicalHeight']-b['logicalHeight'])<.01
     assert abs(a['imageRect']['x']-b['imageRect']['x'])<.1 and abs(a['imageRect']['y']-b['imageRect']['y'])<.1
   a,b=images[variant,'moving'],images[variant,'stopped'];entries.append({'variant':variant,'movingCssScale':states[variant,'moving']['scale'],'movingEdgeVarianceRatioPercent':edge(a)/edge(b)*100,'movingVsStopped':diff(a,b),'stoppedVsPublished':diff(b,images.get(('version31','stopped'),b))})
  for entry in entries:
   v=entry['variant'];entry['stoppedVsPublished']=diff(images[v,'stopped'],images['version31','stopped']);entry['movingVsPublished']=diff(images[v,'moving'],images['version31','moving'])
  for candidate in variants[2:]:
   cols=['baseline','version31',candidate];w,h=600,440;sheet=Image.new('RGB',(3*w+40,2*h+100),'#e9edf0');draw=ImageDraw.Draw(sheet)
   for row,phase in enumerate(['moving','stopped']):
    for col,variant in enumerate(cols):
     x=10+col*(w+10);y=40+row*(h+40);draw.text((x,y-20),f'{language} {steps} | {variant} | {phase} | scale {states[variant,phase]["scale"]:.3f}',fill='black');sheet.paste(Image.fromarray(images[variant,phase].astype('uint8')),(x,y))
   sheet.save(out/f'quality-room-{candidate}-{language}-{steps}-comparison.png')
  rows.append({'language':language,'steps':steps,'entries':entries})
summary={'method':'Native Safari PNG; 600x440 map-only ROI; Laplacian variance is descriptive, not a perceptual score/equivalence test','roi':crop,'rows':rows}
(out/'quality-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
for r in rows:print(r['language'],r['steps'],[(e['variant'],round(e['movingEdgeVarianceRatioPercent'],2),e['stoppedVsPublished']['maxRGB'])for e in r['entries']])
