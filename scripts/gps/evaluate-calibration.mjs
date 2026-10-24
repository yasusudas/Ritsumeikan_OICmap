import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import calibration from '../../src/assets/gps-calibration.json' with { type: 'json' };

const local = (p,g) => [(p.longitude-g.longitude)*111320*Math.cos(g.latitude*Math.PI/180), (p.latitude-g.latitude)*111320];
// An offline candidate fit, never an automatic runtime replacement. Calibration
// points and independent validation points must remain separate in the input.
export function fitCalibration(points, reference = calibration.georeference) {
  if(points.length<3) throw Error('At least three control points are required');
  const rows=points.map(p=>[...local(p,reference),1]);
  const fit=axis=>{
    const a=[0,1,2].map(i=>[0,1,2].map(j=>rows.reduce((s,row)=>s+row[i]*row[j],0))
      .concat(rows.reduce((s,row,k)=>s+row[i]*points[k].svg[axis],0)));
    for(let i=0;i<3;i++) {
      const pivot=[i,...Array.from({length:2-i},(_,j)=>j+i+1)].reduce((best,j)=>Math.abs(a[j][i])>Math.abs(a[best][i])?j:best,i);
      [a[i],a[pivot]]=[a[pivot],a[i]];
      if(Math.abs(a[i][i])<1e-10) throw Error('Calibration controls are collinear or degenerate');
      const divisor=a[i][i];a[i]=a[i].map(v=>v/divisor);
      for(let j=0;j<3;j++) if(j!==i) {const factor=a[j][i];a[j]=a[j].map((v,k)=>v-factor*a[i][k]);}
    }
    return a.map(row=>row[3]);
  };
  return {...reference,x:fit(0),y:fit(1)};
}

export function evaluateCalibration(points, g) {
  const det=g.x[0]*g.y[1]-g.x[1]*g.y[0];
  if(!Number.isFinite(det)||Math.abs(det)<1e-10) throw Error('Singular geographic transform');
  const residuals=points.map(p=>{
    const [e,n]=local(p,g), dx=g.x[0]*e+g.x[1]*n+g.x[2]-p.svg[0], dy=g.y[0]*e+g.y[1]*n+g.y[2]-p.svg[1];
    return {id:p.id,svg:Math.hypot(dx,dy),metres:Math.hypot((g.y[1]*dx-g.x[1]*dy)/det,(-g.y[0]*dx+g.x[0]*dy)/det)};
  });
  return {count:points.length,rmseMetres:Math.sqrt(residuals.reduce((s,p)=>s+p.metres**2,0)/points.length),
    maxMetres:Math.max(...residuals.map(p=>p.metres)),residuals};
}

export function calibrationReport(data = calibration) {
  const controls=data.points.filter(p=>p.role==='control'), holdouts=data.points.filter(p=>p.role==='validation');
  if(holdouts.length<3) throw Error('At least three independent validation points are required');
  const candidate=fitCalibration(controls,data.georeference);
  const baseline=evaluateCalibration(holdouts,data.georeference), check=evaluateCalibration(holdouts,candidate);
  const loo=data.points.map((p,i)=>evaluateCalibration([p],fitCalibration(data.points.filter((_,j)=>j!==i),data.georeference)).residuals[0]);
  return {controlCount:controls.length,validationCount:holdouts.length,
    controlSvgBounds:[Math.min(...controls.map(p=>p.svg[0])),Math.min(...controls.map(p=>p.svg[1])),Math.max(...controls.map(p=>p.svg[0])),Math.max(...controls.map(p=>p.svg[1]))],
    baseline,candidate:{georeference:candidate,validation:check},
    improvesIndependentValidation:check.rmseMetres<baseline.rmseMetres-0.01&&check.maxMetres<baseline.maxMetres-0.01,
    exploratoryLeaveOneOut:{maxMetres:Math.max(...loo.map(p=>p.metres)),residuals:loo},
    warning:'OSM/diagram correspondences are not surveyed truth. Leave-one-out is diagnostic only. Independently identify B/C and southeast points before changing production coefficients.'};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href) {
  const data=process.argv[2]?JSON.parse(readFileSync(process.argv[2],'utf8')):calibration;
  console.log(JSON.stringify(calibrationReport(data),null,2));
}
