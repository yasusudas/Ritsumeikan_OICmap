"""Generate review-only 1F topology hypotheses; never production routing data."""
import json,sys,math,hashlib
from pathlib import Path
import numpy as np
import cv2

source=Path(sys.argv[1]);out=Path(sys.argv[2]);root=Path(sys.argv[3])
geom=json.loads(source.read_text());index=json.loads((root/'public/manual-search-index.json').read_text())
W,H=1191,842
def polygon(points):return np.rint(points).astype(np.int32)
def paint(mask,points,value):cv2.fillPoly(mask,[polygon(points)],value)
def svgpoly(poly):return [[p['xRatio']*1190.55,p['yRatio']*841.89] for p in poly]
def inside_map(x,y):return 90<x<1115 and 100<y<811 and not(x>640 and y<220) and not(x>650 and y>550)
indoor=np.zeros((H,W),np.uint8);outdoor=indoor.copy();blocked=indoor.copy();shared=indoor.copy()
floor_colors={'rgb(220, 221, 221)','rgb(201, 202, 202)','rgb(181, 182, 182)'}
ink={'rgb(34, 24, 21)','rgb(34, 31, 32)','rgb(173, 24, 31)'}
for f in geom['fills']:
 if f['area']<60:continue
 if f['fill'] in floor_colors:paint(indoor,f['pts'],255)
 elif f['fill']=='rgb(237, 225, 203)':paint(outdoor,f['pts'],255)
 elif f['fill'] not in ink:paint(blocked,f['pts'],255)
rooms=[]
for e in geom['entries']:
 polys=[svgpoly(p) for p in (e.get('outlines') or e.get('polygons') or [])]
 is_shared=e['label'] in ['TRY SQUARE','空のプラザ','テラス']
 if is_shared:
  for poly in polys:paint(shared,poly,255)
 if polys and not is_shared:rooms.append({'sourceId':e['id'],'label':e['label'],'polygons':polys})
indoor[blocked>0]=0;outdoor[blocked>0]=0
mask=cv2.bitwise_or(cv2.bitwise_or(indoor,outdoor),shared)
for yy in range(H):
 for xx in range(W):
  if not inside_map(xx,yy):mask[yy,xx]=indoor[yy,xx]=outdoor[yy,xx]=shared[yy,xx]=0
# No dilation or gap closing: disconnected source areas remain disconnected.
count,components,stats,centers=cv2.connectedComponentsWithStats(mask,8)
for i in range(1,count):
 if stats[i,cv2.CC_STAT_AREA]<30:mask[components==i]=0
count,components,stats,centers=cv2.connectedComponentsWithStats(mask,8)
regions=[]
for i in range(1,count):
 component=(components==i).astype(np.uint8)
 contours,hierarchy=cv2.findContours(component,cv2.RETR_CCOMP,cv2.CHAIN_APPROX_SIMPLE)
 regions.append({'id':f'W{i:02d}','kind':'walkable-area-candidate','review':'pending','enabled':False,
  'areaSvg2':int(stats[i,cv2.CC_STAT_AREA]),'center':[int(v) for v in reversed(np.unravel_index(np.argmax(cv2.distanceTransform(component,cv2.DIST_L2,5)),component.shape))],
  'rings':[cv2.approxPolyDP(c,.35,True)[:,0,:].tolist() for c in contours],
  'holes':[bool(h[3]>=0) for h in hierarchy[0]],
  'evidence':['diagram-floor-fill','non-floor-fill-subtracted','search-polygons-are-reference-only'],
  'containsOutdoor':bool(np.any(outdoor[components==i])),'containsSharedSpace':bool(np.any(shared[components==i]))})

def thin(binary):
 a=np.pad((binary>0).astype(np.uint8),1)
 for iteration in range(1000):
  changed=0
  for phase in [0,1]:
   p=a[1:-1,1:-1];n=[a[:-2,1:-1],a[:-2,2:],a[1:-1,2:],a[2:,2:],a[2:,1:-1],a[2:,:-2],a[1:-1,:-2],a[:-2,:-2]]
   b=sum(n);trans=sum(((n[i]==0)&(n[(i+1)%8]==1)).astype(np.uint8) for i in range(8))
   c1=n[0]*n[2]*(n[4] if phase==0 else n[6]);c2=(n[2] if phase==0 else n[0])*n[4]*n[6]
   remove=(p==1)&(b>=2)&(b<=6)&(trans==1)&(c1==0)&(c2==0)
   changed+=int(remove.sum());p[remove]=0
  if not changed:break
 return a[1:-1,1:-1]
