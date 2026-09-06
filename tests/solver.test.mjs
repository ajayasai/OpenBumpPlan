import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, pairFixture, seeded } from './helpers.mjs';
import { normalizeProject, clone } from '../src/core/model.js';
import { analyze } from '../src/core/rules.js';
import { assignmentProblem, hallConflict, optimizeExact } from '../src/core/solver.js';

function small(seed,n=4){const p=fixture(),rng=seeded(seed);p.ports=[];p.connections=[];p.rules.crossingWeight=130;p.rules.maxCrossings=0;
  for(let i=0;i<n;i++){p.ports.push({id:`s${i}`,kind:'pad',x:i*100,y:Math.floor(rng()*10)*100,role:'signal',net:`N${i}`,domain:'V'},
    {id:`t${i}`,kind:'ball',x:i*100+10,y:1000+Math.floor(rng()*10)*100,role:'any'});p.connections.push({id:`e${i}`,from:`s${i}`,to:`t${i}`});}
  return normalizeProject(p);
}
function brute(p,opts={}){const pb=assignmentProblem(p,'pad','ball',opts),used=new Set(),a=[];let best=Infinity,count=0;
 function step(i){if(i===pb.sources.length){const candidate=pb.materialize(a),r=analyze(candidate);let changes=a.filter((j,i)=>pb.original.get(pb.sources[i].id)[0]?.to!==pb.targets[j].id).length;
   if(r.complete&&!r.errors&&changes<=(opts.maxChanges??Infinity)){best=Math.min(best,r.metrics.score+changes*pb.penalty);count++;}return;}
   for(let j=0;j<pb.targets.length;j++)if(!used.has(j)&&Number.isFinite(pb.cost[i][j])){a[i]=j;used.add(j);step(i+1);used.delete(j);}}
 step(0);return {best,count};}

