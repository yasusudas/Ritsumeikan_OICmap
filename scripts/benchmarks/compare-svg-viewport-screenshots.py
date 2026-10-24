"""Compare native Safari captures only; no SVG/canvas rerasterization."""
import json, math
from pathlib import Path
from PIL import Image, ImageDraw
import numpy as np
root=Path('output/svg-viewport-safari-2026-10-21')
metrics=[]
for path in sorted(root.glob('quality-*-moving.json')):
    stem=path.stem[:-7]
    for phase in ['moving','stopped']:
        meta=root/f'{stem}-{phase}.json'; png=root/f'{stem}-{phase}.png'
        if not meta.exists() or not png.exists(): continue
        d=json.loads(meta.read_text()); im=Image.open(png).convert('RGB')
        chrome=im.height-d['environment']['parentViewport'][1]
        # All variants use the same iframe x=32.5 and y=100. Map readable body y=192..766.
        im.crop((33,chrome+292,993,chrome+866)).save(root/f'{stem}-{phase}-map.png')
for cull in sorted(root.glob('quality-svg-cull-*-map.png')):
    suffix=cull.name.removeprefix('quality-svg-cull-')
    a=np.asarray(Image.open(cull)).astype(float)
    d=json.loads((root/cull.name.replace('-map.png','.json')).read_text())
    row={'scene':suffix.removesuffix('-map.png'),'variant':'svg-cull','logicalWidth':d['state']['logicalWidth'],'scale':d['state']['scale'],'vector':d['state']['vector']}
    for variant in ['baseline','inline-all']:
        p=root/f'quality-{variant}-{suffix}'
        if not p.exists(): continue
        b=np.asarray(Image.open(p)).astype(float); diff=np.abs(a-b); mse=np.square(a-b).mean()
        inner=a[:,1:-1]-b[:,1:-1]
        row[variant]={'innerRmseExcludingSideBorder':float(np.sqrt(np.square(inner).mean())),'mae':float(diff.mean()),'rmse':float(np.sqrt(mse)),'psnr':float(20*math.log10(255/math.sqrt(mse))) if mse else 'infinite', 'differentPixelsPercent':float(np.any(diff>0,axis=2).mean()*100),'over10PixelsPercent':float(np.any(diff>10,axis=2).mean()*100)}
    metrics.append(row)
(root/'visual-comparison.json').write_text(json.dumps(metrics,ensure_ascii=False,indent=2))
for case in ['ja-1F-23','en-1F-23','ja-5F-23','en-5F-23','ja-1F-0','ja-1F-23-pan']:
    paths=[root/f'quality-{v}-{case}-{p}-map.png' for p in ['moving','stopped'] for v in ['baseline','inline-all','svg-cull']]
    if not all(p.exists() for p in paths):continue
    board=Image.new('RGB',(3*640,2*410),'#eef0f2');draw=ImageDraw.Draw(board)
    for i,p in enumerate(paths):
        im=Image.open(p);im.thumbnail((640,382)); x=(i%3)*640;y=(i//3)*410
        draw.text((x+10,y+4),p.name.removeprefix('quality-').removesuffix('-map.png'),fill='#17212b')
        board.paste(im,(x,y+25))
    board.save(root/f'comparison-{case}.png')
print(json.dumps([{ 'scene':r['scene'],'baseline':r.get('baseline'),'inline-all':r.get('inline-all')} for r in metrics],indent=2))