skel=thin(mask)
pixels={(int(x),int(y)) for y,x in zip(*np.where(skel))}
def neighbors(p,points):
 x,y=p;result=[]
 for dx,dy in [(0,-1),(1,0),(0,1),(-1,0),(-1,-1),(1,-1),(1,1),(-1,1)]:
  q=(x+dx,y+dy)
  if q in points and not(dx and dy and ((x+dx,y) in points or (x,y+dy) in points)):result.append(q)
 return result
# Prune very short raster skeleton twigs, never connect components.
for _ in range(4):
 remove=set()
 for p in list(pixels):
  if len(neighbors(p,pixels))!=1:continue
  trail=[p];previous=None;current=p
  for k in range(7):
   ns=[n for n in neighbors(current,pixels) if n!=previous]
   if len(ns)!=1:break
   previous,current=current,ns[0];trail.append(current)
   if len(neighbors(current,pixels))!=2:break
  if len(trail)<7 and len(neighbors(current,pixels))>=3:remove.update(trail[:-1])
 pixels-=remove
nodeset={p for p in pixels if len(neighbors(p,pixels))!=2};visited=set();paths=[]
def trace(start,nextp):
 path=[start,nextp];visited.add(frozenset([start,nextp]));prev,cur=start,nextp
 while cur not in nodeset:
  ns=[n for n in neighbors(cur,pixels) if n!=prev]
  if not ns or frozenset([cur,ns[0]]) in visited:break
  prev,cur=cur,ns[0];path.append(cur);visited.add(frozenset([prev,cur]))
 return path
for p in sorted(nodeset,key=lambda p:(p[1],p[0])):
 for n in neighbors(p,pixels):
  if frozenset([p,n]) not in visited:paths.append(trace(p,n))
for p in sorted(pixels):
 for n in neighbors(p,pixels):
  if frozenset([p,n]) not in visited:
   nodeset.add(p);paths.append(trace(p,n))
paths=[p for p in paths if len(p)>=2]
node_ids={p:f'N{i+1:03d}' for i,p in enumerate(sorted({p[0] for p in paths}|{p[-1] for p in paths},key=lambda p:(p[1],p[0])))}
nodes=[{'id':id,'xy':list(p),'kind':'route-node-candidate','review':'pending','enabled':False} for p,id in node_ids.items()]
edges=[{'id':f'R{i+1:03d}','from':node_ids[p[0]],'to':node_ids[p[-1]],'polyline':[list(q) for q in p],
 'kind':'centerline-candidate','review':'pending','enabled':False,'sourceRegion':f'W{components[p[0][1],p[0][0]]:02d}'} for i,p in enumerate(paths)]

ys,xs=np.where(mask>0);zeros=np.column_stack([xs,ys])
distance,labels=cv2.distanceTransformWithLabels((mask==0).astype(np.uint8),cv2.DIST_L2,5,labelType=cv2.DIST_LABEL_PIXEL)
def nearest(p):
 x,y=np.clip(np.rint(p).astype(int),[0,0],[W-1,H-1]);q=zeros[labels[y,x]-1]
 return q.tolist(),float(distance[y,x])
def attach(p):
 q,d=nearest(p)
 if d>14:return None
 # BFS only inside candidate floor area to a skeleton pixel, no through-wall connector.
 queue=[tuple(q)];parent={tuple(q):None};end=None
 for current in queue:
  if current in pixels:end=current;break
  for dx,dy in [(1,0),(-1,0),(0,1),(0,-1)]:
   n=(current[0]+dx,current[1]+dy)
   if 0<=n[0]<W and 0<=n[1]<H and mask[n[1],n[0]] and n not in parent:
    parent[n]=current;queue.append(n)
  if len(queue)>15000:break
 if end is None:return None
 path=[];cur=end
 while cur is not None:path.append(list(cur));cur=parent[cur]
 path.reverse()
 return {'walkPoint':q,'gapSvg':round(d,3),'candidateApproach':path,'gapConfirmed':False}