for(let seed=1;seed<=30;seed++)test(`exact objective matches independent permutation enumeration: seed ${seed}`,()=>{
 const p=small(seed),expected=brute(p),actual=optimizeExact(p,'pad','ball',{timeLimitMs:60000});assert.equal(actual.status,'optimal');assert.equal(actual.objective,expected.best);assert.equal(actual.gap,0);assert.equal(actual.after.errors,0);assert.equal(actual.searchComplete,true);
});
test('input is never mutated',()=>{const p=small(3),copy=clone(p);optimizeExact(p);assert.deepEqual(p,copy);});
test('differential pair coupling is included in exact objective',()=>{const p=pairFixture();p.ports[2].x=20;p.rules.pairMaxSkew=10;const actual=optimizeExact(p),expected=brute(p);assert.equal(actual.status,Number.isFinite(expected.best)?'optimal':'infeasible');assert.equal(actual.objective,Number.isFinite(expected.best)?expected.best:null);});
for(const penalty of [0,100,1000])for(const maxChanges of [0,1,2,4])test(`ECO objective and change budget ${penalty}/${maxChanges}`,()=>{
 const p=small(4),expected=brute(p,{changePenalty:penalty,maxChanges}),r=optimizeExact(p,'pad','ball',{changePenalty:penalty,maxChanges});assert.equal(r.objective,expected.best);assert.ok(r.changes<=maxChanges);
});
test('Hall witness exhibits fewer candidate targets than sources',()=>{const cost=[[1,Infinity],[2,Infinity]],h=hallConflict(cost);assert.deepEqual(h,{sources:[0,1],targets:[0],deficiency:1});});
test('Hall witness covers a nontrivial alternating tree',()=>{const cost=[[1,1,Infinity],[1,1,Infinity],[1,1,Infinity],[Infinity,Infinity,1]],h=hallConflict(cost);assert.equal(h.deficiency,1);assert.ok(h.sources.length>h.targets.length);assert.deepEqual(new Set(h.sources.flatMap(i=>cost[i].map((v,j)=>Number.isFinite(v)?j:null).filter(j=>j!==null))),new Set(h.targets));});
test('full matching has no Hall conflict',()=>assert.equal(hallConflict([[1,Infinity],[1,2]]),null));
test('no targets gives Hall deficiency',()=>assert.deepEqual(hallConflict([[],[]]),{sources:[0,1],targets:[],deficiency:2}));
test('exact engine attaches named Hall explanation',()=>{const p=small(2,2);p.ports.find(n=>n.id==='t1').domain='OTHER';const r=optimizeExact(p);assert.equal(r.status,'infeasible');assert.equal(r.searchComplete,true);assert.equal(r.conflict.deficiency,1);assert.equal(r.changed,false);});
test('timeout is never called infeasible',()=>{const p=small(2);p.connections=[];const r=optimizeExact(p,'pad','ball',{maxNodes:1});assert.equal(r.status,'unknown');assert.equal(r.searchComplete,false);assert.equal(r.feasible,false);});
test('bounded search retains feasible incumbent and valid lower bound',()=>{const p=small(5);const r=optimizeExact(p,'pad','ball',{maxNodes:1}),b=brute(p);assert.equal(r.status,'feasible');assert.equal(r.searchComplete,false);assert.ok(r.lowerBound<=b.best);assert.ok(r.objective>=b.best);});
test('a locked mapping cannot be moved',()=>{const p=small(4);p.connections[0].locked=true;const r=optimizeExact(p);assert.deepEqual(r.project.connections.find(e=>e.id==='e0'),p.connections[0]);});
test('a locked target prevents reassignment of its current source',()=>{const p=small(6);p.ports.find(n=>n.id==='t0').locked=true;const r=optimizeExact(p);assert.equal(r.project.connections.find(e=>e.id==='e0').to,'t0');});
test('selected sourceIds scope freezes every other mapping',()=>{const p=small(8);const r=optimizeExact(p,'pad','ball',{sourceIds:['s0','s1']});assert.deepEqual(r.scope.sourceIds,['s0','s1']);for(const id of ['e2','e3'])assert.deepEqual(r.project.connections.find(e=>e.id===id),p.connections.find(e=>e.id===id));});
test('target-inferred electrical role is not incorrectly ruled out',()=>{const p=fixture();p.ports[0].role='any';p.ports[1].role='ground';const r=optimizeExact(p);assert.equal(r.status,'optimal');});
test('downstream locked logical signal is preserved',()=>{const p=small(10,2);p.ports.push({id:'PCB',kind:'pcb',x:10,y:3000,role:'any',locked:true});p.connections.push({id:'downstream',from:'t0',to:'PCB'});const normalized=normalizeProject(p),r=optimizeExact(normalized);assert.equal(r.project.connections.find(e=>e.id==='e0').to,'t0');});
test('fully enumerated pair-infeasible design is not mistaken for a Hall conflict',()=>{const p=pairFixture();p.ports.find(n=>n.id==='t2').y=500;p.rules.pairMaxDistance=150;const r=optimizeExact(p);assert.equal(r.status,'infeasible');assert.equal(r.searchComplete,true);assert.equal(r.conflict,undefined);assert.ok(r.stats.ruleRejected>0);});
test('incomplete initial checks fail closed',()=>{const p=small(20,12);p.rules.geometryBudget=100;p.rules.minDomainSpacing=100000;const r=optimizeExact(p);assert.equal(r.status,'unchecked');assert.equal(r.feasible,false);});
for(const options of [{maxNodes:0},{maxNodes:NaN},{timeLimitMs:0},{timeLimitMs:Infinity},{maxChanges:-1},{changePenalty:-1},{changePenalty:NaN},{sourceIds:['no-such-id']},{sourceIds:['s','s']}])test(`invalid solver options rejected ${JSON.stringify(options)}`,()=>assert.throws(()=>optimizeExact(fixture(),'pad','ball',options)));
test('oversized search rejects before materializing quadratic candidate costs',()=>assert.throws(()=>optimizeExact(small(1,13)),/12 movable/));
test('forbidden stages rejected',()=>assert.throws(()=>optimizeExact(fixture(),'ball','pad'),/allowed forward/));

test('coupled search solves a constructive pair-first greedy bottleneck',async()=>{
 const {coupledDemoProject}=await import('../src/core/demo.js');const {optimizeStage}=await import('../src/core/optimizer.js');
 const p=coupledDemoProject(),h=optimizeStage(p,'pad','ball'),e=optimizeExact(p);
 assert.equal(h.changed,false);assert.ok(h.after.errors>0);assert.equal(e.status,'optimal');assert.equal(e.after.errors,0);assert.equal(e.objective,300);
 assert.equal(e.project.connections.find(c=>c.from==='RESTRICTED').to,'BALL_1');
});
