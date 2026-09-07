import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture } from './helpers.mjs';
import { routeStage } from '../src/core/routing.js';
import { verifyCopper } from '../src/core/copper.js';
import { verifyCopper as previousCopper } from './oracles/copper-v030.mjs';
import { createReviewBundle } from '../src/core/evidence.js';
function parallel(){const p=fixture();p.ports.push({...p.ports[0],id:'s2',y:10,net:'DATA2'},{...p.ports[1],id:'t2',y:10});p.connections.push({id:'e2',from:'s2',to:'t2',locked:false,net:''});return p;}
const technology={units:'um',traceWidth:10,viaDiameter:1,padDiameter:1,clearance:0};
for(const clearance of [0,Number.MIN_VALUE,1e-12,1e-9,1e-8,2e-8,.001,1]) {
 for(const [label,width] of [['touching',10],['slightly overlapping',10+5e-9]])test(`${label} traces never pass clearance ${clearance}`,()=>{
  const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});const c=verifyCopper(p,r,{...technology,traceWidth:width,clearance});
  assert.equal(c.complete,true);assert.equal(c.ok,false);assert.ok(c.issues.some(i=>i.code==='COPPER_CLEARANCE'));
 });
 test(`touching pads and trace-pad boundaries fail clearance ${clearance}`,()=>{
  const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});
  const pads=verifyCopper(p,r,{...technology,traceWidth:1,padDiameter:10,clearance});assert.ok(pads.issues.some(i=>i.code==='PAD_PAD_CLEARANCE'));
  const routePad=verifyCopper(p,r,{...technology,traceWidth:18,padDiameter:2,clearance});assert.ok(routePad.issues.some(i=>i.code==='PAD_CLEARANCE'));
 });
 test(`touching keepout fails clearance ${clearance}`,()=>{
  const p=fixture();p.keepouts=[{id:'k',dieId:'',kinds:['pad','ball'],x:40,y:10,width:20,height:3}];
  const r=routeStage(p,'pad','ball',{pitch:10,layers:1});assert.equal(r.verified,true);
  const c=verifyCopper(p,r,{...technology,traceWidth:20,clearance});assert.ok(c.issues.some(i=>i.code==='COPPER_KEEPOUT'));
 });
}
test('regression reproduces the old tiny-positive-clearance false pass',async()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1}),t={...technology,clearance:1e-9};
 assert.equal(previousCopper(p,r,t).ok,true);assert.equal(verifyCopper(p,r,t).ok,false);
 r.technology=t;await assert.rejects(()=>createReviewBundle(p,{routing:r}),/invalid continuous copper/);
});
test('positive exact clearance still passes when conductors are genuinely separated',()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});
 assert.equal(verifyCopper(p,r,{...technology,traceWidth:6,clearance:4}).ok,true);
 assert.equal(verifyCopper(p,r,{...technology,traceWidth:10-5e-8,clearance:1e-9}).ok,true);
});
test('increasing nonnegative clearance cannot change a rejection to acceptance',()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});
 for(const width of [1,6,9.99999999,10,10.00000001,12]){
  let rejected=false;
  for(const clearance of [0,Number.MIN_VALUE,1e-12,1e-9,1e-8,1e-7,.1,1,4,10]){
   const c=verifyCopper(p,r,{...technology,traceWidth:width,clearance});assert.equal(c.complete,true);
   if(rejected)assert.equal(c.ok,false);rejected ||= !c.ok;
  }
 }
});
