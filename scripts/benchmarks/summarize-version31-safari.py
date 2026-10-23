"""Summarize paired actual-Safari trials; unit of inference is a trial pair."""
import itertools,json,statistics,random,math,sys,re
from pathlib import Path
out=Path('output/version31-combined-safari-2026-10-24')
controlled='--controlled' in sys.argv
p=json.loads((out/('performance-controlled.json' if controlled else 'performance.json')).read_text()); assert len(p['trials'])==48 and not p['errors']
rows=[];tests=[];envs=set();cameraDeltas=[];logicalDeltas=[]
assets=json.loads((out/"build-evidence.json").read_text())["images"]
for language,floor,n in [('ja','1F',8),('en','1F',8),('ja','5F',4),('en','5F',4)]:
 groups={}
 for variant in ['baseline','version31']:
  ts=sorted([t for t in p['trials'] if (t['language'],t['floor'],t['variant'])==(language,floor,variant)],key=lambda t:t['pair']); assert len(ts)==n
  groups[variant]=ts
  for t in ts:
   e=t['environment']; envs.add((tuple(e['parentViewport']),e['dpr'],tuple(e['viewport']),tuple(e['screen']),e['userAgent']))
   assert not t['hiddenFrames'] and e['visibility']=='visible' and e['viewport']==[960,800] and e['dpr']==1
   assert t['actualLanguage']==language
   asset=next(a for a in assets if t['image'].split('/')[-1]==a['candidateFile' if variant=='version31' else 'file'].split('/')[-1])
   assert asset['language']==language and asset['floor'] in [floor,floor+'-viewer']
   assert len(t['raw']['pan'])==60
   assert len(t['raw']['zoomIn'])==len(t['raw']['zoomOut'])==(48 if controlled else 72)
   assert all(s['trace'][-1]['scale']==1 for s in t['settlePhases'])
  raw=[x for t in ts for x in t['raw']['zoomIn']+t['raw']['zoomOut']]
  rows.append(dict(language=language,floor=floor,variant=variant,n=n,fps=statistics.median(t['zoom']['fps'] for t in ts),fpsRange=[min(t['zoom']['fps'] for t in ts),max(t['zoom']['fps'] for t in ts)],zoomIn=statistics.median(t['zoomIn']['fps'] for t in ts),zoomOut=statistics.median(t['zoomOut']['fps'] for t in ts),p95Ms=statistics.median(t['zoom']['p95Ms'] for t in ts),over25Percent=sum(x>25 for x in raw)/len(raw)*100,zoomAndSettleFps=statistics.median(t['zoomAndSettle']['fps'] for t in ts),panFps=statistics.median(t['pan']['fps'] for t in ts),maxCssScale=max(s['scale'] for t in ts for z in t['zoomPhases'] for s in z['trace'])))
 a,b=groups['baseline'],groups['version31'];ds=[];rs=[]
 for x,y in zip(a,b):
  assert x['pair']==y['pair']
  assert abs(x['initial']['logicalWidth']-y['initial']['logicalWidth'])<.001
  assert abs(x['initial']['logicalHeight']-y['initial']['logicalHeight'])<.001
  if controlled:
   assert abs(x['initial']['imageRect']['x']-y['initial']['imageRect']['x'])<1
   assert abs(x['initial']['imageRect']['y']-y['initial']['imageRect']['y'])<1
  if controlled:
   for zx,zy in zip(x['zoomPhases'],y['zoomPhases']):
    for sx,sy in zip(zx['trace'],zy['trace']):
     ax,ay=map(float,re.search(r'translate3d\(([-.\d]+)px, ([-.\d]+)px',sx['transform']).groups());bx,by=map(float,re.search(r'translate3d\(([-.\d]+)px, ([-.\d]+)px',sy['transform']).groups())
     cameraDeltas.append(max(abs(ax-bx),abs(ay-by)));logicalDeltas.append(abs(sx['logicalWidth']-sy['logicalWidth']))
  ds.append(y['zoom']['fps']-x['zoom']['fps']);rs.append((y['zoom']['fps']/x['zoom']['fps']-1)*100)
 observed=abs(statistics.mean(ds)); null=[abs(sum(d*s for d,s in zip(ds,signs))/n) for signs in itertools.product([-1,1],repeat=n)]
 pv=sum(x>=observed-1e-10 for x in null)/len(null)
 rng=random.Random(20261024);boot=sorted(statistics.mean(rng.choices(ds,k=n)) for _ in range(40000))
 tests.append(dict(language=language,floor=floor,n=n,pairedFpsDifferences=ds,pairedPercentChanges=rs,meanDifference=statistics.mean(ds),medianPercentChange=statistics.median(rs),bootstrapMean95CI=[boot[999],boot[38999]],twoSidedExactSignFlipP=pv,method='Exact paired sign-flip mean difference; paired bootstrap 40000 draws seed20261024; no individual-frame inference'))
assert len(envs)==1,envs
primary=sorted([t for t in tests if t['floor']=='1F'],key=lambda x:x['twoSidedExactSignFlipP']); running=0
for i,t in enumerate(primary):
 running=max(running,min(1,(len(primary)-i)*t['twoSidedExactSignFlipP']));t['holmAdjustedP']=running;t['significantAt05']=running<.05
summary=dict(environment=p['environment'],performance=rows,pairedTests=tests,verifiedTrials=48,allTrialsSameEnvironment=True,primaryHypotheses='ja1F and en1F; Holm familywise alpha .05; 5F exploratory n4; repeated single-device trials do not establish device-population effects')
if controlled:
 summary['geometry']={'maximumTranslationDifferenceCssPx':max(cameraDeltas),'maximumLogicalWidthDifferenceCssPx':max(logicalDeltas),'comparedFrames':len(cameraDeltas)}
 assert max(cameraDeltas)<.1 and max(logicalDeltas)<.001
(out/('summary-controlled.json' if controlled else 'summary.json')).write_text(json.dumps(summary,ensure_ascii=False,indent=2))
for r in rows:print(r['language'],r['floor'],r['variant'],round(r['fps'],2),'p95',round(r['p95Ms'],2),'>25%',round(r['over25Percent'],2))
for t in tests:print(t['language'],t['floor'],'delta',round(t['meanDifference'],2),'CI',t['bootstrapMean95CI'],'p',t['twoSidedExactSignFlipP'],'Holm',t.get('holmAdjustedP'))
