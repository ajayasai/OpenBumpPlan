import test from 'node:test';
import assert from 'node:assert/strict';
import { minCostMatching } from '../src/core/mincost.js';
import { sparseAssignmentProblem } from '../src/core/sparse-problem.js';
import { verifyAssignmentCertificate } from '../src/core/assignment-certificate.js';
import { optimizeScalable } from '../src/core/scalable.js';
import { fixture, pairFixture, seeded, synthetic } from './helpers.mjs';
import { clone } from '../src/core/model.js';
function brute(rows){let best=Infinity;function rec(i,used,cost){if(i===rows.length){best=Math.min(best,cost);return;}for(const e of rows[i])if(!used.has(e.j)){used.add(e.j);rec(i+1,used,cost+e.cost);used.delete(e.j);}}rec(0,new Set(),0);return best;}
for(let seed=1;seed<=120;seed++)test(`sparse min-cost matches independent exhaustive oracle ${seed}`,()=>{
  const random=seeded(seed),n=1+seed%6,m=1+(seed*7)%8;
  const rows=Array.from({length:n},()=>Array.from({length:m},(_,j)=>({j,cost:Math.floor(random()*20)})).filter(()=>random()>.28));
  const expected=brute(rows),r=minCostMatching(rows,m);
  if(Number.isFinite(expected)){
    assert.equal(r.status,'optimal');assert.equal(r.objectiveTicks,expected);assert.equal(new Set(r.assignment).size,n);
    const S=n+m,T=S+1,p=r.potentials;
    const check=(u,v,c)=>assert.ok(c+p[u]-p[v]>=0);
    rows.forEach((row,i)=>{check(i,S,0);row.forEach(e=>e.j===r.assignment[i]?check(n+e.j,i,-e.cost):check(i,n+e.j,e.cost));});
    for(let j=0;j<m;j++)r.assignment.includes(j)?check(T,n+j,0):check(n+j,T,0);
  }else{
    assert.equal(r.status,'infeasible');const {sourceIndices:left,targetIndices:right}=r.hall;
    assert.deepEqual(new Set(left.flatMap(i=>rows[i].map(e=>e.j))),new Set(right));assert.ok(left.length>right.length);
  }
});
test('1024 sources exceed old exact limit with checked full graph certificate',()=>{
  const p=synthetic(1024);p.rules.maxLength=500;
  const r=optimizeScalable(p,'pad','ball',{timeLimitMs:60000});
  assert.equal(r.status,'certified-optimal');assert.equal(r.edgeCount,1024);assert.equal(r.verification.ok,true);assert.equal(r.candidateAnalysis.errors,0);
});
test('all nearby compatible arcs retained rather than nearest-k graph pruning',()=>{
  const p=synthetic(16);p.rules.maxLength=1e6;
  assert.equal(sparseAssignmentProblem(p,'pad','ball').edgeCount,256);
});
test('budget exhaustion is unknown, not infeasible, and no design modification',()=>{
  const p=synthetic(20),r=optimizeScalable(p,'pad','ball',{maxAugmentations:0});
  assert.equal(r.status,'unknown');assert.equal(r.certificate,null);assert.deepEqual(r.project,p);
});
test('arc and candidate budgets fail closed without pruning',()=>{
  const p=synthetic(20);
  assert.throws(()=>optimizeScalable(p,'pad','ball',{maxEdges:10}),/budget exceeded/);
  assert.throws(()=>optimizeScalable(p,'pad','ball',{maxCandidateChecks:2}),/budget exceeded/);
});
test('certificate round trip and malicious mutations',()=>{
  const p=synthetic(4),r=optimizeScalable(p),c=r.certificate;
  assert.equal(verifyAssignmentCertificate(p,JSON.parse(JSON.stringify(c))).ok,true);
  for(const mutate of [c=>c.objectiveTicks++,c=>c.assignment[1]=c.assignment[0],c=>c.potentials[0]=1.5,c=>c.potentials[0]=1e100,c=>c.potentials[0]+=12345,c=>c.problemSHA256='0'.repeat(64),c=>c.scope.targetIds.reverse(),c=>c.scope.quantum*=2,c=>c.claim='unknown']){
    const d=clone(c);mutate(d);assert.equal(verifyAssignmentCertificate(p,d).ok,false);
  }
  const stale=clone(p);stale.rules.pairMaxSkew++;assert.equal(verifyAssignmentCertificate(stale,c).ok,false);
});
test('audit/revision metadata excluded from assignment content identity',()=>{
  const p=fixture(),c=optimizeScalable(p).certificate;p.revision++;p.audit.push({time:'now',action:'review'});
  assert.equal(verifyAssignmentCertificate(p,c).ok,true);
});
test('coupled rule failure cannot be applied or mislabelled infeasible',()=>{
  const p=pairFixture();p.rules.pairMaxDistance=10;
  const r=optimizeScalable(p);assert.equal(r.status,'coupled-constraints-rejected');assert.equal(r.feasible,false);assert.equal(r.changed,false);assert.deepEqual(r.project,p);assert.equal(r.verification.ok,true);
});
test('Hall certificate independently verifies and exposes deficient sets',()=>{
  const p=synthetic(3);p.ports=p.ports.filter(n=>n.id!=='t2');p.connections=p.connections.filter(e=>e.to!=='t2');
  const r=optimizeScalable(p);assert.equal(r.status,'infeasible');assert.equal(verifyAssignmentCertificate(p,r.certificate).ok,true);
  r.certificate.hall.targetIndices=[];assert.equal(verifyAssignmentCertificate(p,r.certificate).ok,false);
});
test('ECO subset and locked mappings preserved',()=>{
  const p=synthetic(6);p.connections[0].locked=true;const r=optimizeScalable(p,'pad','ball',{sourceIds:['s1','s2'],changePenalty:100});
  assert.equal(r.feasible,true);assert.deepEqual(r.project.connections.find(e=>e.id==='e0'),p.connections[0]);assert.equal(r.scope.sourceIds.length,2);
});
test('numeric overflow, unknown option and invalid source scope rejected',()=>{
  const p=fixture();
  assert.throws(()=>optimizeScalable(p,'pad','ball',{quantum:0}),/Invalid/);
  assert.throws(()=>optimizeScalable({...p,connections:[]},'pad','ball',{quantum:1e-6,changePenalty:1e9}),/safety bound/);
  assert.throws(()=>optimizeScalable(p,'pad','ball',{maxChanges:0}),/Unknown/);
  assert.throws(()=>optimizeScalable(p,'pad','ball',{sourceIds:['s','s']}),/distinct/);
});
test('empty movable scope remains full hard-rule checked',()=>{
  const p=fixture();p.connections[0].locked=true;const r=optimizeScalable(p);assert.equal(r.feasible,true);assert.equal(r.changed,false);assert.equal(r.objectiveTicks,0);
});
test('rounding bound is explicit and checked ticks are integers',()=>{
  const p=fixture();p.ports[1].x=100.123456;
  const r=optimizeScalable(p,'pad','ball',{quantum:.01});assert.equal(r.objectiveTicks,10012);assert.equal(r.roundingErrorBoundUm,.005);
});
