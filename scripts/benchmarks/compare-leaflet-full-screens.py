from pathlib import Path
from PIL import Image,ImageDraw
import json,re,math
import numpy as np
root=Path('output/leaflet-full-safari-2026-10-21');results=[]
variants=['baseline','render-only','full']
for scene in ['ja-1F-0','ja-1F-23','en-1F-23','ja-5F-23','en-5F-23']:
    crops={};metadata={}
    for v in variants:
        prefix=f'quality-{v}-{scene}';p=root/f'{prefix}.json';png=root/f'{prefix}.png'
        if not p.exists() or not png.exists():break
        d=json.loads(p.read_text());im=Image.open(png).convert('RGB');chrome=im.height-d['environment']['parentViewport'][1]
        crop=im.crop((33,chrome+292,993,chrome+866));crop.save(root/f'{prefix}-map.png');crops[v]=np.asarray(crop).astype(float);metadata[v]=d
    if len(crops)!=3:continue
    def origin(d):
        if d['variant']=='full':return[d['state']['tiles']['view']['x'],d['state']['tiles']['view']['y']]
        return list(map(float,re.search(r'translate3d\(([-.\d]+)px,\s*([-.\d]+)px',d['state']['transform']).groups()))
    origins={k:origin(v)for k,v in metadata.items()};base=metadata['baseline']['state']['width']
    assert all(abs(d['state']['width']-base)<.02 for d in metadata.values()),scene
    assert all(abs(a-b)<=1.01 for a,b in zip(origins['baseline'],origins['full'])),(scene,origins)
    row={'scene':scene,'origins':origins,'logicalWidth':base}
    for v in ['baseline','render-only']:
        a=crops['full'];b=crops[v];diff=np.abs(a-b);mse=np.square(a-b).mean();inner=a[:,1:-1]-b[:,1:-1]
        row[v]={'mae':float(diff.mean()),'rmse':float(np.sqrt(mse)),'innerRmse':float(np.sqrt(np.square(inner).mean())),'psnr':float(20*math.log10(255/math.sqrt(mse)))if mse else 'infinite','over10PixelsPercent':float(np.any(diff>10,axis=2).mean()*100)}
    results.append(row)
    board=Image.new('RGB',(1920,410),'#eef0f2');draw=ImageDraw.Draw(board)
    for i,v in enumerate(variants):
        im=Image.fromarray(crops[v].astype(np.uint8));im.thumbnail((640,383));board.paste(im,(i*640,25));draw.text((i*640+10,4),v+' '+scene,fill='#17212b')
    board.save(root/f'comparison-{scene}.png')
(root/'native-visual-comparison.json').write_text(json.dumps(results,indent=2))
print(json.dumps(results,indent=2))
