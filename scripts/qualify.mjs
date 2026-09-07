#!/usr/bin/env node
/** Deterministic quality corpus. All seeds are included, not only winning examples.
 * Wall-clock values are local observations, not commercial speed comparisons. */
import fs from 'node:fs';
import os from 'node:os';
import { emptyProject, normalizeProject, VERSION } from '../src/core/model.js';
import { coupledDemoProject, routingDemoProject } from '../src/core/demo.js';
import { optimizeStage } from '../src/core/optimizer.js';
import { optimizeExact } from '../src/core/solver.js';
import { routeStage, verifyRoutes, exportRoutesSVG } from '../src/core/routing.js';
import { createReviewBundle, verifyReviewBundle, projectSHA256 } from '../src/core/evidence.js';
function sample(seed){
  let state=seed;const random=()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};
  const p=emptyProject(`Synthetic quality corpus / seed ${seed}`);
  p.description='Six-source, six-target synthetic matching corpus. Not industrial or commercial-vendor data.';
  p.rules={...p.rules,maxLength:1000000,groundRadius:0,powerRadius:0,minGroundRatio:0,clockGroundMin:0,maxCrossings:100,crossingWeight:500};
  for(let i=0;i<6;i++){
    p.ports.push({id:`s${i}`,kind:'pad',x:Math.floor(random()*30)*10+i,y:Math.floor(random()*30)*10,role:'signal',domain:'V',net:`N${i}`},
      {id:`t${i}`,kind:'ball',x:Math.floor(random()*30)*10+i,y:Math.floor(random()*30)*10,role:'any'});
    p.connections.push({id:`e${i}`,from:`s${i}`,to:`t${i}`});
  }
  return normalizeProject(p);
}
const cases=[];
for(let seed=1;seed<=40;seed++){
  const p=sample(seed),h=optimizeStage(p,'pad','ball',{maxTrials:1500}),e=optimizeExact(p,'pad','ball',{timeLimitMs:60000,maxNodes:1000000});
  if(e.status!=='optimal'||e.after.errors||e.objective>h.after.metrics.score)throw new Error(`Quality qualification failed for seed ${seed}.`);
  cases.push({seed,inputSHA256:await projectSHA256(p),heuristicObjective:h.after.metrics.score,exactObjective:e.objective,
    improvement:h.after.metrics.score-e.objective,nodes:e.stats.nodes,leaves:e.stats.leaves,searchComplete:e.searchComplete,elapsedMs:e.elapsedMs});
}
const bottleneck=coupledDemoProject(),h=optimizeStage(bottleneck,'pad','ball'),e=optimizeExact(bottleneck);
if(h.after.errors===0||e.status!=='optimal'||e.after.errors!==0)throw new Error('Coupled bottleneck qualification failed.');
const rp=routingDemoProject(),route=routeStage(rp,'pad','ball',{pitch:10,layers:2,viaCost:10,originX:0,originY:0,columns:7,rows:7});
if(!verifyRoutes(rp,route).ok||route.metrics.vias!==2)throw new Error('Layer-crossing qualification failed.');
const bundle=await createReviewBundle(rp,{routing:route});if(!(await verifyReviewBundle(bundle)).valid)throw new Error('Review-bundle qualification failed.');
fs.mkdirSync('docs',{recursive:true});fs.mkdirSync('examples',{recursive:true});
const json=(path,data)=>fs.writeFileSync(path,JSON.stringify(data,null,2)+'\n');
json('examples/pair-bottleneck.json',bottleneck);json('examples/pair-bottleneck-solved.json',e.project);json('examples/routing-laboratory.json',rp);
json('examples/verified-routes.json',route);json('examples/verified-review-bundle.json',bundle);fs.writeFileSync('examples/verified-routes.svg',exportRoutesSVG(rp,route));
const report={engineVersion:VERSION,environment:{node:process.version,platform:process.platform,architecture:process.arch,cpus:os.cpus().length},
  scope:'Synthetic deterministic stage-planning quality tests only. Not a commercial head-to-head, industrial scale, SI/PI/thermal, or signoff qualification.',
  corpus:{cases:cases.length,exactWins:cases.filter(c=>c.improvement>0).length,ties:cases.filter(c=>c.improvement===0).length,losses:cases.filter(c=>c.improvement<0).length,
    totalHeuristicObjective:cases.reduce((s,c)=>s+c.heuristicObjective,0),totalExactObjective:cases.reduce((s,c)=>s+c.exactObjective,0)},
  coupledBottleneck:{heuristicStatus:h.status,heuristicErrors:h.after.errors,exactStatus:e.status,exactErrors:e.after.errors,exactObjective:e.objective},
  routing:{verified:route.verified,metrics:route.metrics,verification:route.verification},evidence:{verified:true,manifestSHA256:bundle.manifestSHA256},cases};
json('docs/qualification-v0.2.0.json',report);console.log(JSON.stringify({...report,cases:undefined},null,2));
