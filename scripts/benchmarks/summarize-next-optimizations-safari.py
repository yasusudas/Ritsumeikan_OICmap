"""Exploratory matched triplets. Trial, not individual frame, is the unit."""
import json,statistics,re,sys
from pathlib import Path
out=Path('output/next-optimizations-safari-2026-10-24');variants=sys.argv[1:]or['ui-cache','geometry-cache','adaptive-raster','hybrid']
result=[]
for candidate in variants:
 accepted=out/f'performance-{candidate}-accepted.json';p=json.loads((accepted if accepted.exists() else out/f'performance-{candidate}.json').read_text());assert not p['errors']and len(p['trials'])in[24,36]
 rows=[];maxWidth=0;maxTranslate=0
 for language,floor,n in [('ja','1F',len(p['trials'])//6-2),('en','1F',len(p['trials'])//6-2),('ja','5F',2),('en','5F',2)]:
  groups={v:sorted([t for t in p['trials']if(t['variant'],t['language'],t['floor'])==(v,language,floor)],key=lambda t:t['pair'])for v in ['baseline','version31',candidate]}
  for variant,ts in groups.items():
   assert len(ts)==n
   for t in ts:
    assert t['hiddenFrames']==0 and t['actualLanguage']==language and t['viewport']==[960,800]and t['environment']['dpr']==1
    assert t['environment']['parentViewport']==[1324,1094]
    assert abs(t['initial']['logicalWidth']-2000)<.01
    assert all(s['trace'][-1]['scale']==1 for s in t['settlePhases'])
    refresh=[1000/statistics.median(t['raw']['settle'][phase*18+12:phase*18+18])for phase in range(6)]
    # A short jittery phase can be 50Hz while the regime is still 60Hz.
    # Reject a 30Hz plateau, not individual slow callbacks/outliers.
    assert all(40<f<75 for f in refresh),('Possible refresh regime change; keep raw data, do not pool',candidate,language,floor,t['pair'],refresh)
    t['quietRefreshFps']=statistics.median(refresh)
   rows.append({'language':language,'floor':floor,'variant':variant,'n':n,'zoomFps':statistics.median(t['zoom']['fps']for t in ts),'range':[min(t['zoom']['fps']for t in ts),max(t['zoom']['fps']for t in ts)],'p95Ms':statistics.median(t['zoom']['p95Ms']for t in ts),'p99Ms':statistics.median(sorted(t['raw']['zoomIn']+t['raw']['zoomOut'])[int(.99*len(t['raw']['zoomIn']+t['raw']['zoomOut']))]for t in ts),'maxMs':max(t['zoom']['maxMs']for t in ts),'panFps':statistics.median(t['pan']['fps']for t in ts),'settleFps':statistics.median(t['settle']['fps']for t in ts),'maxCssStretch':max(max(s['scale'],1/s['scale'])for t in ts for phase in t['zoomPhases']for s in phase['trace'])})
  for variant in ['version31',candidate]:
   for a,b in zip(groups['baseline'],groups[variant]):
    assert a['pair']==b['pair']
    for x,y in zip(a['zoomPhases'],b['zoomPhases']):
     for q,r in zip(x['trace'],y['trace']):
      maxWidth=max(maxWidth,abs(q['logicalWidth']-r['logicalWidth']))
      u=list(map(float,re.search(r'translate3d\(([-.\d]+)px, ([-.\d]+)px',q['transform']).groups()));v=list(map(float,re.search(r'translate3d\(([-.\d]+)px, ([-.\d]+)px',r['transform']).groups()));maxTranslate=max(maxTranslate,*[abs(k-l)for k,l in zip(u,v)])
 assert maxWidth<.01 and maxTranslate<.1,(maxWidth,maxTranslate)
 data={'candidate':candidate,'trials':len(p['trials']),'rows':rows,'quietRefreshFpsRange':[min(t['quietRefreshFps']for t in p['trials']),max(t['quietRefreshFps']for t in p['trials'])],'geometry':{'maxLogicalWidthDifference':maxWidth,'maxTranslationDifference':maxTranslate},'inference':'Exploratory matched triplets; stable approximately 60Hz; no statistical superiority or equivalence claim; no recording/profiling during primary trials'}
 (out/f'summary-{candidate}.json').write_text(json.dumps(data,ensure_ascii=False,indent=2));result.append(data)
 for row in rows:print(candidate,row['language'],row['floor'],row['variant'],round(row['zoomFps'],2),'p95',row['p95Ms'],'pan',round(row['panFps'],2))
(out/'summary-all.json').write_text(json.dumps(result,ensure_ascii=False,indent=2))
