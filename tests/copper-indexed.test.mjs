import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyCopper } from '../src/core/copper.js';
import { verifyCopper as reference } from './oracles/copper-v030.mjs';
import { routeStage, verifyRoutes, routingDesignKey } from '../src/core/routing.js';
import { normalizeProject, clone } from '../src/core/model.js';
import { routingDemoProject } from '../src/core/demo.js';
import { fixture, seeded } from './helpers.mjs';
import { copperArray } from './copper-fixtures.mjs';
import { createReviewBundle, verifyReviewBundle } from '../src/core/evidence.js';

function semantic(result){const {comparisons,spatialVisits,algorithm,...rest}=result;return rest;}

for(let seed=1;seed<=100;seed++)test(`indexed copper equals the frozen all-pairs verifier, seed ${seed}`,()=>{
 const rand=seeded(seed),p=fixture();p.name=`Differential geometry seed ${seed}`;
 p.ports=[];p.connections=[];
 for(let i=0;i<6;i++){
  const y=i*20;p.ports.push({id:`s${i}`,kind:'pad',x:0,y,net:`N${i}`,domain:'V1',role:'signal',required:true},{id:`t${i}`,kind:'ball',x:100,y,role:'any'});
  p.connections.push({id:`e${i}`,from:`s${i}`,to:`t${i}`});
 }
 if(seed%2)p.keepouts.push({id:'nearby',dieId:'',kinds:['pad','ball'],x:40,y:5+rand()*9,width:12,height:1+rand()*6});
 const project=normalizeProject(p),w=routeStage(project,'pad','ball',{pitch:10,layers:seed%3?1:2,timeLimitMs:1000});
 const tech={units:'um',traceWidth:.01+rand()*30,viaDiameter:.01+rand()*50,padDiameter:.01+rand()*30,clearance:seed%7?rand()*10:0};
 const old=reference(project,w,tech,{maxComparisons:10000000}),current=verifyCopper(project,w,tech);
 assert.equal(old.complete,true);assert.deepEqual(semantic(current),semantic(old));
 assert.ok(current.comparisons<=old.comparisons);
});

for(const mutation of ['via','layer','endpoint','loop','missing','metric','stale','rotated-keepout'])
 test(`index preserves adversarial rejection: ${mutation}`,()=>{
  let p=routingDemoProject();const w=routeStage(p,'pad','ball',{pitch:10,layers:2,viaCost:10});
  const tech={units:'um',traceWidth:1,viaDiameter:2,padDiameter:2,clearance:1};
  if(mutation==='via')tech.viaDiameter=80;
  if(mutation==='layer')w.routes[0].path[0][2]=7;
  if(mutation==='endpoint')w.routes[0].path.shift();
  if(mutation==='loop')w.routes[0].path.splice(1,0,clone(w.routes[0].path[0]));
  if(mutation==='missing')w.routes.pop();
  if(mutation==='metric')w.metrics.vias++;
  if(mutation==='stale')w.designKey='not the design';
  if(mutation==='rotated-keepout'){
   p.dies.push({id:'rot',name:'rot',x:10,y:10,width:100,height:100,rotation:90,mirrorX:true,edgeKeepout:0,cornerKeepout:0});
   p.keepouts.push({id:'rot-box',dieId:'rot',kinds:['pad','ball'],x:0,y:0,width:2,height:2});
   p=normalizeProject(p);w.designKey=routingDesignKey(p);
  }
  assert.deepEqual(semantic(verifyCopper(p,w,tech)),semantic(reference(p,w,tech)));
 });

test('512 routes and 8192 sites pass full grid, copper and review replay without raising safety caps',async()=>{
 const {project,witness,technology}=copperArray(512,4096);
 assert.equal(verifyRoutes(project,witness).ok,true);
 const previous=reference(project,witness,technology),current=verifyCopper(project,witness,technology);
 assert.equal(previous.complete,false);assert.equal(previous.comparisons,2000001);
 assert.equal(current.complete,true);assert.equal(current.ok,true);assert.equal(current.comparisons,0);
 assert.ok(current.spatialVisits<10000000);
 witness.technology=technology;
 const review=await createReviewBundle(project,{routing:witness});
 assert.equal((await verifyReviewBundle(review,{expectedTechnology:technology})).valid,true);
});

test('4096 supplied route witnesses pass independent copper verification; routing cap is unchanged',()=>{
 const {project,witness,technology}=copperArray(4096);
 const checked=verifyCopper(project,witness,technology);
 assert.equal(checked.ok,true);assert.equal(checked.complete,true);assert.equal(checked.metrics.routed,4096);
 assert.equal(verifyRoutes(project,witness).ok,false); // Do not claim expanded router capacity.
});

test('narrow-phase and spatial-work limits independently fail closed',()=>{
 const {project,witness,technology}=copperArray(16);
 const spatial=verifyCopper(project,witness,technology,{maxSpatialVisits:1});
 assert.equal(spatial.ok,false);assert.equal(spatial.complete,false);assert.match(spatial.issues.at(-1).message,/spatial-work budget/);
 const dense=verifyCopper(project,witness,{...technology,padDiameter:1000,traceWidth:1000},{maxComparisons:1});
 assert.equal(dense.ok,false);assert.equal(dense.complete,false);assert.match(dense.issues.at(-1).message,/comparison budget/);
});
for(const options of [null,[],{maxSpatialVisits:0},{maxSpatialVisits:1.5},{maxSpatialVisits:Infinity},{maxSpatialVisits:50000001},{maxSpatialVisit:1}])
 test(`invalid spatial budget cannot be ignored: ${JSON.stringify(options)}`,()=>{
  const {project,witness,technology}=copperArray(1);const r=verifyCopper(project,witness,technology,options);
  assert.equal(r.ok,false);assert.equal(r.complete,false);
 });
