"""Summarize the saved real-Safari experiment without excluding outliers."""
import json
import statistics
import sys
from pathlib import Path
import gzip
from html import escape

root = Path(sys.argv[1] if len(sys.argv) > 1 else 'output/leaflet-safari-2026-10-21')
perf = json.loads((root / 'performance.json').read_text())
metadata = json.loads((root / 'assets.json').read_text())
images_by_file = {image['file'].split('/')[-1]: image for image in metadata['images']}
assert len(perf['trials']) == 32
assert not perf['errors']
for trial in perf['trials']:
    image = images_by_file[trial['image'].split('/')[-1]]
    assert image['language'] == trial['language'] == trial['actualLanguage']
    assert image['floor'] in [trial['floor'], trial['floor'] + '-viewer']
    assert trial['serverBefore']['failures'] == trial['serverAfter']['failures']
groups = []
for language, floor in [('ja', '1F'), ('en', '1F'), ('ja', '5F'), ('en', '5F')]:
    for variant in ['baseline', 'leaflet']:
        trials = [t for t in perf['trials'] if (t['language'], t['floor'], t['variant']) == (language, floor, variant)]
        assert len(trials) == 4
        assert all(t['hiddenFrames'] == 0 and t['viewport'] == [960, 800] and t['environment']['dpr'] == 1 for t in trials)
        assert all(t['serverAfter']['generated'] == t['serverBefore']['generated'] for t in trials)
        frames = [v for t in trials for v in t['raw']['zoomIn'] + t['raw']['zoomOut']]
        tiles = [v for t in trials for v in t.get('tileFrames', [])]
        assert len(frames) == 576
        assert all(not t.get('tilesAfter', {}).get('errors') for t in trials)
        groups.append(dict(language=language, floor=floor, variant=variant,
            fps=statistics.median(t['zoom']['fps'] for t in trials),
            fpsMin=min(t['zoom']['fps'] for t in trials), fpsMax=max(t['zoom']['fps'] for t in trials),
            p95Ms=statistics.median(t['zoom']['p95Ms'] for t in trials), maxMs=max(frames),
            over25Percent=sum(v > 25 for v in frames) / len(frames) * 100,
            panFps=statistics.median(t['pan']['fps'] for t in trials),
            settleFps=statistics.median(t['settle']['fps'] for t in trials),
            tileSamples=len(tiles), zeroLoadedSamples=sum(v['loadedTiles'] == 0 for v in tiles),
            loadingSamples=sum(v['loading'] for v in tiles),
            maxTileElements=max((v['totalTiles'] for v in tiles), default=0)))
visual = json.loads((root / 'visual.json').read_text())
assert len(visual['comparisons']) == 12 and not visual['errors']
assert all(c['diagnostics'][1]['tiles']['ready'] and not c['diagnostics'][1]['tiles']['errors'] for c in visual['comparisons'])
sizes = {}
for label, build in [('baseline', metadata['baseline']), ('leaflet', metadata['candidate'])]:
    assets = list((Path(build) / 'assets').glob('*'))
    sizes[label] = {ext: {'bytes': sum(p.stat().st_size for p in assets if p.suffix == ext),
                         'gzipBytes': sum(len(gzip.compress(p.read_bytes(), mtime=0)) for p in assets if p.suffix == ext)} for ext in ['.js', '.css']}
tiles = list((root / 'tiles').glob('*.png'))
result = dict(groups=groups, environment=perf['environment'], trials=32, zoomSamples=4608,
    hiddenSamples=0, newTilesDuringMeasurements=0, errors=perf['errors'],
    setupServerFailures=perf['trials'][0]['serverBefore']['failures'], newServerFailuresDuringMeasurements=0,
    visual=visual['comparisons'], bundleSizes=sizes,
    generatedTiles=dict(count=len(tiles), bytes=sum(p.stat().st_size for p in tiles)))
(root / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2) + '\n')
sections = []
for c in visual['comparisons']:
    name = f"visual-{c['language']}-{c['floor']}-{c['view']}"
    sections.append(f'''<details><summary>{escape(c['language'])} {escape(c['floor'])} {escape(c['view'])} — mean RGB difference {c['meanChannelDelta']:.3f}</summary>
    <div class="pair"><figure><figcaption>Vanilla Dev</figcaption><img loading="lazy" src="{name}-before.png"></figure>
    <figure><figcaption>Leaflet tiles</figcaption><img loading="lazy" src="{name}-after.png"></figure></div>
    <a href="{name}-diff.png">Difference image</a></details>''')
rows = ''.join(f"<tr><td>{g['language']} {g['floor']}</td><td>{g['variant']}</td><td>{g['fps']:.2f}</td><td>{g['p95Ms']:.1f} ms</td><td>{g['zeroLoadedSamples']}</td></tr>" for g in groups)
page = f'''<!doctype html><html lang="ja"><meta charset="utf-8"><title>Leaflet / Vanilla Dev / Safari evidence</title>
<style>body{{font:15px system-ui;margin:30px auto;padding:0 20px;max-width:1500px;color:#17212b}}h1{{font-size:26px}}table{{border-collapse:collapse}}th,td{{padding:8px 16px;border-bottom:1px solid #ccc;text-align:left}}details{{margin:24px 0;border:1px solid #ddd;padding:14px}}summary{{cursor:pointer}}.pair{{display:grid;grid-template-columns:1fr 1fr;gap:16px}}figure{{margin:10px 0}}img{{max-width:100%;height:auto;border:1px solid #ddd}}figcaption{{margin-bottom:8px}}</style>
<h1>Leaflet / Vanilla Dev — 実Safariの比較証拠</h1>
<p>基準 {escape(metadata['commit'])}。元SVG、mask/filterを保持。最終候補はPNG余白1px＋通常合成。32試行、DPR1、960×800。</p>
<p>rAFから求めた操作更新FPS。読み込み済みタイル0枚の観測を含むため、内容のある地図の提示FPSとは異なる。</p>
<table><tr><th>対象</th><th>条件</th><th>FPS中央値</th><th>p95</th><th>タイル0枚 / 576</th></tr>{rows}</table>
<h2>実Safari画面のAC130</h2><div class="pair"><figure><figcaption>Vanilla Dev</figcaption><img src="native-ac130-room-before.png"></figure><figure><figcaption>Leaflet tiles（最終設定）</figcaption><img src="native-ac130-room-after.png"></figure></div>
<p><a href="native-ac130-room-default-blend.png">途中の加算合成で発生した境界線</a></p>
<h2>地図面の比較画像</h2>{''.join(sections)}
<p><a href="performance.json">Performance raw JSON</a> · <a href="visual.json">Visual raw JSON</a> · <a href="summary.json">Summary JSON</a></p></html>'''
(root / 'index.html').write_text(page)
for g in groups:
    print(g['language'], g['floor'], g['variant'], f"{g['fps']:.2f} FPS", f"{g['p95Ms']:.1f} ms p95", f"{g['over25Percent']:.2f}% >25ms", f"{g['zeroLoadedSamples']} zero-loaded samples")
print('Bundles', sizes)
print('Tiles', result['generatedTiles'])
