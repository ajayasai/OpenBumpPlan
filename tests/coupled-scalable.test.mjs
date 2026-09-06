import test from 'node:test';
import assert from 'node:assert/strict';
import { coupledDemoProject } from '../src/core/demo.js';
import { normalizeProject, clone } from '../src/core/model.js';
import { optimizeCoupledScalable } from '../src/core/coupled-search.js';
import { verifyCoupledProof } from '../src/core/coupled-proof.js';
import { optimizeScalable } from '../src/core/scalable.js';
import { optimizeExact } from '../src/core/solver.js';
import { fixture, seeded, synthetic } from './helpers.mjs';
function padded(){const p=coupledDemoProject();for(let i=0;i<21;i++){
 p.ports.push({id:`ZZsource${i}`,kind:'pad',x:2000+i*1000,y:0,net:`ISO${i}`,domain:'V',role:'signal',required:true},
 {id:`ZZtarget${i}`,kind:'ball',x:2010+i*1000,y:0,net:`ISO${i}`,domain:'V',role:'signal'});
}return normalizeProject(p);}
test('coupled proof repairs an invalid relaxed optimum without disabling hard rules',()=>{
 const p=coupledDemoProject(),a=optimizeScalable(p),b=optimizeCoupledScalable(p);
 assert.equal(a.feasible,false);assert.equal(b.status,'certified-coupled-optimal');assert.equal(b.objectiveUm,300);assert.equal(b.after.errors,0);assert.equal(verifyCoupledProof(p,b.proof).ok,true);
});
test('24 movable sources with coupling exceed the old permutation limit',()=>{
 const p=padded();assert.throws(()=>optimizeExact(p),/12 movable/);
 const r=optimizeCoupledScalable(p,'pad','ball',{maxSubproblems:128});
 assert.equal(r.status,'certified-coupled-optimal');assert.equal(r.scope.sourceIds.length,24);assert.equal(r.after.errors,0);assert.equal(r.verification.ok,true);
});
test('4096-site sparse example is also coupled certified when first optimum passes all rules',()=>{
 const p=synthetic(2048);p.rules.maxLength=500;const r=optimizeCoupledScalable(p,'pad','ball',{timeLimitMs:60000});assert.equal(r.feasible,true);assert.equal(r.status,'certified-coupled-optimal');assert.equal(r.stats.subproblems,1);
});
test('one subproblem cannot masquerade as complete coupled search',()=>{
 const p=coupledDemoProject(),r=optimizeCoupledScalable(p,'pad','ball',{maxSubproblems:1});
 assert.equal(r.status,'unknown');assert.deepEqual(r.project,p);assert.equal(r.verification.ok,true);const forged=clone(r.proof);forged.claim='optimal';assert.equal(verifyCoupledProof(p,forged).ok,false);
});
test('proof corruption fails independent replay',()=>{
 const p=coupledDemoProject(),r=optimizeCoupledScalable(p);
 for(const mutate of [x=>x.records.pop(),x=>x.records[0].certificate.potentials[0]+=100,x=>x.records[0].certificate.objectiveTicks++,x=>x.records[0].id='fabricated',x=>x.records.push(clone(x.records[0])),x=>x.bestNodeId='root',x=>x.problemSHA256='fake',x=>x.scope.changePenalty=1,x=>x.claim='infeasible']){
  const f=clone(r.proof);mutate(f);assert.equal(verifyCoupledProof(p,f).ok,false);
 }
});
test('incomplete geometric analysis never excludes an unknown candidate',()=>{
 const p=synthetic(40);p.rules.geometryBudget=100;const r=optimizeCoupledScalable(p,'pad','ball',{maxSubproblems:8});
 assert.equal(r.status,'unknown');assert.equal(r.stopReason,'analysis-incomplete');assert.equal(r.verification.ok,true);
 const forged=clone(r.proof);forged.records.push(clone(forged.records[0]));assert.equal(verifyCoupledProof(p,forged).ok,false);
});
test('exhaustive no-feasible-mapping proof for a genuinely impossible coupled rule',()=>{
 const p=fixture();p.rules.groundRadius=10;const r=optimizeCoupledScalable(p);
 assert.equal(r.status,'infeasible');assert.equal(r.verification.ok,true);assert.deepEqual(r.project,p);
});
for(let seed=1;seed<=12;seed++)test(`coupled integer objective agrees with exhaustive small search ${seed}`,()=>{
 const rand=seeded(seed),p=synthetic(4);p.rules.crossingWeight=0;p.rules.maxLength=1e6;
 p.ports.forEach(n=>{n.x=Math.floor(rand()*100);n.y=Math.floor(rand()*100);});
 const a=optimizeExact(p,'pad','ball',{maxNodes:100000,timeLimitMs:5000}),b=optimizeCoupledScalable(p,'pad','ball',{quantum:1});
 assert.equal(a.feasible,b.feasible);if(a.feasible){assert.equal(b.status,'certified-coupled-optimal');assert.equal(b.objectiveUm,a.objective);}
});
