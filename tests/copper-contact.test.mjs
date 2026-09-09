import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyProject, normalizeProject, stableStringify } from '../src/core/model.js';
import { verifyCopper } from '../src/core/copper.js';
function pair() {
  const raw=emptyProject('Positive-clearance contact regression');
  Object.assign(raw.rules,{groundRadius:0,powerRadius:0,minGroundRatio:0,clockGroundMin:0,maxLength:1000,maxCrossings:0});
  raw.ports=[{id:'s0',kind:'pad',x:10,y:10,net:'A',role:'signal'},{id:'t0',kind:'ball',x:30,y:10},{id:'s1',kind:'pad',x:10,y:12,net:'B',role:'signal'},{id:'t1',kind:'ball',x:30,y:12}];
  raw.ports.forEach(p=>p.domain='V1');raw.connections=[{id:'e0',from:'s0',to:'t0'},{id:'e1',from:'s1',to:'t1'}];
  const p=normalizeProject(raw),key=structuredClone(p);delete key.audit;delete key.revision;
  const w={type:'openbumpplan-route-witness',schemaVersion:1,designKey:stableStringify(key),config:{fromKind:'pad',toKind:'ball',pitch:1,originX:0,originY:0,columns:50,rows:50,layers:1,startLayer:0,endLayer:0},routes:[0,1].map(i=>({connectionId:'e'+i,path:Array.from({length:21},(_,x)=>[10+x,10+2*i,0])})),metrics:{routed:2,wireLength:40,vias:0}};
  return {p,w};
}
for(const clearance of [0,1e-12,1e-9,1e-8,1e-7,1])for(const width of [2,2+1e-9,2.1])test(`Copper contact stays rejected at clearance=${clearance}, width=${width}`,()=>{
  const {p,w}=pair(),r=verifyCopper(p,w,{units:'um',traceWidth:width,padDiameter:.1,viaDiameter:.1,clearance});assert(r.complete,JSON.stringify(r));assert(!r.ok);assert(r.issues.some(i=>i.code==='COPPER_CLEARANCE'));
});
for(const clearance of [0,1e-12,.1,1])test(`Separated copper remains accepted at clearance=${clearance}`,()=>{
  const {p,w}=pair(),r=verifyCopper(p,w,{units:'um',traceWidth:1,padDiameter:.1,viaDiameter:.1,clearance});assert(r.ok,JSON.stringify(r));
});
