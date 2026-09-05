import test from 'node:test';
import assert from 'node:assert/strict';
import { solveExactStage, hallWitness, stageProblem } from '../src/core/exact.js';
import { analyze } from '../src/core/rules.js';
import { clone, normalizeProject } from '../src/core/model.js';
import { fixture, pairFixture, seeded, synthetic } from './helpers.mjs';

function brute(p) {
  // Independent permutation oracle: NO solver compatibility predicates or bounds.
  const s=p.ports.filter(n=>n.kind==='pad'),t=p.ports.filter(n=>n.kind==='ball');let optimum=Infinity,leaves=0;
  function visit(a,used) {if(a.length===s.length){const q=clone(p);q.connections=s.map((n,i)=>({id:`e${i}`,from:n.id,to:t[a[i]].id,net:'',locked:false}));const v=analyze(q);leaves++;if(v.complete&&!v.errors)optimum=Math.min(optimum,v.metrics.score);return;}
    for(let j=0;j<t.length;j++)if(!used.has(j)){used.add(j);visit([...a,j],used);used.delete(j);}}
  visit([],new Set());return {optimum,leaves};
}
test('Hall witness explicitly identifies scarce compatible targets',()=>{
  const c=[[0,Infinity,Infinity],[1,Infinity,Infinity],[Infinity,2,3]],w=hallWitness(c);
  assert.deepEqual(w,{sourceIndices:[0,1],targetIndices:[0],deficit:1});
  assert.equal(hallWitness([[0,1],[1,0]]),null);assert.equal(hallWitness([]),null);
});
test('zero-target Hall witness and rectangular cases',()=>{
  assert.equal(hallWitness([[],[]]).deficit,2);assert.equal(hallWitness([[0,1,2],[0,Infinity,Infinity]]),null);
  assert.throws(()=>hallWitness([[NaN]]));
});
test('exact result checks full rules and preserves caller input',()=>{
  const p=pairFixture(),original=JSON.stringify(p),r=solveExactStage(p);
  assert.equal(r.status,'optimal');assert.equal(r.upperBound,200);assert.equal(r.lowerBound,200);assert.equal(r.absoluteGap,0);assert.equal(r.analysis.errors,0);assert.equal(JSON.stringify(p),original);
});
test('strict target identity produces an actionable Hall set',()=>{
  const p=pairFixture();p.ports.find(n=>n.id==='t2').role='reserved';const r=solveExactStage(p);
  assert.equal(r.status,'infeasible');assert.ok(r.witness.deficit>0);assert.equal(r.project,null);
});
test('coupled differential adjacency can reject every linearly feasible solution',()=>{
  const p=pairFixture();p.ports.find(n=>n.id==='t2').y=500;p.rules.pairMaxDistance=150;const r=solveExactStage(p);
  assert.equal(r.status,'infeasible');assert.ok(r.rejectedByRule.PAIR_ADJACENCY>0);assert.equal(r.witness,undefined);
});
test('node budget cannot fabricate infeasibility',()=>{
  const p=pairFixture();p.ports.find(n=>n.id==='t2').y=500;p.rules.pairMaxDistance=150;
  const r=solveExactStage(p,'pad','ball',{nodeLimit:1});assert.equal(r.status,'unknown');assert.equal(r.project,null);assert.equal(r.upperBound,null);assert.ok(Number.isFinite(r.lowerBound));
});
test('locked mapping, locks on either endpoint and locked target exclusion',()=>{
  for(const mode of ['edge','source','target']) {
    const p=pairFixture();if(mode==='edge')p.connections[0].locked=true;else p.ports.find(n=>n.id===(mode==='source'?'s':'t')).locked=true;
    const r=solveExactStage(p);assert.equal(r.status,'optimal');assert.deepEqual(r.project.connections.find(e=>e.id==='e'),p.connections[0]);assert.deepEqual(r.scope.sourceIds,['s2']);
  }
});
test('all locked is an explicit no-op, never an optimality certificate',()=>{
  const p=fixture();p.connections[0].locked=true;assert.equal(solveExactStage(p).status,'no-op');
});
test('malformed topology and oversized oracle scope fail before search',()=>{
  const p=fixture();p.connections.push({...p.connections[0],id:'duplicate'});assert.throws(()=>solveExactStage(p),/drivers\/fanout/);
  assert.throws(()=>solveExactStage(synthetic(17)),/safety limit/);assert.throws(()=>solveExactStage(fixture(),'ball','pad'),/forward stage/);
  for(const nodeLimit of [0,-1,Infinity,NaN,2.5,200001])assert.throws(()=>solveExactStage(fixture(),'pad','ball',{nodeLimit}));
});
test('hard failures in untouched stages are not ignored',()=>{
  const p=fixture();p.ports.push({...p.ports[0],id:'outside',kind:'pcb',required:true});const r=solveExactStage(p);assert.equal(r.status,'infeasible');assert.ok(r.rejectedByRule.UNASSIGNED);
});
for(let seed=1;seed<=36;seed++)test(`exact matches independent complete enumeration, seeded case ${seed}`,()=>{
  const rng=seeded(seed),n=2+seed%4,p=fixture();p.ports=[];p.connections=[];p.rules.crossingWeight=73;p.rules.maxLength=400;p.rules.maxCrossings=0;
  for(let i=0;i<n;i++){p.ports.push({id:`s${i}`,kind:'pad',x:0,y:Math.floor(rng()*10)*50,net:`N${i}`,role:'signal',domain:'V1',required:true},{id:`t${i}`,kind:'ball',x:200,y:Math.floor(rng()*10)*50,role:'any'});p.connections.push({id:`e${i}`,from:`s${i}`,to:`t${i}`});}
  if(seed%3===0){p.ports[0].pair='P';p.ports[0].polarity='+';p.ports[2].pair='P';p.ports[2].polarity='-';p.rules.pairMaxDistance=150;p.rules.pairMaxSkew=50;}
  const q=normalizeProject(p),b=brute(q),r=solveExactStage(q);
  assert.equal(r.status,Number.isFinite(b.optimum)?'optimal':'infeasible');assert.equal(r.upperBound,Number.isFinite(b.optimum)?b.optimum:null);if(r.project)assert.equal(analyze(r.project).errors,0);
  const limited=solveExactStage(q,'pad','ball',{nodeLimit:2});
  if(Number.isFinite(b.optimum)){assert.ok(limited.lowerBound<=b.optimum+1e-7);if(limited.upperBound!==null)assert.ok(limited.upperBound>=b.optimum-1e-7);}
  if(limited.status==='infeasible')assert.equal(b.optimum,Infinity);
});

test('ECO budget bounds changed assignments and avoids unnecessary remapping',()=>{
  const p=pairFixture();[p.connections[0].to,p.connections[1].to]=[p.connections[1].to,p.connections[0].to];p.rules.pairMaxSkew=1000;
  const strict=solveExactStage(p,'pad','ball',{maxChanges:0}),open=solveExactStage(p,'pad','ball',{maxChanges:2});
  assert.equal(strict.status,'optimal');assert.equal(strict.changedAssignments,0);assert.equal(open.changedAssignments,2);assert.ok(open.upperBound<strict.upperBound);
  const penalty=solveExactStage(p,'pad','ball',{changePenalty:10000});assert.equal(penalty.changedAssignments,0);assert.equal(penalty.upperBound,strict.upperBound);
});
test('ECO budget cannot turn a cut-off search into infeasibility',()=>{
  const p=pairFixture();p.rules.pairMaxDistance=10;const r=solveExactStage(p,'pad','ball',{maxChanges:0,nodeLimit:1});assert.equal(r.status,'unknown');
  assert.throws(()=>solveExactStage(fixture(),'pad','ball',{maxChanges:-1}));assert.throws(()=>solveExactStage(fixture(),'pad','ball',{changePenalty:NaN}));
});
