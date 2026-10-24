import test from 'node:test';
import assert from 'node:assert/strict';
import { createLocationEstimator } from '../src/geolocation-estimator.js';
import { createLocationMotion } from '../src/geolocation-motion.js';
import { GEOREFERENCE, METERS_PER_LONGITUDE } from '../src/geolocation-model.js';
const fix = (east, time, accuracy = 8) => ({ timestamp: time, coords: { latitude: GEOREFERENCE.latitude,
  longitude: GEOREFERENCE.longitude + east / METERS_PER_LONGITUDE, accuracy } });
const east = c => (c.longitude - GEOREFERENCE.longitude) * METERS_PER_LONGITUDE;

test('time/accuracy weighting reduces stationary jitter without shrinking reported accuracy', () => {
  const filter = createLocationEstimator();
  filter.update(fix(0, 0));
  const errors = [];
  for (let i = 1; i <= 60; i++) {
    const result = filter.update(fix(i % 2 ? 5 : -5, i * 1000));
    errors.push(east(result.coords));
    assert.equal(result.coords.accuracy, 8);
  }
  assert.ok(Math.sqrt(errors.reduce((s,x) => s+x*x, 0) / errors.length) < 2);
  const precise = createLocationEstimator(), noisy = createLocationEstimator();
  precise.update(fix(0,0)); noisy.update(fix(0,0));
  assert.ok(east(precise.update(fix(6,1000,5)).coords) > east(noisy.update(fix(6,1000,50)).coords));
});

test('walking remains responsive and elapsed time affects gain, not callback frequency', () => {
  const f = createLocationEstimator(); f.update(fix(0,0));
  for(let i=1;i<=30;i++) {
    const result=f.update(fix(i*1.4,i*1000));
    assert.ok(i*1.4-east(result.coords)<3, 'walking lag below 3m for this synthetic 8m-accuracy sequence');
  }
  const fast=createLocationEstimator(),slow=createLocationEstimator();
  fast.update(fix(0,0));slow.update(fix(0,0));
  assert.ok(east(slow.update(fix(5,4000)).coords)>east(fast.update(fix(5,200)).coords));
});

test('isolated jumps are held; coherent relocated fixes and long outages can reacquire', () => {
  const f=createLocationEstimator();f.update(fix(0,0));
  assert.equal(f.update(fix(80,1000)).status,'outlier');
  assert.ok(Math.abs(east(f.update(fix(0,2000)).coords))<1e-7);
  assert.equal(f.update(fix(80,3000)).status,'outlier');
  assert.equal(f.update(fix(81,4000)).status,'outlier');
  assert.equal(f.update(fix(82,5000)).status,'reacquired');
  assert.equal(f.update(fix(180,21000)).status,'reset');
});

test('duplicate/older/bad fixes never fuse repeatedly or rewind the estimate', () => {
  const f=createLocationEstimator(), first=f.update(fix(0,1000)).coords;
  assert.deepEqual(f.update(fix(20,1000)).coords,first);
  assert.deepEqual(f.update(fix(20,999)).coords,first);
  assert.equal(f.update(fix(20,2000,101)).status,'imprecise');
  assert.equal(f.update(fix(20,NaN)).status,'invalid');
  assert.equal(f.update(fix(20,3000,-1)).status,'invalid');
});

test('animation retargets continuously and finishes within 250ms without overshoot', () => {
  const m=createLocationMotion();m.update(fix(0,0).coords,0);
  m.update(fix(10,0).coords,1000);
  assert.ok(east(m.sample(1100))>0 && east(m.sample(1100))<10);
  const before=m.sample(1100);m.update(fix(20,0).coords,1100);
  assert.deepEqual(m.sample(1100),before);
  assert.ok(Math.abs(east(m.sample(1350))-20)<1e-7);
  assert.equal(m.active(1350),false);
  assert.deepEqual(m.sample(1350),m.sample(5000));
  m.update(fix(30,0).coords,6000);m.finish();
  assert.ok(Math.abs(east(m.sample(6000))-30)<1e-7);
});
