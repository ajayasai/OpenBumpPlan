/** Frozen synthetic regression challenges, NOT a representative industrial suite. */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { VERSION, clone } from '../src/core/model.js';
import { analyze } from '../src/core/rules.js';
import { optimizeStage } from '../src/core/optimizer.js';
import { solveExactStage } from '../src/core/exact.js';
import { routeStage } from '../src/core/routing.js';
import { createEvidence,verifyEvidence } from '../src/core/evidence.js';
import { engineeringDemo,demoRoutingConfig,routeSVG } from '../src/lab.js';
const save=(name,x)=>fs.writeFileSync(name,typeof x==='string'?x:JSON.stringify(x,null,2)+'\n');
const p=engineeringDemo('exact');save('examples/exact-challenge.json',p);
let start=performance.now();const heuristic=optimizeStage(p,'pad','ball'),heuristicMs=performance.now()-start;
start=performance.now();const exact=solveExactStage(p,'pad','ball'),exactMs=performance.now()-start;
// Independent complete permutation reference: no exact solver bounds or filters.
let enumerated=0,best=Infinity;const sources=p.ports.filter(n=>n.kind==='pad'),targets=p.ports.filter(n=>n.kind==='ball');
function enumerate(a,used) {
  if(a.length===sources.length){const q=clone(p);q.connections=sources.map((s,i)=>({id:`e${i}`,from:s.id,to:targets[a[i]].id,net:'',locked:false}));const r=analyze(q);enumerated++;if(r.complete&&!r.errors)best=Math.min(best,r.metrics.score);return;}
  for(let j=0;j<targets.length;j++)if(!used.has(j)){used.add(j);enumerate([...a,j],used);used.delete(j);}
}
enumerate([],new Set());assert.equal(best,2850);assert.equal(exact.upperBound,best);assert.equal(exact.status,'optimal');assert.equal(heuristic.after.errors,0);assert.equal(heuristic.after.metrics.score,4450);
const evidence=await createEvidence(p,'exact',exact);assert.equal((await verifyEvidence(p,evidence)).valid,true);save('examples/exact-evidence.json',evidence);
const eco=[0,2,4,6].map(maxChanges=>{const r=solveExactStage(heuristic.project,'pad','ball',{maxChanges});return {maxChanges,status:r.status,changed:r.changedAssignments,score:r.upperBound};});
const rp=engineeringDemo('routing'),rc=demoRoutingConfig();save('examples/routing-challenge.json',rp);save('examples/routing-config.json',rc);
const one=routeStage(rp,'pad','ball',{...rc,layers:1}),two=routeStage(rp,'pad','ball',rc);
assert.equal(one.status,'partial');assert.equal(one.routes.length,0);assert.equal(two.status,'routed');assert.equal(two.routes.length,2);assert.equal(two.check.errors,0);assert.equal(two.check.metrics.vias,4);
const re=await createEvidence(rp,'routing',two);assert.equal((await verifyEvidence(rp,re)).valid,true);save('examples/routing-evidence.json',re);save('docs/routing-challenge.svg',routeSVG(two));
const report={version:VERSION,node:process.version,platform:`${os.platform()} ${os.arch()}`,cpu:os.cpus()[0]?.model,
  disclosure:'Synthetic regression fixtures. The exact challenge was selected after a seeded search (first improvement at seed 23). This is not average-case evidence, a speed superiority claim, or a commercial benchmark.',
  exact:{sources:6,targets:6,heuristicScore:heuristic.after.metrics.score,heuristicErrors:heuristic.after.errors,exactScore:exact.upperBound,exactErrors:exact.analysis.errors,lowerBound:exact.lowerBound,relativeImprovement:(4450-2850)/4450,nodes:exact.nodes,exhaustivePermutations:enumerated,independentOptimum:best,heuristicMs,exactMs},eco,
  routing:{oneLayer:{routed:one.routes.length,required:2,status:one.status},twoLayers:{...two.check.metrics,errors:two.check.errors,status:two.status}},
  evidence:{exactReplay:true,routingReplay:true,exactEnvelopeSHA256:evidence.envelopeSHA256,routingEnvelopeSHA256:re.envelopeSHA256}};
save('docs/engineering-benchmark.json',report);console.log(JSON.stringify(report,null,2));
