import test from 'node:test';
import assert from 'node:assert/strict';
import { calibrationReport, fitCalibration } from '../scripts/gps/evaluate-calibration.mjs';
test('calibration holds validation points out of fitting and reports remaining geographic error',()=>{
  const report=calibrationReport();
  assert.equal(report.controlCount,3);assert.equal(report.validationCount,4);
  assert.equal(report.improvesIndependentValidation,false);
  assert.ok(report.baseline.maxMetres>7&&report.baseline.maxMetres<7.3);
  assert.ok(report.exploratoryLeaveOneOut.maxMetres>8);
  assert.ok(report.controlSvgBounds[3]<333,'southeast map remains outside control coverage');
});
test('recalibration refuses insufficient or degenerate controls',()=>{
  assert.throws(()=>fitCalibration([]),/three/);
  const point={latitude:34.81,longitude:135.561,svg:[500,300]};
  assert.throws(()=>fitCalibration([point,point,point]),/degenerate/);
});
