import test from 'node:test';
import assert from 'node:assert/strict';
import { fixture, seeded } from './helpers.mjs';
import { normalizeProject, clone } from '../src/core/model.js';
import { routeStage, verifyRoutes, exportRoutesSVG } from '../src/core/routing.js';
function crossing(){const p=fixture();p.ports=[
 {id:'L',kind:'pad',x:0,y:30,net:'A',domain:'V',role:'signal'}, {id:'R',kind:'ball',x:60,y:30,role:'any'},
 {id:'B',kind:'pad',x:30,y:0,net:'B',domain:'V',role:'signal'}, {id:'T',kind:'ball',x:30,y:60,role:'any'}];
 p.connections=[{id:'horizontal',from:'L',to:'R'},{id:'vertical',from:'B',to:'T'}];return normalizeProject(p);}
const tiny={pitch:10,layers:1,originX:0,originY:0,columns:7,rows:7};
test('one straight route has exact Manhattan length and no vias',()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10});assert.equal(r.status,'routed');assert.deepEqual(r.metrics,{routed:1,wireLength:100,vias:0});assert.equal(verifyRoutes(p,r).ok,true);});
test('same-layer crossing at grid boundaries cannot be falsely declared routed',()=>{const p=crossing(),r=routeStage(p,'pad','ball',tiny);assert.equal(r.status,'partial');assert.equal(r.verified,false);assert.ok(r.failures.length>0);assert.ok(verifyRoutes(p,r).issues.some(i=>i.code==='MISSING_ROUTE'));});
test('two layers resolve orthogonal crossing with a checked via path',()=>{const p=crossing(),r=routeStage(p,'pad','ball',{...tiny,layers:2});assert.equal(r.status,'routed');assert.equal(r.metrics.routed,2);assert.ok(r.metrics.vias>=2);assert.equal(verifyRoutes(p,r).ok,true);});
test('routing does not change placement or mapping',()=>{const p=crossing(),before=clone(p);routeStage(p,'pad','ball',{...tiny,layers:2});assert.deepEqual(p,before);});
test('a narrow keepout between grid nodes is conservatively rasterized',()=>{const p=fixture();p.keepouts=[{id:'wall',x:44,y:-5,width:2,height:10,kinds:['ball'],dieId:''}];const r=routeStage(p,'pad','ball',{pitch:10,layers:1});assert.equal(r.status,'routed');assert.ok(r.metrics.wireLength>100);assert.equal(verifyRoutes(p,r).ok,true);});
test('a full barrier is not silently traversed',()=>{const p=fixture();p.keepouts=[{id:'wall',x:40,y:-50,width:20,height:100,kinds:['ball'],dieId:''}];const r=routeStage(p,'pad','ball',{pitch:10,layers:2,originX:0,originY:-30,columns:11,rows:7});assert.equal(r.status,'partial');assert.equal(r.failures[0].reason,'no-path-with-current-reservations');});
test('nonzero clearance produces a checked wider detour',()=>{const p=fixture();p.keepouts=[{id:'box',x:45,y:10,width:10,height:5,kinds:['ball'],dieId:''}];const a=routeStage(p,'pad','ball',{pitch:10,clearance:0}),b=routeStage(p,'pad','ball',{pitch:10,clearance:10});assert.equal(a.status,'routed');assert.equal(b.status,'routed');assert.ok(b.metrics.wireLength>a.metrics.wireLength);});
test('reserved, unconnected sites still block route geometry',()=>{const p=fixture();p.ports.push({...p.ports[1],id:'reserved',x:50,role:'reserved'});const r=routeStage(p,'pad','ball',{pitch:10,layers:1});assert.equal(r.status,'routed');assert.ok(r.metrics.wireLength>100);});
test('unassigned any-role candidate points do not masquerade as copper',()=>{const p=fixture();p.ports.push({...p.ports[1],id:'empty',x:50});const r=routeStage(p,'pad','ball',{pitch:10});assert.equal(r.metrics.wireLength,100);});
test('endpoint layers are obeyed',()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10,layers:3,startLayer:0,endLayer:2});assert.equal(r.verified,true);assert.equal(r.routes[0].path[0][2],0);assert.equal(r.routes[0].path.at(-1)[2],2);assert.equal(r.metrics.vias,2);});
test('zero via cost remains safe and terminating',()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10,layers:3,viaCost:0});assert.equal(r.verified,true);});
test('search budget cannot return a fabricated clearance pass',()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10,maxExpansions:1});assert.equal(r.status,'partial');assert.equal(r.verified,false);assert.equal(r.failures[0].reason,'search-budget');});
test('planning-invalid input is not routed into a green status',()=>{const p=fixture();p.ports[1].net='OTHER';const r=routeStage(p,'pad','ball',{pitch:10});assert.equal(r.status,'input-invalid');assert.equal(r.verified,false);});
test('off-grid positions are rejected, not snapped',()=>{const p=fixture();p.ports[0].x=1;assert.throws(()=>routeStage(p,'pad','ball',{pitch:10}),/OFF_GRID/);});
test('out-of-grid endpoints are rejected',()=>assert.throws(()=>routeStage(fixture(),'pad','ball',{pitch:10,originX:0,originY:0,columns:2,rows:2}),/OUT_OF_GRID/));
test('memory safety grid bound is checked before allocation',()=>assert.throws(()=>routeStage(fixture(),'pad','ball',{columns:1024,rows:1024}),/262,144/));
for(const opts of [{pitch:0},{pitch:NaN},{layers:0},{layers:1.5},{layers:9},{clearance:-1},{viaCost:-1},{startLayer:2,layers:2},{columns:0},{rows:0},{maxExpansions:0},{orderTrials:4},{timeLimitMs:0}])test(`invalid routing controls ${JSON.stringify(opts)}`,()=>assert.throws(()=>routeStage(fixture(),'pad','ball',opts)));
test('route verifier rejects stale geometry',()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10});p.ports[0].x=10;assert.equal(verifyRoutes(p,r).ok,false);});
test('route verifier rejects stale constraints even without coordinate edits',()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10});p.rules.maxLength=1;assert.equal(verifyRoutes(p,r).ok,false);});
test('revision bookkeeping alone does not invalidate physical routes',()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10});p.revision++;assert.equal(verifyRoutes(p,r).ok,true);});
const corruptions={
 'missing route':r=>{r.routes=[];},
 'duplicate route':r=>{r.routes.push(clone(r.routes[0]));},
 'unknown connection':r=>{r.routes[0].connectionId='invented';},
 'empty path':r=>{r.routes[0].path=[];},
 'wrong terminal':r=>{r.routes[0].path.shift();},
 'jump over occupied cells':r=>{r.routes[0].path.splice(1,2);},
 'negative cell':r=>{r.routes[0].path[1]=[-1,0,0];},
 'out of range layer':r=>{r.routes[0].path[1][2]=9;},
 'fractional cell':r=>{r.routes[0].path[1][0]+=.5;},
 'NaN cell':r=>{r.routes[0].path[1][0]=NaN;},
 'non-array path':r=>{r.routes[0].path='hello';},
 'non-array node':r=>{r.routes[0].path[1]=null;},
 'fabricated metric':r=>{r.metrics.wireLength=0;},
 'wrong schema':r=>{r.schemaVersion=2;},
 'loop':r=>{r.routes[0].path.splice(1,0,clone(r.routes[0].path[0]));},
};
for(const [name,mutate]of Object.entries(corruptions))test(`independent verifier rejects ${name}`,()=>{const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10});mutate(r);assert.equal(verifyRoutes(p,r).ok,false);});
test('search-independent verifier detects route-route collision',()=>{const p=crossing(),r=routeStage(p,'pad','ball',{...tiny,layers:2});r.routes=[{connectionId:'horizontal',path:Array.from({length:7},(_,x)=>[x,3,0])},{connectionId:'vertical',path:Array.from({length:7},(_,y)=>[3,y,0])}];r.metrics={routed:2,wireLength:120,vias:0};assert.ok(verifyRoutes(p,r).issues.some(i=>i.code==='ROUTE_CLEARANCE'));});
test('verifier checks routed length, not only endpoint Manhattan length',()=>{const p=fixture();p.rules.maxLength=100;p.keepouts=[{id:'box',x:40,y:-10,width:10,height:20,kinds:['ball'],dieId:''}];const r=routeStage(p,'pad','ball',{pitch:10});assert.equal(r.status,'constraint-failed');assert.ok(r.verification.issues.some(i=>i.code==='ROUTED_LENGTH_LIMIT'));});
test('SVG export escapes user-controlled project names and route labels',()=>{const p=fixture();p.name='<script>alert(1)</script>';const r=routeStage(p,'pad','ball',{pitch:10});const svg=exportRoutesSVG(p,r);assert.ok(svg.includes('&lt;script&gt;'));assert.ok(!svg.includes('<script>'));assert.ok(svg.includes('not signoff'));});
// Independent BFS oracle on bounded one-layer grids with reserved-site obstacles.
for(let seed=1;seed<=15;seed++)test(`A* agrees with independent BFS: seed ${seed}`,()=>{
 const rng=seeded(seed),p=fixture();p.ports[1].x=60;p.ports[1].y=60;const blocked=new Set();
 for(let y=0;y<7;y++)for(let x=0;x<7;x++)if(x+y>0&&x+y<12&&rng()<.18){blocked.add(`${x},${y}`);p.ports.push({...p.ports[1],id:`block:${x}:${y}`,x:x*10,y:y*10,role:'reserved'});}
 const queue=[[0,0,0]],seen=new Set(['0,0']);let expected=null;
 for(let k=0;k<queue.length;k++){const [x,y,d]=queue[k];if(x===6&&y===6){expected=d*10;break;}for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,key=`${a},${b}`;if(a<0||b<0||a>=7||b>=7||blocked.has(key)||seen.has(key))continue;seen.add(key);queue.push([a,b,d+1]);}}
 const r=routeStage(p,'pad','ball',tiny);if(expected===null)assert.equal(r.verified,false);else{assert.equal(r.verified,true);assert.equal(r.metrics.wireLength,expected);}
});
