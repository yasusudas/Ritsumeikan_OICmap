"""Summarize actual Safari timings and native screenshot quality comparisons."""
from pathlib import Path
import json
import statistics
import sys
from html import escape
import numpy as np
from PIL import Image

out = Path(sys.argv[1] if len(sys.argv) > 1 else 'output/scale-only-safari-2026-10-21')
metadata = json.loads((out / 'assets.json').read_text())
perf = json.loads((out / 'performance.json').read_text())
assert len(perf['trials']) == 32 and not perf['errors']
images = {image['file'].split('/')[-1]: image for image in metadata['images']}
groups = []
for language, floor in [('ja', '1F'), ('en', '1F'), ('ja', '5F'), ('en', '5F')]:
    for variant in ['baseline', 'scale-only']:
        trials = [t for t in perf['trials'] if (t['language'], t['floor'], t['variant']) == (language, floor, variant)]
        assert len(trials) == 4
        for t in trials:
            assert t['hiddenFrames'] == 0 and t['viewport'] == [960, 800] and t['environment']['dpr'] == 1
            image = images[t['image'].split('/')[-1]]
            assert image['language'] == t['actualLanguage'] == language and image['floor'] in [floor, floor + '-viewer']
        zoom = [v for t in trials for v in t['raw']['zoomIn'] + t['raw']['zoomOut']]
        settle = [v for t in trials for v in t['raw']['settle']]
        widths = [len({z['initial']['width']} | {v['width'] for v in z['trace']}) for t in trials for z in t['zoomPhases']]
        heights = [len({z['initial']['height']} | {v['height'] for v in z['trace']}) for t in trials for z in t['zoomPhases']]
        assert len(zoom) == 576 and len(settle) == 432
        if variant == 'scale-only':
            assert max(widths) == 1, 'candidate width changed during a zoom phase'
            assert max(heights) == 1, 'candidate height changed during a zoom phase'
        delays = []
        for t in trials:
            for z, s in zip(t['zoomPhases'], t['settlePhases']):
                changed = next((v for v in s['trace'] if v['width'] != z['trace'][-1]['width']), None)
                if changed:
                    delays.append(changed['afterInputMs'])
                assert s['trace'][-1]['scale'] == 1
        groups.append(dict(language=language, floor=floor, variant=variant,
            fps=statistics.median(t['zoom']['fps'] for t in trials),
            fpsMin=min(t['zoom']['fps'] for t in trials), fpsMax=max(t['zoom']['fps'] for t in trials),
            p95Ms=statistics.median(t['zoom']['p95Ms'] for t in trials), maxMs=max(zoom),
            over25Percent=sum(v > 25 for v in zoom) / len(zoom) * 100,
            zoomAndSettleFps=statistics.median(t['zoomAndSettle']['fps'] for t in trials),
            settleP95Ms=statistics.median(t['settle']['p95Ms'] for t in trials), settleMaxMs=max(settle),
            resizeObservedMs=statistics.median(delays) if delays else None,
            panFps=statistics.median(t['pan']['fps'] for t in trials),
            maxDistinctWidthsPerZoomPhase=max(widths),
            maxDistinctHeightsPerZoomPhase=max(heights),
            maxCssScale=max(v['scale'] for t in trials for p in t['zoomPhases'] + t['settlePhases'] for v in p['trace'])))

crop = (33, 405, 993, 979)  # Fixed native Safari window 1025x1207; map body only.
def pixels(path):
    image = Image.open(path).convert('RGB')
    assert image.size == (1025, 1207)
    image = image.crop(crop)
    image.save(path.with_name(path.stem + '-map.png'))
    return np.asarray(image).astype(np.float64)

def difference(a, b):
    d = np.abs(a - b)
    maximum = d.max(axis=2)
    return dict(meanChannelDelta=float(d.mean()), rmse=float(np.sqrt((d*d).mean())),
                changedPixels=int((maximum > 0).sum()), totalPixels=int(maximum.size),
                over32=int((maximum > 32).sum()), maxChannelDelta=int(d.max()))

def sharpness(a):
    gray = a @ np.array([.299, .587, .114])
    lap = gray[:-2, 1:-1] + gray[2:, 1:-1] + gray[1:-1, :-2] + gray[1:-1, 2:] - 4*gray[1:-1, 1:-1]
    return float(lap.var())

