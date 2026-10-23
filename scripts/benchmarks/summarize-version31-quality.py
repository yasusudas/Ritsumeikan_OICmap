"""Compare native Safari screenshots, never rerender SVG to fake moving quality."""
import json
from pathlib import Path
import numpy as np
from PIL import Image,ImageDraw,ImageFont
out=Path('output/version31-combined-safari-2026-10-24')
# Chrome 75px + fixture header100 + overlay192; omit 2px at edges,
# rightmost78px and lower60px so the new GPS control is outside the map-only ROI.
crop=(35,294,915,840) # y offsets relative to native browser content
captures={r['file']:r for r in json.loads((out/'script-capture-manifest.json').read_text())}
def pix(path):
 im=Image.open(path).convert('RGB');assert im.width>=993 and im.height>=975,im.size
 entry=captures[path.name];chrome=im.height-entry['parentViewport'][1]
 actual=(crop[0],crop[1]+chrome,crop[2],crop[3]+chrome)
 im=im.crop(actual);im.save(path.with_name(path.stem+'-map.png'));return np.asarray(im).astype(float)
def diff(a,b):
 d=np.abs(a-b);return dict(meanAbsoluteRGB=float(d.mean()),changedPixelPercent=float((d.max(axis=2)>0).mean()*100),over32PixelPercent=float((d.max(axis=2)>32).mean()*100),maximumRGB=int(d.max()))
def sharp(a):
 g=a@np.array([.299,.587,.114]);return float((g[:-2,1:-1]+g[2:,1:-1]+g[1:-1,:-2]+g[1:-1,2:]-4*g[1:-1,1:-1]).var())
rows=[];gallery=['<!doctype html><meta charset="utf-8"><title>Actual Safari quality</title><style>body{font:16px system-ui}img{width:48%;vertical-align:top}</style><h1>Actual Safari: native moving / stopped comparisons</h1>']
for language in ['ja','en']:
 for steps in [20,23]:
  imgs={};entries=[];states={}
  for variant in ['baseline','version31']:
   name=f'quality-centered-{variant}-{language}-1F-{steps}';states[variant]={}
   for phase in ['moving','stopped']:
    d=json.loads((out/f'{name}-{phase}.json').read_text());assert not d['errors'] and d['actualLanguage']==language and d['environment']['visibility']=='visible'
    assert d['state']['frameRect']['x']==32.5 and d['state']['frameRect']['y']==100
    if phase=='stopped':assert d['state']['scale']==1
    states[variant][phase]=d['state'];imgs[variant,phase]=pix(out/f'{name}-{phase}.png')
   m,s=imgs[variant,'moving'],imgs[variant,'stopped'];a,b=states[variant]['moving'],states[variant]['stopped']
   assert abs(a['logicalWidth']-b['logicalWidth'])<.001
   entries.append(dict(variant=variant,movingCssScale=a['scale'],movingVsStopped=diff(m,s),edgeVarianceRatioPercent=sharp(m)/sharp(s)*100,movingSharpness=sharp(m),stoppedSharpness=sharp(s)))
  for phase in ['moving','stopped']:
   a,b=states['baseline'][phase],states['version31'][phase]
   assert abs(a['logicalWidth']-b['logicalWidth'])<.001 and abs(a['logicalHeight']-b['logicalHeight'])<.001
   assert abs(a['imageRect']['x']-b['imageRect']['x'])<.1 and abs(a['imageRect']['y']-b['imageRect']['y'])<.1
  rows.append(dict(language=language,floor='1F',steps=steps,variants=entries,stoppedVsDev=diff(imgs['baseline','stopped'],imgs['version31','stopped']),movingVsDev=diff(imgs['baseline','moving'],imgs['version31','moving']),states=states))
  w,h=880,546; sheet=Image.new('RGB',(w*2+30,h*2+100),'#e9edf0');draw=ImageDraw.Draw(sheet)
  for r,phase in enumerate(['moving','stopped']):
   for c,variant in enumerate(['baseline','version31']):
    x=10+c*(w+10);y=40+r*(h+40);draw.text((x,y-22),f'{language} 1F {steps} steps | {variant} | {phase} | CSS scale {states[variant][phase]["scale"]:.4f}',fill='black')
    sheet.paste(Image.fromarray(imgs[variant,phase].astype('uint8')),(x,y))
  name=f'quality-centered-comparison-{language}-{steps}.png';sheet.save(out/name);gallery.append(f'<h2>{language} / {steps} steps</h2><img style="width:100%" src="{name}">')
(out/'quality-centered-summary.json').write_text(json.dumps(dict(roiRelativeToBrowserContent=crop,method='Native Safari RGB and Laplacian variance; one snapshot per scene; descriptive, not a perceptual equivalence test',scenes=rows),ensure_ascii=False,indent=2))
(out/'quality-centered-gallery.html').write_text(''.join(gallery))
for r in rows:print(r['language'],r['steps'],[(x['variant'],x['movingCssScale'],round(x['edgeVarianceRatioPercent'],2)) for x in r['variants']],r['stoppedVsDev'])
