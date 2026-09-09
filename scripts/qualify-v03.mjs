#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { synthetic, fixture, seeded } from '../tests/helpers.mjs';
import { normalizeProject, stableStringify } from '../src/core/model.js';
import { optimizeCoupledScalable } from '../src/core/coupled-search.js';
import { verifyCoupledProof } from '../src/core/coupled-proof.js';
import { routeStage, routeNegotiated } from '../src/core/routing.js';
const sha=p=>createHash('sha256').update(stableStringify(p)).digest('hex');
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
const scale=[];
for(const n of [64,256,1024,4096]){
 const p=synthetic(n);p.rules.maxLength=1400;const runs=[];let r;
 for(let trial=0;trial<3;trial++){const started=performance.now();r=optimizeCoupledScalable(p,'pad','ball',{timeLimitMs:60000});const ms=performance.now()-started;
  if(r.status!=='certified-coupled-optimal'||!r.verification.ok||r.after.errors)throw new Error(`Scale gate failed at ${n}`);runs.push(ms);
 }
 const checkStarted=performance.now(),rechecked=verifyCoupledProof(p,r.proof),checkMs=performance.now()-checkStarted;if(!rechecked.ok)throw new Error('Independent replay failed.');
 scale.push({sources:n,sites:p.ports.length,candidateEdges:r.edgeCount,inputSHA256:sha(p),runsMs:runs.map(t=>+t.toFixed(3)),medianMs:+median(runs).toFixed(3),standaloneProofCheckMs:+checkMs.toFixed(3),status:r.status,subproblems:r.stats.subproblems,objectiveUm:r.objectiveUm});
 console.log(`scale ${n}: ${median(runs).toFixed(1)}ms; ${r.edgeCount} candidate edges`);
}
function congestion(seed){const rand=seeded(seed),p=fixture();p.name=`Synthetic congestion case seed ${seed}`;p.ports=[];p.connections=[];const used=new Set();
 for(let i=0;i<6;i++){
  for(const kind of ['pad','ball']){let x,y,k;do{x=1+Math.floor(rand()*10);y=1+Math.floor(rand()*10);k=x+','+y;}while(used.has(k));used.add(k);p.ports.push({id:`${kind}${i}`,kind,x:x*10,y:y*10,net:kind==='pad'?`N${i}`:'',domain:kind==='pad'?'V':'',role:kind==='pad'?'signal':'any',required:kind==='pad'});}
  p.connections.push({id:`e${i}`,from:`pad${i}`,to:`ball${i}`});
 }return normalizeProject(p);
}
const cases=[],options={pitch:10,layers:1,originX:0,originY:0,columns:12,rows:12,orderTrials:3,timeLimitMs:1000,maxExpansions:100000,maxIterations:25};
for(let seed=1;seed<=100;seed++){
 const p=congestion(seed),a=routeStage(p,'pad','ball',options),b=routeNegotiated(p,'pad','ball',options);
 cases.push({seed,inputSHA256:sha(p),previous:{verified:a.verified,routed:a.metrics.routed,wireLength:a.metrics.wireLength,elapsedMs:+a.elapsedMs.toFixed(3)},current:{verified:b.verified,routed:b.metrics.routed,wireLength:b.metrics.wireLength,elapsedMs:+b.elapsedMs.toFixed(3),iterations:b.negotiationIterations}});
}
const routing={instances:100,previousComplete:cases.filter(c=>c.previous.verified).length,currentComplete:cases.filter(c=>c.current.verified).length,
 recovered:cases.filter(c=>!c.previous.verified&&c.current.verified).length,regressed:cases.filter(c=>c.previous.verified&&!c.current.verified).length,
 previousMedianMs:median(cases.map(c=>c.previous.elapsedMs)),currentMedianMs:median(cases.map(c=>c.current.elapsedMs)),options,cases};
const report={version:'0.3.0',environment:{node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model},
 scope:'Synthetic engine qualification only. No commercial tools were run. These are not industrial capacity, interactive UI latency, electrical signoff or comparative vendor results.',
 protocol:{scale:'Three measured runs, connected local-neighbour candidate grids, all configured hard rules rechecked; integer L1/ECO objective. Favorable near-aligned placements, not arbitrary hard coupled constraints.',routing:'Fixed seeds 1 through 100, six nets on a 12x12 single-layer grid. Identical total expansion/time ceilings, but negotiated search uses more effort and may be slower. Seed 10 was separately selected as a regression example, not a representative performance claim.'},scale,routing};
fs.writeFileSync('docs/qualification-v0.3.0.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({...routing,cases:undefined},null,2));
