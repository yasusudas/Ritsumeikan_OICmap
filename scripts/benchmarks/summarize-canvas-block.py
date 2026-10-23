"""Summarize real Chrome/Safari/Firefox SVG vs Canvas-block measurements."""
import csv
import json
import statistics as st
import sys
from pathlib import Path

out = Path('output/canvas-block-2026-10-23')
run = sys.argv[1] if len(sys.argv) > 1 else 'performance-retry-20261023'
browsers = sys.argv[2:] or ['chrome', 'safari', 'firefox']
groups, records, issues = [], {}, []
source_assets = json.loads((out / 'build-verification.json').read_text())['images']
map_names = {Path(i['file']).name for i in source_assets}

def change_rate(trial, phase):
    before = trial['initial'] if phase == 'zoom' else trial['panBefore']
    key = lambda s: (s['width'], s['height'], s['transform'])
    previous, count = key(before), 0
    for sample in trial[phase]['trace']:
        current = key(sample)
        count += current != previous
        previous = current
    return count * 1000 / trial[phase]['totalMs']

for browser in browsers:
    data = json.loads((out / f'{browser}-{run}.json').read_text())
    records[browser] = data
    assert len(data['trials']) == 32, (browser, len(data['trials']))
    assert not data['errors'], (browser, data['errors'])
    for trial in data['trials']:
        assert trial['environment']['iframe'] == [900, 440]
        assert trial['environment']['dpr'] == 1 and trial['environment']['iframeFullyVisible']
        assert trial['actualLanguage'] == trial['language']
        for phase in ['zoom', 'pan']:
            hidden = [s for s in trial[phase]['trace'] if s['visibility'] != 'visible']
            events = [s for s in trial[phase].get('visibilityEvents', []) if s['state'] != 'visible']
            if hidden or events:
                issues.append({'browser': browser, 'variant': trial['variant'], 'floor': trial['floor'], 'language': trial['language'], 'order': trial['order'], 'phase': phase, 'hiddenSamples': len(hidden), 'hiddenEvents': events})
    for language in ['ja', 'en']:
        for floor in ['1F', '5F']:
            for variant in ['baseline', 'canvas']:
                ts = [t for t in data['trials'] if (t['language'], t['floor'], t['variant']) == (language, floor, variant)]
                assert len(ts) == 4
                samples = [s for t in ts for phase in ['zoom', 'pan'] for s in t[phase]['trace']]
                tiles = [s['tiles'] for s in samples if s.get('tiles')]
                resources = [r for t in ts for r in t.get('resources', []) if '/tiles/' in r['url'] or Path(r['url']).name in map_names]
                groups.append(dict(browser=browser, language=language, floor=floor, variant=variant, trials=4,
                    zoomFps=st.median(t['zoom']['fps'] for t in ts), panFps=st.median(t['pan']['fps'] for t in ts),
                    idleFps=st.median(t['idle']['fps'] for t in ts),
                    zoomValues=[t['zoom']['fps'] for t in ts], panValues=[t['pan']['fps'] for t in ts],
                    zoomP95Ms=st.median(t['zoom']['p95Ms'] for t in ts), zoomWorstMs=max(t['zoom']['worstMs'] for t in ts),
                    slow25Percent=sum(t['zoom']['slow25'] for t in ts) / 480 * 100,
                    cssZoomChangesPerSec=st.median(change_rate(t, 'zoom') for t in ts),
                    cssPanChangesPerSec=st.median(change_rate(t, 'pan') for t in ts),
                    fallbackSamples=sum(t['fallback'] > 0 for t in tiles), blankSamples=sum(t['blank'] > 0 for t in tiles),
                    tileSamples=len(tiles), maxDecodedBytes=max((t['decodedBytes'] for t in tiles), default=0),
                    maxCanvasWidth=max((t['width'] for t in tiles), default=0), maxCanvasHeight=max((t['height'] for t in tiles), default=0),
                    mapSvgResourceRequests=sum(r['url'].endswith('.svg') for r in resources),
                    meanLocalMapBytes=sum(r['bytes'] for r in resources) / 4,
                    medianAssetReadyMs=st.median(t['assetReadyMs'] for t in ts),
                    idleCanvasDraws=[t['idle']['trace'][-1]['tiles']['draws'] - t['idle']['trace'][0]['tiles']['draws'] for t in ts] if variant == 'canvas' else [],
                    maxLogicalWidth=max(s['logicalWidth'] for s in samples)))

sync = []
for i in range(32):
    ts = [records[b]['trials'][i] for b in records]
    assert len({(t['variant'], t['floor'], t['language'], t['order']) for t in ts}) == 1
    for phase in ['zoom', 'pan']:
        starts = [t[phase]['start'] for t in ts]
        sync.append(dict(trial=i, phase=phase, spreadMs=max(starts) - min(starts)))

result = dict(run=run, trials=len(browsers) * 32, browsers=browsers, issues=issues, groups=groups, synchronization=sync,
    maxPhaseStartSpreadMs=max(s['spreadMs'] for s in sync),
    totalZoomSamples=len(browsers) * 32 * 120, totalPanSamples=len(browsers) * 32 * 120,
    fpsDefinition='parent requestAnimationFrame intervals; not presented GPU frames',
    cssChangeDefinition='observed width/height/transform changes per second; not GPU presentations',
    memoryDefinition='adapter-retained decoded RGBA pixels; excludes browser/GPU/cache overhead')
(out / 'summary.json').write_text(json.dumps(result, ensure_ascii=False, indent=2))
with (out / 'summary.csv').open('w') as f:
    scalar = [{k: v for k, v in g.items() if not isinstance(v, list)} for g in groups]
    w = csv.DictWriter(f, fieldnames=scalar[0].keys()); w.writeheader(); w.writerows(scalar)
for g in groups:
    print(g['browser'], g['language'], g['floor'], g['variant'], f"zoom={g['zoomFps']:.2f}", f"pan={g['panFps']:.2f}", f"cssZoom={g['cssZoomChangesPerSec']:.2f}", f"fallback={g['fallbackSamples']}/{g['tileSamples']}", f"blank={g['blankSamples']}")
print('visibility issues:', len(issues), 'max start spread ms:', result['maxPhaseStartSpreadMs'])
if issues:
    raise SystemExit('Hidden intervals must not be reported as valid performance measurements')
