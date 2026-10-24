import test from 'node:test';
import assert from 'node:assert/strict';
import {mapVisibleRect,transformBounds,overlaps} from './svg-viewport-math.mjs';

test('translated and enlarged map: viewport corners project into an offset viewBox',()=>{
 const rect=mapVisibleRect({x:-400,y:-200,width:2000,height:1000,viewportWidth:800,viewportHeight:600},{x:10,y:20,width:1000,height:500},0);
 assert.deepEqual(rect,{left:210,top:120,right:610,bottom:420});
 // A room outside the image's original top-left is visible after panning.
 assert.ok(overlaps({left:300,top:150,right:350,bottom:180},rect));
 assert.equal(overlaps({left:20,top:30,right:40,bottom:50},rect),false);
});
test('overscan remains 64 CSS pixels at different zooms',()=>{
 for(const scale of [.5,1,6]){
  const view={x:-100,y:-80,width:1000*scale,height:500*scale,viewportWidth:960,viewportHeight:800},box={x:0,y:0,width:1000,height:500};
  const tight=mapVisibleRect(view,box,0),buffered=mapVisibleRect(view,box,64);
  assert.ok(Math.abs((tight.left-buffered.left)*scale-64)<1e-9);
  assert.ok(Math.abs((buffered.bottom-tight.bottom)*scale-64)<1e-9);
 }
});
test('affine bounds include all corners under rotation and shear',()=>{
 const box={x:10,y:20,width:30,height:40},matrix={a:0,b:2,c:-3,d:1,e:100,f:-50};
 assert.deepEqual(transformBounds(box,matrix,8),{left:-88,right:48,top:-18,bottom:98});
 for(const [x,y]of [[10,20],[40,20],[10,60],[40,60]]){
  const px=matrix.a*x+matrix.c*y+matrix.e,py=matrix.b*x+matrix.d*y+matrix.f;
  assert.ok(overlaps({left:px,right:px,top:py,bottom:py},transformBounds(box,matrix)));
 }
});
test('edge-touching and zero-size geometry are conservatively retained',()=>{
 const viewport={left:10,right:20,top:10,bottom:20};
 assert.ok(overlaps({left:0,right:10,top:10,bottom:11},viewport));
 assert.ok(overlaps(transformBounds({x:9,y:9,width:0,height:0},{a:1,b:0,c:0,d:1,e:0,f:0},8),viewport));
 assert.equal(overlaps({left:20.001,right:21,top:10,bottom:20},viewport),false);
});
test('unmeasurable layout postpones culling',()=>{
 for(const width of [0,-1,NaN])assert.equal(mapVisibleRect({x:0,y:0,width,height:1,viewportWidth:1,viewportHeight:1},{x:0,y:0,width:10,height:10}),null);
});
