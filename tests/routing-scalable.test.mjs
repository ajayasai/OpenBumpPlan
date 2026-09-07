import test from 'node:test';
import assert from 'node:assert/strict';
import { SearchWorkspace } from '../src/core/search-workspace.js';
import { routeStage, verifyRoutes, routingDesignKey, MAX_ROUTING_ASSIGNMENTS } from '../src/core/routing.js';
import { routeStage as previousRoute } from './oracles/routing-v031.mjs';
import { routePhysical } from '../src/core/physical-routing.js';
import { createReviewBundle, verifyReviewBundle, projectSHA256 } from '../src/core/evidence.js';
import { normalizeProject, clone } from '../src/core/model.js';
import { fixture, seeded } from './helpers.mjs';
import { copperArray } from './copper-fixtures.mjs';

function semantic({elapsedMs,searchStats,negotiationSearchStats,...rest}) { return rest; }
for(const count of [0,-1,1.5,NaN,Infinity,262145]) test(`workspace rejects invalid cell count ${count}`,()=>assert.throws(()=>new SearchWorkspace(count)));
test('workspace logically clears distance, predecessor and closed state between searches',()=>{
 const w=new SearchWorkspace(8);const first=w.begin();w.touch(2,0,-1);w.closed[2]=first;
 const second=w.begin();assert.notEqual(first,second);assert.notEqual(w.seen[2],second);assert.notEqual(w.closed[2],second);
 w.touch(2,42,1);assert.equal(w.distance[2],42);assert.equal(w.previous[2],1);assert.equal(w.stats().initializedNodes,2);
 assert.equal(w.stats().scratchBytes,160);assert.equal(w.stats().fullResets,0);
});
test('epoch wrap clears both generation arrays rather than resurrecting old state',()=>{
 const w=new SearchWorkspace(4);w.begin();w.touch(1,3,0);w.closed[1]=1;w.epoch=0xffffffff;
 assert.equal(w.begin(),1);assert.equal(w.seen[1],0);assert.equal(w.closed[1],0);assert.equal(w.stats().fullResets,1);
 w.touch(1,7,-1);assert.equal(w.distance[1],7);assert.equal(w.previous[1],-1);
});
for(let seed=1;seed<=80;seed++)test(`reused A* equals frozen v0.3.1 paths and diagnostics, seed ${seed}`,()=>{
 const random=seeded(seed),p=fixture();p.ports=[];p.connections=[];
 for(let i=0;i<8;i++){
  const y=i*40;p.ports.push({id:`s${i}`,kind:'pad',x:0,y,net:`N${i}`,domain:'V1',role:'signal'},
   {id:`t${i}`,kind:'ball',x:80,y,role:'any'});p.connections.push({id:`e${i}`,from:`s${i}`,to:`t${i}`});
  if(random()<.7)p.ports.push({id:`b${i}`,kind:'ball',x:20+Math.floor(random()*5)*10,y,role:'reserved'});
 }
 const project=normalizeProject(p),options={pitch:10,layers:1+seed%3,clearance:seed%4?0:2,viaCost:seed%5?10:0,maxExpansions:100000,timeLimitMs:60000};
 assert.deepEqual(semantic(routeStage(project,'pad','ball',options)),semantic(previousRoute(project,'pad','ball',options)));
});
test('4096 generated physical routes pass independent grid, copper and content-bound review replay',async()=>{
 const {project,witness,technology}=copperArray(MAX_ROUTING_ASSIGNMENTS),unchanged=clone(project);
 const routing=routePhysical(project,'pad','ball',{...witness.config,technology});
 assert.equal(routing.verified,true);assert.equal(routing.status,'routed-physical');
 assert.deepEqual(routing.metrics,{routed:4096,wireLength:24576,vias:0});assert.equal(verifyRoutes(project,routing).ok,true);
 assert.equal(routing.copperVerification.ok,true);assert.equal(routing.searchStats.workspaces,1);
 assert.equal(routing.searchStats.searches,4096);assert.equal(routing.searchStats.fullResets,0);
 assert.equal(routing.searchStats.scratchBytes,5242880);assert.ok(routing.searchStats.initializedNodes<262144);
 const bundle=await createReviewBundle(project,{routing});
 const verified=await verifyReviewBundle(bundle,{expectedProjectSHA256:await projectSHA256(unchanged),expectedTechnology:technology});
 assert.equal(verified.valid,true);assert.equal(verified.routingPass,true);assert.equal(verified.copperPass,true);
 assert.deepEqual(project,unchanged);
 routing.routes.pop();assert.equal(verifyRoutes(project,routing).ok,false);
 await assert.rejects(()=>createReviewBundle(project,{routing}),/partial or invalid/);
});
test('raising the route limit does not raise grid, expansion or verification trust limits',()=>{
 const {project,witness}=copperArray(1024);
 const r=routeStage(project,'pad','ball',{...witness.config,maxExpansions:1});
 assert.equal(r.verified,false);assert.equal(r.expansions,1);assert.ok(r.failures.length);
 assert.equal(r.searchStats.searches,1); // No full-grid buffers per unattempted net.
 assert.throws(()=>routeStage(project,'pad','ball',{...witness.config,layers:8}),/262,144/);
 assert.throws(()=>routeStage(project,'pad','ball',{...witness.config,maxExpansions:2000001}),/maxExpansions/);
});
test('4097 assignments are rejected before grid allocation; verifier cannot authorize them',()=>{
 const {project,witness}=copperArray(4096);project.ports.push({...project.ports[0],id:'extra-s',x:520},{...project.ports[1],id:'extra-t',x:523});
 project.connections.push({...project.connections[0],id:'extra-e',from:'extra-s',to:'extra-t'});
 assert.throws(()=>routeStage(project,'pad','ball',witness.config),/4096 assignments/);
 witness.designKey=routingDesignKey(project);assert.equal(verifyRoutes(project,witness).ok,false);
});