entrances=[]
for f in geom['fills']:
 if f['fill']!='rgb(34, 24, 21)' or len(f['pts'])!=3 or not 5.7<f['area']<6.2:continue
 xy=np.mean(f['pts'],axis=0).tolist()
 if inside_map(*xy):entrances.append({'xy':xy,'triangle':f['pts'],'kind':'entrance-symbol-candidate','evidence':'small black triangle in original SVG; meaning requires review','attachment':attach(xy)})
entrances.sort(key=lambda e:(e['xy'][1],e['xy'][0]))
for i,e in enumerate(entrances):e.update(id=f'E{i+1:02d}',review='pending',enabled=False)

vertical=[]
for ring in index['facilityRings']:
 if ring['floorId']=='1F' and ring['facilityKey'] in ['stairs','escalator','elevator']:
  xy=[ring['xRatio']*1190.55,ring['yRatio']*841.89]
  vertical.append({'xy':xy,'kind':ring['facilityKey'],'sourceId':ring['id'],'attachment':attach(xy),
   'evidence':'existing facility ring; pictogram center is not a confirmed landing/door','floorConnection':None})
vertical.sort(key=lambda e:(e['xy'][1],e['xy'][0]))
for i,v in enumerate(vertical):v.update(id=f'V{i+1:02d}',review='pending',enabled=False)

doors=[];unattached=[]
for room in rooms:
 candidates=[]
 for poly in room['polygons']:
  for a,b in zip(poly,poly[1:]+poly[:1]):
   if math.dist(a,b)<4:continue
   for t in [.25,.5,.75]:
    p=[a[k]+t*(b[k]-a[k]) for k in [0,1]];q,d=nearest(p)
    if d<9:candidates.append((d+abs(t-.5)*.1,p,q))
 if not candidates:unattached.append(room['sourceId']);continue
 _,p,q=min(candidates,key=lambda c:c[0])
 doors.append({'xy':p,'roomId':room['sourceId'],'label':room['label'],'kind':'door-location-hypothesis',
  'evidence':'nearest room boundary to candidate floor; NOT a detected door','attachment':attach(p),'review':'pending','enabled':False})
doors.sort(key=lambda e:(e['xy'][1],e['xy'][0]))
for i,d in enumerate(doors):d['id']=f'D{i+1:02d}'
for i,r in enumerate(rooms):r.update(id=f'B{i+1:03d}',kind='room-boundary-reference',review='pending',enabled=False)

assert all(mask[y,x] for e in edges for x,y in e['polyline'])
assert all(components[e['polyline'][0][1],e['polyline'][0][0]]==components[y,x] for e in edges for x,y in e['polyline'])
assert len(vertical)==40
result={'schemaVersion':1,'floorId':'1F','coordinateFrame':'ja-1F-registered-svg','viewBox':[0,0,1190.55,841.89],
 'status':'review-only','productionEnabled':False,'gridStepSvg':1,
 'sourceHashes':{n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in ['src/assets/floors/ja/1F.svg','public/manual-search-index.json']},
 'regions':regions,'nodes':nodes,'edges':edges,'entrances':entrances,'vertical':vertical,'doors':doors,'roomBoundaries':rooms,
 'unattachedRoomIds':unattached,
 'limitations':['Floor colors do not prove walkability.','Room boundaries are not verified walls.','Door hypotheses are geometric proximity, not detected doors.','No cross-floor edge is inferred.','Source gaps remain disconnected.','All candidates require human review.'],
 'validation':{'centerlineOutsideCandidatePixels':0,'centerlinesCrossingComponents':0,'verticalCount':len(vertical)}}
(out/'candidates.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
for name,array in [('indoor',indoor),('outdoor',outdoor),('shared',shared)]:
 color={'indoor':(0,166,125),'outdoor':(239,170,33),'shared':(239,170,33)}[name]
 rgba=np.zeros((H,W,4),np.uint8);rgba[:,:,:3]=color[::-1];rgba[:,:,3]=np.where((array>0)&(mask>0),65,0)
 cv2.imwrite(str(out/f'{name}.png'),rgba)
print(json.dumps({k:len(result[k]) for k in ['regions','nodes','edges','entrances','vertical','doors','roomBoundaries','unattachedRoomIds']}))