quality, sections = [], []
for language, floor, steps in [('ja', '1F', 11), ('ja', '1F', 23), ('en', '1F', 23), ('ja', '5F', 23), ('en', '5F', 23)]:
    entries = []
    stopped = {}
    for variant in ['baseline', 'scale-only']:
        name = f'quality-{variant}-{language}-{floor}-{steps}'
        moving_meta = json.loads((out / (name + '-moving.json')).read_text())
        stopped_meta = json.loads((out / (name + '-stopped.json')).read_text())
        assert moving_meta['actualLanguage'] == stopped_meta['actualLanguage'] == language
        assert not moving_meta['errors'] and not stopped_meta['errors']
        assert moving_meta['environment']['parentViewport'] == stopped_meta['environment']['parentViewport'] == [1025, 1094]
        assert stopped_meta['state']['scale'] == 1
        if variant == 'scale-only':
            assert moving_meta['initial']['width'] == moving_meta['state']['width']
        a = pixels(out / (name + '-moving.png'))
        b = pixels(out / (name + '-stopped.png'))
        stopped[variant] = b
        entries.append(dict(variant=variant, cssScale=moving_meta['state']['scale'],
            movingVsOwnStopped=difference(a,b), laplacianMoving=sharpness(a), laplacianStopped=sharpness(b),
            edgeRetentionPercent=sharpness(a)/sharpness(b)*100))
    a, b = stopped['scale-only'], stopped['baseline']
    delta = np.abs(a-b).max(axis=2)
    changed_y, changed_x = np.where(delta > 0)
    bounds = [int(changed_x.min()), int(changed_y.min()), int(changed_x.max()+1), int(changed_y.max()+1)] if len(changed_x) else None
    entry = dict(language=language, floor=floor, steps=steps, zoom=1.1**steps, variants=entries,
                 stoppedCandidateVsDev=difference(a,b), stoppedDifferenceBoundsInCrop=bounds,
                 stoppedInteriorExcluding2pxBorder=difference(a[2:-2,2:-2], b[2:-2,2:-2]))
    quality.append(entry)
    figures = ''.join(f'<figure><figcaption>{escape(variant)} / {phase}</figcaption><img src="quality-{variant}-{language}-{floor}-{steps}-{phase}-map.png"></figure>' for variant in ['baseline','scale-only'] for phase in ['moving','stopped'])
    sections.append(f'<h2>{language} {floor} {steps} steps ({1.1**steps:.2f}x)</h2><div class="grid">{figures}</div>')
result = dict(environment=perf['environment'], trials=32, zoomSamples=4608, groups=groups, quality=quality,
    screenshotCrop=list(crop), qualityMethod='native Safari screenshot, hold only settle callback for moving-state capture; not canvas SVG rerasterization; not a motion video',
    edgeMetric='variance of grayscale 4-neighbour discrete Laplacian; same content/position only, not an overall quality score')
(out / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
rows = ''.join(f"<tr><td>{g['language']} {g['floor']}</td><td>{g['variant']}</td><td>{g['fps']:.2f}</td><td>{g['zoomAndSettleFps']:.2f}</td><td>{g['settleMaxMs']}ms</td></tr>" for g in groups)
(out / 'index.html').write_text(f'''<!doctype html><html lang="ja"><meta charset="utf-8"><title>Dev / scale only / actual Safari</title>
<style>body{{max-width:1600px;margin:30px auto;padding:0 24px;font:15px system-ui;color:#17212b}}table{{border-collapse:collapse}}td,th{{padding:10px;border-bottom:1px solid #ccc;text-align:left}}.grid{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}figure{{margin:10px 0}}img{{max-width:100%}}figcaption{{margin-bottom:8px}}</style>
<h1>Dev / scale only — 実Safari</h1><p>960×800 CSS px / DPR1 / 各条件4回。rAFから求めた操作更新FPS。</p>
<table><tr><th>対象</th><th>条件</th><th>拡大縮小FPS</th><th>停止区間込みFPS</th><th>停止区間の最大フレーム</th></tr>{rows}</table>
<p>拡大中の画質は140msの停止描き直しだけを保留して状態を保持し、native Safari画面で撮影。FPS計測ではこの保留処理を使っていない。</p>
{''.join(sections)}<p><a href="previous-conversation.md">以前の頻度比較の元会話</a> · <a href="performance.json">FPS生データ</a> · <a href="summary.json">集計JSON</a></p></html>''')
for g in groups:
    print(g['language'], g['floor'], g['variant'], round(g['fps'],2), round(g['zoomAndSettleFps'],2), 'settle max', g['settleMaxMs'])
for q in quality:
    print('quality', q['language'], q['floor'], q['steps'], [round(v['edgeRetentionPercent'],2) for v in q['variants']], 'stopped MAE', q['stoppedCandidateVsDev']['meanChannelDelta'])
