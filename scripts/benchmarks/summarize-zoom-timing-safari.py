"""Causal timing diagnostics; CSS assignments are not GPU paint counters."""
from pathlib import Path
from collections import defaultdict
import json, statistics

out=Path('output/zoom-timing-safari-2026-10-21')
original=json.loads(Path('output/redraw-frequency-safari-2026-10-21/performance.json').read_text())
d=json.loads((out/'diagnostics.json').read_text())
c=json.loads((out/'cadence.json').read_text())
v=json.loads((out/'svg-visibility.json').read_text())
assert len(v['trials'])==4 and not v['errors']
assert len(d['trials'])==28 and len(c['trials'])==16
assert not d['errors'] and not c['errors']
for t in d['trials']+c['trials']+v['trials']:
    assert t['environment']['dpr']==1 and t['environment']['viewport']==[960,800]
    assert t['environment']['parentViewport']==[1025,1094]
for t in d['trials']:assert t['hiddenFrames']==0
for t in c['trials']:assert all(s['visibility']=='visible' for s in t['samples'])

groups=defaultdict(list)
for t in d['trials']:groups[t['language'],t['floor'],t['id']].append(t)
metrics=[]
for (lang,floor,mode),trials in groups.items():
    active=lambda e:e['context'].get('phase') in ['zoomIn','zoomOut']
    def count(t,kind,reason=None):return sum(e['kind']==kind and active(e) and (reason is None or e.get('reason')==reason) for e in t['events'])
    flush=[e['duration'] for t in trials for e in t['events'] if e['kind']=='flush-exit' and active(e)]
    handler=[e['handlerMs'] for t in trials for e in t['events'] if e['kind']=='input-exit' and active(e)]
    p95=lambda a:sorted(a)[__import__('math').ceil(len(a)*.95)-1] if a else None
    metrics.append(dict(language=lang,floor=floor,mode=mode,n=len(trials),fps=statistics.median(t['zoom']['fps'] for t in trials),
        fpsValues=[t['zoom']['fps'] for t in trials],zoomIn=statistics.median(t['zoomIn']['fps'] for t in trials),zoomOut=statistics.median(t['zoomOut']['fps'] for t in trials),
        combined=statistics.median(t['zoomAndSettle']['fps'] for t in trials),wallFps=statistics.median(t['wallZoom']['fps'] for t in trials),
        instrumented=bool(trials[0]['events']),activeSettleAssignments=[count(t,'raster-assign','settle') for t in trials] if trials[0]['events'] else None,periodicAssignments=[count(t,'raster-assign','periodic') for t in trials] if trials[0]['events'] else None,
        suppressedCommits=[count(t,'commit-suppressed') for t in trials],flushP95Ms=p95(flush),flushMaxMs=max(flush) if flush else None,
        handlerP95Ms=p95(handler),handlerMaxMs=max(handler) if handler else None))

cg=defaultdict(list)
for t in c['trials']:cg[t['inputMode'],t['n']].append(t)
cadence=[]
for (mode,n),trials in cg.items():
    def commits(t):return sum(e['kind']=='raster-assign' and e.get('reason')=='settle' and not e['context'].get('phase','').startswith(('settle','pan-prepare')) for e in t['events'])
    gaps=[b['at']-a['at'] for t in trials for a,b in zip(t['inputs'],t['inputs'][1:]) if a['phase']==b['phase']]
    cadence.append(dict(inputMode=mode,n=n,allFramesFps=statistics.median(t['active']['fps'] for t in trials),
        selectedMotionFps=statistics.median(t['motionConditional']['fps'] for t in trials),
        oldHudFpsIncludingStops=statistics.median(t['oldHudConditional']['fps'] for t in trials),
        observedCssChangesPerSecond=statistics.median(t['activeObservedChangeRate'] for t in trials),
        inputGapMedianMs=statistics.median(gaps),inputGapMaxMs=max(gaps),activeSettleAssignments=[commits(t) for t in trials],
        filteredSlowFrameCounts=[t['slowFramesDiscardedByMotionFilter'] for t in trials],
        maximumCssStretch=max(max(v['scale'],1/v['scale']) for t in trials for v in t['samples']),
        trialValues=[{k:t[k] for k in ['active','motionConditional','oldHudConditional','activeObservedChangeRate','slowFramesDiscardedByMotionFilter']} for t in trials]))

per_step={}
for variant in ['baseline','every-2','every-3','every-5']:
    trials=[t for t in original['trials'] if (t['language'],t['floor'],t['variant'])==('ja','1F',variant)]
    per_step[variant]={phase:[statistics.median(t['raw'][phase][cycle*24+i] for t in trials for cycle in range(3)) for i in range(24)] for phase in ['zoomIn','zoomOut']}

reference=next(t for t in d['trials'] if t['language']=='ja' and t['floor']=='1F' and t['id']=='trace4')
initial=next(e for e in reference['events'] if e['kind']=='input-enter')['zoom']
selected=[e for e in reference['events'] if e['context'].get('cycle')==0 and e['context'].get('phase')=='zoomOut' and 9<=e['context'].get('step',0)<=14]
origin=next(e['t'] for e in selected if e['kind']=='input-enter' and e['context']['step']==11)
timeline=[]
for e in selected:
    if e['kind'] not in ['input-enter','app-raf-exit','timer-fire','raster-assign','parent-observe']:continue
    timeline.append({**e,'relativeMs':e['t']-origin,'relativeZoom':e['zoom']/initial,'relativeRenderedZoom':e['renderedZoom']/initial})
visibility=[]
for hidden in [False,True]:
    trials=[t for t in v['trials'] if t['hideImage']==hidden]
    visibility.append(dict(hidden=hidden,fps=statistics.median(t['zoom']['fps'] for t in trials),zoomOut=statistics.median(t['zoomOut']['fps'] for t in trials),fpsValues=[t['zoom']['fps'] for t in trials],activeCommits=[sum(e['kind']=='raster-assign' and e.get('reason')=='settle' and e['context'].get('phase') in ['zoomIn','zoomOut'] for e in t['events']) for t in trials]))
result=dict(visibility=visibility,diagnosticTrials=28,cadenceTrials=16,diagnostics=metrics,cadence=cadence,originalMedianFrameMsByStep=per_step,timeline=timeline,
    caution='CSS dimension writes and callback timing only; no direct GPU/rasterization profile or physical iPhone rerun')
(out/'timing-summary.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
(out/'representative-timeline.json').write_text(json.dumps(timeline,ensure_ascii=False,indent=2)+'\n')
for g in metrics:print(g['language'],g['floor'],g['mode'],round(g['fps'],2),'in',round(g['zoomIn'],2),'out',round(g['zoomOut'],2),'active settle',g['activeSettleAssignments'],'flushMax',g['flushMaxMs'])
for g in cadence:print('CADENCE',g['inputMode'],g['n'],'all',round(g['allFramesFps'],2),'selected',round(g['selectedMotionFps'],2),'updates/s',round(g['observedCssChangesPerSecond'],2),'active settle',g['activeSettleAssignments'])

print('VISIBILITY',visibility)
