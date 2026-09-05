import test from 'node:test';
import assert from 'node:assert/strict';
import { routingConfig, routeStage, checkRoutes } from '../src/core/routing.js';
import { fixture, seeded } from './helpers.mjs';
import { clone, normalizeProject } from '../src/core/model.js';
function routeFixture(){const p=fixture();p.ports[0].x=0;p.ports[0].y=300;p.ports[1].x=600;p.ports[1].y=300;return p;}
const config={x:0,y:0,pitch:100,columns:7,rows:7,layers:2,passes:1};
test('direct route has checked geometry, no mutation and Manhattan lower bound',()=>{
  const p=routeFixture(),before=JSON.stringify(p),r=routeStage(p,'pad','ball',config);assert.equal(r.status,'routed');assert.equal(r.check.metrics.wireLength,600);assert.equal(r.check.metrics.vias,0);assert.equal(r.check.valid,true);assert.equal(JSON.stringify(p),before);
});
test('thin obstacle between grid nodes is not tunneled through',()=>{
  const c={...config,layers:1,obstacles:[{id:'thin',x:240,y:200,width:5,height:200}]},r=routeStage(routeFixture(),'pad','ball',c);
  assert.equal(r.status,'routed');assert.ok(r.check.metrics.wireLength>600);assert.equal(r.check.errors,0);
});
test('multilayer routing bridges a complete one-layer obstruction with two vias',()=>{
  const c={...config,viaCost:10,obstacles:[{id:'wall',x:250,y:-100,width:100,height:800,layers:[0]}]},r=routeStage(routeFixture(),'pad','ball',c);
  assert.equal(r.status,'routed');assert.equal(r.check.metrics.vias,2);assert.equal(r.check.metrics.wireLength,600);
  const one=routeStage(routeFixture(),'pad','ball',{...c,layers:1});assert.equal(one.status,'partial');assert.ok(one.unrouted.length);assert.match(one.limitation,/not a proof/);
});
test('exact endpoints: off-grid ports rejected rather than silently moved',()=>{
  const p=routeFixture();p.ports[1].x=601;assert.throws(()=>routeStage(p,'pad','ball',config),/off-grid/);
});
test('routing budget is bounded and cannot return checked success for missing links',()=>{
  const r=routeStage(routeFixture(),'pad','ball',{...config,maxExpanded:1});assert.equal(r.status,'partial');assert.equal(r.expanded,1);assert.ok(r.check.missing.length);assert.equal(r.check.valid,false);
});
test('independent checker detects changed endpoints, diagonal jumps and obstacles',()=>{
  const p=routeFixture(),r=routeStage(p,'pad','ball',config),paths=clone(r.routes);paths[0].points[0].x=100;
  assert.ok(checkRoutes(p,'pad','ball',config,paths).issues.some(i=>i.code==='ROUTE_ENDPOINT'));
  paths[0].points[1].y=200;assert.ok(checkRoutes(p,'pad','ball',config,paths).issues.some(i=>i.code==='ROUTE_STEP'));
  const c={...config,obstacles:[{x:240,y:200,width:5,height:200}]};assert.ok(checkRoutes(p,'pad','ball',c,r.routes).issues.some(i=>i.code==='ROUTE_OBSTACLE'));
});
test('independent checker rejects crossing paths on one layer',()=>{
  const p=routeFixture();p.ports.push({...p.ports[0],id:'s2',x:300,y:0,net:'N2'},{...p.ports[1],id:'t2',x:300,y:600});p.connections.push({id:'e2',from:'s2',to:'t2',net:'',locked:false});
  const paths=[{connectionId:'e',points:Array.from({length:7},(_,i)=>({x:i*100,y:300,layer:0}))},{connectionId:'e2',points:Array.from({length:7},(_,i)=>({x:300,y:i*100,layer:0}))}];
  assert.ok(checkRoutes(p,'pad','ball',config,paths).issues.some(i=>i.code==='ROUTE_CLEARANCE'));
  const r=routeStage(p,'pad','ball',{...config,passes:2,viaCost:10});assert.equal(r.status,'routed');assert.ok(r.check.metrics.vias>=2);
});
test('two different nets cannot occupy a shared terminal or terminal halo',()=>{
  const p=routeFixture();p.ports.push({...p.ports[0],id:'s2',net:'N2'},{...p.ports[1],id:'t2',y:500});p.connections.push({id:'e2',from:'s2',to:'t2',net:'',locked:false});const r=routeStage(p,'pad','ball',config);assert.equal(r.status,'invalid-input');assert.ok(r.unrouted.some(r=>r.reason==='blocked-terminal'));
});
test('checker never passes on geometry-budget exhaustion',()=>{
  const r=routeStage(routeFixture(),'pad','ball',config);const c=checkRoutes(routeFixture(),'pad','ball',{...config,geometryBudget:1},r.routes);assert.equal(c.complete,false);assert.equal(c.valid,false);
});
test('routed length limits are checked, not just the ratsnest length',()=>{
  const p=routeFixture();p.rules.maxLength=600;const r=routeStage(p,'pad','ball',{...config,layers:1,obstacles:[{x:240,y:200,width:5,height:200}]});assert.equal(r.status,'partial');assert.ok(r.check.issues.some(i=>i.code==='ROUTE_MAX_LENGTH'));
});
test('invalid routing configurations fail closed',()=>{
  for(const c of [{pitch:0},{layers:0},{columns:1000,rows:1000,layers:8},{startLayer:-1},{traceWidth:-1},{maxExpanded:0},{clearance:Infinity},{obstacles:[{x:0,y:0,width:-2,height:3}]},{typo:true}])assert.throws(()=>routingConfig(c));
});
for(let seed=1;seed<=16;seed++)test(`router output passes separate DRC on seeded obstacle case ${seed}`,()=>{
  const r=seeded(seed),obstacles=Array.from({length:3},(_,i)=>({id:`o${i}`,x:140+Math.floor(r()*3)*100,y:40+Math.floor(r()*5)*100,width:20,height:20,layers:[i%2]}));
  const p=routeFixture(),out=routeStage(p,'pad','ball',{...config,obstacles});const independent=checkRoutes(p,'pad','ball',out.config,out.routes);assert.equal(out.check.valid,independent.valid);if(out.status==='routed')assert.equal(independent.errors,0);
});

test('geometrically valid routes cannot hide an invalid logical project',()=>{
  const p=routeFixture();p.ports[1].domain='WRONG';const r=routeStage(p,'pad','ball',config);
  assert.equal(r.check.valid,true);assert.equal(r.status,'invalid-input');assert.ok(r.inputCheck.errors>0);
});
