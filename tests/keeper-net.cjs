'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const source=fs.readFileSync('js/render3d.js','utf8');
const context={Math,clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),lerp:(a,b,t)=>a+(b-a)*t};vm.createContext(context);
vm.runInContext(source.slice(source.indexOf('    function netStretch'),source.indexOf('    function updateCloth'))+source.slice(source.indexOf('    function pose('),source.indexOf('    const rigs =')),context);
const net={side:1,pin:[0,1],p0:[5,4,1,5,4,1]},normal=[1,0,0];
const hit={side:1,x:5,y:4,z:1,s:1,t:0.12};
assert(context.netStretch(net,0,normal,hit)>2.5,'exaggerated impact stretch');
assert.equal(context.netStretch(net,1,normal,hit),0,'frame remains pinned');
assert.equal(context.netStretch(net,0,normal,{...hit,side:0}),0,'opposite net remains still');
assert.equal(context.netStretch(net,0,normal,{...hit,t:2.6}),0,'stretch settles');
assert.equal(context.netStretch(net,0,normal,{...hit,t:0}),0,'starts without a visual pop');
function joint(){return {rotation:{set(x,y,z){this.x=x;this.y=y;this.z=z;}},position:{y:0}};}
function rig(){return {pelvis:joint(),torso:joint(),head:joint(),aL:{sh:joint(),el:joint()},aR:{sh:joint(),el:joint()},lL:{hip:joint(),kn:joint()},lR:{hip:joint(),kn:joint()},yaw:Math.PI/2,accF:0,accL:0,ph:0};}
for(const anim of ['dive_hi','dive_lo']){
 const r=rig(),p={vx:0,vy:5,dvSide:1,isGK:true},m={t:0,ball:{owner:null}};let previous;
 for(let i=0;i<=100;i++){
  context.pose(r,anim,i/100,p,m,1/60);
  const values=[r.pelvis.position.y,r.pelvis.rotation.z,r.torso.rotation.y,r.aL.sh.rotation.x,r.aL.el.rotation.x,r.lL.kn.rotation.x];
  assert(values.every(Number.isFinite));
  if(previous)values.forEach((v,j)=>assert(Math.abs(v-previous[j])<0.25,'continuous joint motion'));
  previous=values;
 }
 assert(Math.abs(r.pelvis.position.y-0.92)<0.001,'returns upright');assert.equal(r.pelvis.rotation.z,0);
}
const ready=rig(),p={vx:0,vy:0,isGK:true},m={t:0,ball:{owner:null}};context.pose(ready,'idle',0,p,m,1/60);const y=ready.pelvis.position.y;m.t=0.2;context.pose(ready,'idle',0,p,m,1/60);assert.notEqual(y,ready.pelvis.position.y);
console.log('PASS exaggerated local net stretch, pinned frame, settled rebound, continuous articulated high/low dives, upright recovery and living keeper stance.');
