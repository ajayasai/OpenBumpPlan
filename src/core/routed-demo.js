import { emptyProject, normalizeProject } from './model.js';
import { routingDesignKey } from './routing.js';

/** Synthetic crossing fixture: a top-layer horizontal route and a vertical
 * route that changes to the back layer and returns through two explicit vias. */
export function routedHandoffDemo() {
  const p=emptyProject('Synthetic two-layer routed handoff');
  p.rules={...p.rules,maxLength:100000,groundRadius:0,powerRadius:0,minGroundRatio:0,clockGroundMin:0,maxCrossings:10};
  const pitch=1000,originX=-7000,originY=-3000;
  const port=(id,kind,x,y,net='')=>({id,kind,x:originX+x*pitch,y:originY+y*pitch,net,role:'any'});
  p.ports=[port('H_IN','pad',1,5,'HORIZONTAL'),port('H_OUT','ball',9,5),port('V_IN','pad',5,1,'VERTICAL'),port('V_OUT','ball',5,9),{...port('RESERVED','ball',1,10),role:'reserved'}];
  p.connections=[{id:'H',from:'H_IN',to:'H_OUT'},{id:'V',from:'V_IN',to:'V_OUT'}];
  p.keepouts=[{id:'FIXTURE_KEEPOUT',kinds:['pad','ball'],x:originX+10000,y:originY+10000,width:500,height:500}];
  const project=normalizeProject(p);
  const routes=[{connectionId:'H',path:Array.from({length:9},(_,i)=>[1+i,5,0])},
    {connectionId:'V',path:[[5,1,0],[5,2,0],...Array.from({length:7},(_,i)=>[5,i+2,1]),[5,8,0],[5,9,0]]}];
  const witness={type:'openbumpplan-route-witness',schemaVersion:1,designKey:routingDesignKey(project),
    config:{fromKind:'pad',toKind:'ball',pitch,originX,originY,columns:12,rows:12,layers:2,clearance:0,viaCost:4000,startLayer:0,endLayer:0},
    routes,metrics:{routed:2,wireLength:16000,vias:2}};
  return {project,witness,technology:{units:'um',traceWidth:250,viaDiameter:600,padDiameter:500,clearance:200},specification:{viaDrill:300,boardThickness:1600,edgeMargin:1000}};
}
