import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fixture } from './helpers.mjs';
import { normalizeProject, clone } from '../src/core/model.js';
import { routingDemoProject } from '../src/core/demo.js';
import { routeStage, routeNegotiated, verifyRoutes, routingDesignKey } from '../src/core/routing.js';
import { verifyCopper, boxDistance } from '../src/core/copper.js';
import { routePhysical } from '../src/core/physical-routing.js';
const tech={units:'um',traceWidth:1,viaDiameter:2,padDiameter:2,clearance:1};
function parallel(){const p=fixture();p.ports.push({...p.ports[0],id:'s2',y:10,net:'DATA2'},{...p.ports[1],id:'t2',y:10});p.connections.push({id:'e2',from:'s2',to:'t2',locked:false,net:''});return p;}
test('continuous copper verifies traces, via landings, pads and endpoints',()=>{
 const p=routingDemoProject(),r=routePhysical(p,'pad','ball',{pitch:10,layers:2,technology:tech,viaCost:10});
 assert.equal(r.verified,true);assert.equal(r.status,'routed-physical');assert.equal(r.copperVerification.ok,true);assert.equal(r.metrics.vias,2);
});
test('grid can pass while actual copper widths violate spacing',()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});assert.equal(verifyRoutes(p,r).ok,true);
 const checked=verifyCopper(p,r,{...tech,traceWidth:12,clearance:1});assert.equal(checked.ok,false);assert.ok(checked.issues.some(i=>i.code==='COPPER_CLEARANCE'));
});
test('nearby but non-overlapping conductor widths pass at exact positive clearance',()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});
 assert.equal(verifyCopper(p,r,{...tech,traceWidth:6,clearance:4}).ok,true);
});
test('touching copper does not pass a zero-clearance declaration',()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});
 assert.equal(verifyCopper(p,r,{...tech,traceWidth:10,clearance:0}).ok,false);
});
test('oversize via detected even when thin traces and grid are valid',()=>{
 const p=routingDemoProject(),r=routeStage(p,'pad','ball',{pitch:10,layers:2,viaCost:10});assert.equal(r.verified,true);
 assert.equal(verifyCopper(p,r,{...tech,viaDiameter:80}).ok,false);
});
test('continuous keepout distance catches trace width beyond centerline',()=>{
 const p=fixture();p.keepouts=[{id:'k',dieId:'',kinds:['pad','ball'],x:40,y:7,width:20,height:3}];
 const r=routeStage(p,'pad','ball',{pitch:10,layers:1});assert.equal(r.verified,true);
 const c=verifyCopper(p,r,{...tech,traceWidth:16,clearance:1});assert.equal(c.ok,false);assert.ok(c.issues.some(i=>i.code==='COPPER_KEEPOUT'));
});
test('overlapping finite pads rejected though occupied coordinates differ',()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});
 const c=verifyCopper(p,r,{...tech,padDiameter:16});assert.equal(c.ok,false);assert.ok(c.issues.some(i=>i.code==='PAD_PAD_CLEARANCE'));
});
test('continuous comparison budget exhaustion cannot become all clear',()=>{
 const p=parallel(),r=routeStage(p,'pad','ball',{pitch:10,layers:1});const c=verifyCopper(p,r,{...tech,traceWidth:12,padDiameter:16},{maxComparisons:1});assert.equal(c.ok,false);assert.equal(c.complete,false);
});
for(const change of ['stale','coordinate','endpoint','missing','metric','loop','layer'])test(`copper witness adversarial mutation: ${change}`,()=>{
 const p=routingDemoProject(),r=routeStage(p,'pad','ball',{pitch:10,layers:2});
 if(change==='stale')r.designKey='fake';
 if(change==='coordinate')r.routes[0].path[1][0]=NaN;
 if(change==='endpoint')r.routes[0].path.shift();
 if(change==='missing')r.routes.pop();
 if(change==='metric')r.metrics.wireLength=0;
 if(change==='loop')r.routes[0].path.splice(1,0,clone(r.routes[0].path[0]));
 if(change==='layer')r.routes[0].path[0][2]=8;
 assert.equal(verifyCopper(p,r,tech).ok,false);
});
for(const technology of [null,{}, {...tech,traceWidth:0},{...tech,traceWidth:NaN},{...tech,units:'mm'},{...tech,viaDiameter:Infinity},{...tech,clearance:-1},{...tech,allowFailure:true}])test(`explicit technology required ${JSON.stringify(technology)}`,()=>{
 const p=fixture(),r=routeStage(p,'pad','ball',{pitch:10});assert.equal(verifyCopper(p,r,technology).ok,false);
});
test('physical router never weakens too-wide technology to get a green status',()=>{
 const p=routingDemoProject(),r=routePhysical(p,'pad','ball',{pitch:10,layers:2,maxExpansions:10000,technology:{...tech,padDiameter:50}});assert.equal(r.verified,false);
});
test('congestion negotiation recovers a complete witness missed by three greedy orders',()=>{
 const p=normalizeProject(JSON.parse(fs.readFileSync(new URL('../examples/congestion-laboratory.json',import.meta.url),'utf8'))),o={pitch:10,layers:1,originX:0,originY:0,columns:12,rows:12,orderTrials:3,maxExpansions:100000,timeLimitMs:5000,maxIterations:25};
 const a=routeStage(p,'pad','ball',o),b=routeNegotiated(p,'pad','ball',o);
 assert.equal(a.verified,false);assert.equal(a.metrics.routed,5);assert.equal(b.verified,true);assert.equal(b.metrics.routed,6);assert.ok(b.negotiationIterations>0);assert.equal(verifyRoutes(p,b).ok,true);
});
test('bounded negotiation failure remains explicitly uncertain',()=>{
 const p=routingDemoProject(),r=routeNegotiated(p,'pad','ball',{pitch:10,layers:1,maxExpansions:1,maxIterations:1});assert.equal(r.verified,false);assert.match(r.message,/NOT a proof/);
});
test('box distance matches analytic orthogonal geometry',()=>{
 const a={minX:0,maxX:10,minY:0,maxY:0},b={minX:5,maxX:5,minY:-10,maxY:10};assert.equal(boxDistance(a,b),0);
 assert.equal(boxDistance(a,{minX:13,maxX:15,minY:4,maxY:4}),5);
});
