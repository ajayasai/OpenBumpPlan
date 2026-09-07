#!/usr/bin/env node
/** Actual route generation, separate from the earlier supplied-copper benchmark.
 * Synthetic fixtures are disclosed and retained; no proprietary solver comparison. */
import fs from 'node:fs';
import os from 'node:os';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { VERSION, stableStringify } from '../src/core/model.js';
import { routeStage, verifyRoutes } from '../src/core/routing.js';
import { routeStage as previousRoute } from '../tests/oracles/routing-v031.mjs';
import { routePhysical } from '../src/core/physical-routing.js';
import { createReviewBundle, verifyReviewBundle, projectSHA256 } from '../src/core/evidence.js';
import { copperArray } from '../tests/copper-fixtures.mjs';
const median=a=>[...a].sort((x,y)=>x-y)[Math.floor(a.length/2)];
const digest=v=>createHash('sha256').update(typeof v==='string'?v:stableStringify(v)).digest('hex');
const semantic=({elapsedMs,searchStats,negotiationSearchStats,...rest})=>rest;
const comparisons=[],capacity=[];
for(const [routes,cells] of [[64,64],[256,256],[512,512],[512,4096]]){
 const {project,witness}=copperArray(routes,cells),options={...witness.config,timeLimitMs:60000,maxExpansions:2000000};
 const oldRun=()=>previousRoute(project,'pad','ball',options),newRun=()=>routeStage(project,'pad','ball',options);
 const old=oldRun(),current=newRun();assert.equal(old.verified,true);assert.equal(current.verified,true);
 assert.deepEqual(semantic(current),semantic(old));
 const raw={previous:[],current:[]};
 for(let i=0;i<5;i++)for(const [key,fn] of (i%2?[['current',newRun],['previous',oldRun]]:[['previous',oldRun],['current',newRun]])){
  const start=performance.now(),r=fn(),ms=performance.now()-start;
  assert.deepEqual(semantic(r),semantic(old));raw[key].push(ms);
 }
 const count=options.columns*options.rows*options.layers;
 const record={routes,sites:project.ports.length,gridCells:count,inputSHA256:digest({project,options}),
  previous:{rawMilliseconds:raw.previous,medianMilliseconds:median(raw.previous),scratchAllocationBytesAcrossSearches:routes*count*13},
  current:{rawMilliseconds:raw.current,medianMilliseconds:median(raw.current),searchStats:current.searchStats},
  speedup:median(raw.previous)/median(raw.current),samePathsAndChecks:true,metrics:current.metrics};
 comparisons.push(record);console.log(JSON.stringify({mode:'comparison',routes,sites:record.sites,oldMs:record.previous.medianMilliseconds,newMs:record.current.medianMilliseconds,speedup:record.speedup}));
}
for(const routes of [1024,2048,4096]){
 const {project,witness,technology}=copperArray(routes),options={...witness.config,technology};
 let rejected=false;try{previousRoute(project,'pad','ball',witness.config);}catch(e){assert.match(e.message,/512 assignments/);rejected=true;}
 assert.equal(rejected,true);
 const run=()=>routePhysical(project,'pad','ball',options),warm=run();assert.equal(warm.verified,true);
 const samples=[];let result;
 for(let i=0;i<5;i++){const start=performance.now();result=run();samples.push(performance.now()-start);assert.equal(result.verified,true);assert.deepEqual(result.routes,warm.routes);}
 const replayStart=performance.now(),bundle=await createReviewBundle(project,{routing:result});
 const replay=await verifyReviewBundle(bundle,{expectedProjectSHA256:await projectSHA256(project),expectedTechnology:technology});
 assert.equal(replay.valid,true);assert.equal(replay.routingPass,true);assert.equal(replay.copperPass,true);
 const replayMs=performance.now()-replayStart;
 const record={routes,sites:project.ports.length,gridCells:result.config.columns*result.config.rows*result.config.layers,
  inputSHA256:digest({project,options}),previous:{supported:false,reason:'512-assignment limit; no equivalent-work timing'},
  current:{rawMilliseconds:samples,medianMilliseconds:median(samples),metrics:result.metrics,expansions:result.expansions,searchStats:result.searchStats,
   gridPass:verifyRoutes(project,result).ok,copperPass:result.copperVerification.ok,reviewReplayPass:replay.valid,reviewCreateAndReplayMilliseconds:replayMs},
  speedup:null};capacity.push(record);console.log(JSON.stringify({mode:'capacity',routes,ms:record.current.medianMilliseconds,replay:replay.valid}));
}
const report={type:'openbumpplan-route-generation-qualification',version:VERSION,
 environment:{node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model},
 sourceSHA256:Object.fromEntries(['src/core/routing.js','src/core/search-workspace.js','src/core/copper.js','tests/oracles/routing-v031.mjs','tests/copper-fixtures.mjs','scripts/qualify-routing.mjs'].map(p=>[p,createHash('sha256').update(fs.readFileSync(p)).digest('hex')])),
 protocol:{warmups:1,samples:5,comparisonOrder:'alternating; both implementations in one process',
  comparativeOperation:'routeStage including model checks, static obstacles, A* generation and independent grid verification; excludes fixture construction',
  capacityOperation:'routePhysical including negotiated-router entry, grid verification and continuous copper verification; bundle create/replay separately timed',
  fixtures:'Separated 8x8 cells with one 6-step local source-to-target route per active cell; additional reserved pads for the 8192-site comparison. No hand-supplied path enters generation.',
  allocationAccounting:'Previous scratch allocations are computed exactly as successful searches * grid cells * (8+4+1) bytes; new scratchBytes are actual typed-array lengths. Neither is peak process memory.',
  limits:'4096 assignments, 262144 grid cells, 1000000 witness nodes, 2000000 maximum search expansions. Dense congestion, long routes and industrial designs are not represented.',
  scope:'OpenBumpPlan v0.3.1 router vs new router, not commercial EDA or foundry/electrical/thermal signoff.'},comparisons,capacity};
const path=process.argv[2]||`docs/qualification-routing-v${VERSION}.json`;fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');console.log(`Saved ${path}`);
