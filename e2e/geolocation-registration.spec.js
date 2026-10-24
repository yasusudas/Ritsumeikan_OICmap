import { test, expect, chooseFloor, screenshot, settleMapLayout } from './helpers.js';
import { GEOREFERENCE as g, METERS_PER_LATITUDE, METERS_PER_LONGITUDE } from '../src/geolocation-model.js';
// Synthetic input isolates software registration, not real geographic accuracy.
const x=586.082-g.x[2], y=802.402-g.y[2], det=g.x[0]*g.y[1]-g.x[1]*g.y[0];
const position={latitude:g.latitude+(-g.y[0]*x+g.x[0]*y)/det/METERS_PER_LATITUDE,
  longitude:g.longitude+(g.y[1]*x-g.x[1]*y)/det/METERS_PER_LONGITUDE,accuracy:8};

for(const lang of ['ja','en']) test(`GPS B southeast regression retains exact 1F frame ${lang}`, async ({page,context},testInfo)=>{
  await context.grantPermissions(['geolocation']);await context.setGeolocation(position);
  await page.goto(lang==='ja'?'/':'/en/');
  const measure=()=>page.locator('.gps-location-dot').evaluate(dot=>{
    const v=dot.ownerSVGElement.viewBox.baseVal,b=dot.getBoundingClientRect();
    return {x:dot.cx.baseVal.value/v.width*1190.55,y:dot.cy.baseVal.value/v.height*841.89,screenX:b.x+b.width/2,screenY:b.y+b.height/2};
  });
  await expect(page.locator('.gps-location-dot')).toHaveCount(1);
  await settleMapLayout(page);
  const reference=await measure();
  expect(reference.x).toBeCloseTo(586.082*(lang==='en'?.999625:1),4);
  expect(reference.y).toBeCloseTo(802.402*(lang==='en'?.999625:1)+(lang==='en'?.106:0),4);
  for(const floor of ['2F','3F','4F','5F','1F']) {
    await chooseFloor(page,floor);
    await expect(page.locator('.gps-location-layer')).toHaveAttribute('data-floor',floor);
    await expect.poll(async()=>{const p=await measure();return Math.hypot(p.screenX-reference.screenX,p.screenY-reference.screenY);}).toBeLessThan(.01);
    const p=await measure();expect(p.x).toBeCloseTo(reference.x,8);expect(p.y).toBeCloseTo(reference.y,8);
  }
  await screenshot(page,testInfo,`gps-B-common-frame-${lang}`);
});
