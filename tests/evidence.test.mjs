import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256JSON,createEvidence,verifyEvidence } from '../src/core/evidence.js';
import { solveExactStage } from '../src/core/exact.js';
import { routeStage } from '../src/core/routing.js';
import { clone,stableStringify } from '../src/core/model.js';
import { fixture } from './helpers.mjs';
test('Web Crypto digest matches the independent Node implementation',async()=>{
  for(const data of [null,[],{},'日本語 µ',123,true,{z:2,a:[1,{b:3}]}])assert.equal(await sha256JSON(data),createHash('sha256').update(stableStringify(data)).digest('hex'));
  assert.equal(await sha256JSON({b:2,a:1}),await sha256JSON({a:1,b:2}));
});
test('nonfinite and non-JSON evidence rejected without lossy coercion',async()=>{
  for(const v of [NaN,Infinity,undefined,{v:undefined},new Date(),new Map(),()=>{}])await assert.rejects(sha256JSON(v));
});
test('exact evidence replays and binds the full input revision',async()=>{
  const p=fixture(),e=await createEvidence(p,'exact',solveExactStage(p)),r=await verifyEvidence(p,e);assert.equal(r.valid,true);assert.equal(r.planningPass,true);
  for(const mutate of [q=>q.revision++,q=>q.ports[0].x++,q=>q.rules.maxLength++,q=>q.connections[0].locked=true]){const changed=clone(p);mutate(changed);assert.match((await verifyEvidence(changed,e)).reason,/Stale/);}
});
test('a recomputed checksum cannot disguise a fabricated optimum',async()=>{
  const p=fixture(),r=solveExactStage(p);r.upperBound=1;r.status='optimal';const e=await createEvidence(p,'exact',r),checked=await verifyEvidence(p,e);assert.equal(checked.valid,false);assert.match(checked.reason,/replay disagrees/);
});
test('direct envelope corruption is rejected',async()=>{
  const p=fixture(),e=await createEvidence(p,'exact',solveExactStage(p));e.result.reason='tampered';assert.match((await verifyEvidence(p,e)).reason,/checksum/);
});
test('unknown/partial evidence is verifiable without being promoted to planning pass',async()=>{
  const p=fixture();p.rules.maxLength=1;const r=solveExactStage(p),e=await createEvidence(p,'exact',r),v=await verifyEvidence(p,e);assert.equal(v.valid,true);assert.equal(v.planningPass,false);assert.equal(v.status,'infeasible');
});
test('routing evidence replays and rejects a changed route even after rehashing',async()=>{
  const p=fixture();p.ports[0].y=p.ports[1].y=100;const r=routeStage(p,'pad','ball',{pitch:100,columns:5,rows:5,passes:1}),e=await createEvidence(p,'routing',r);
  assert.equal((await verifyEvidence(p,e)).valid,true);
  r.routes[0].points[0].x=100;const bad=await createEvidence(p,'routing',r);assert.equal((await verifyEvidence(p,bad)).valid,false);
});
test('replay budgets and engine versions are checked',async()=>{
  const p=fixture(),e=await createEvidence(p,'exact',solveExactStage(p));assert.match((await verifyEvidence(p,e,{maxReplayNodes:1})).reason,/budget/);
  e.engineVersion='future';assert.match((await verifyEvidence(p,e)).reason,/version/);
});
