import { analyze } from './rules.js';
/** Conservative rectilinear grid router. This is route FEASIBILITY PLANNING,
 * not a detailed package router, padstack model, field solver or foundry DRC.
 * Site keep-outs are not implicitly reinterpreted as routing-layer obstacles.
 */
import { assertProject, effectiveSignals, worldPoint, clone } from './model.js';
import { manhattan } from './geometry.js';
export const ROUTING_VERSION = 'grid-astar/1';
const EPS=1e-7;
export function routingConfig(raw={}) {
  const c={x:0,y:0,pitch:100,columns:41,rows:41,layers:2,startLayer:0,endLayer:0,traceWidth:10,clearance:10,viaCost:200,passes:2,maxExpanded:200000,geometryBudget:2000000,obstacles:[],...clone(raw)};
  const known=['x','y','pitch','columns','rows','layers','startLayer','endLayer','traceWidth','clearance','viaCost','passes','maxExpanded','geometryBudget','obstacles'];
  if(Object.keys(c).some(k=>!known.includes(k))) throw new Error('Unknown routing option.');
  for(const k of ['x','y','pitch','traceWidth','clearance','viaCost']) if(typeof c[k]!=='number'||!Number.isFinite(c[k])||Math.abs(c[k])>1e8) throw new Error(`Invalid routing ${k}.`);
  if(c.pitch<=0||c.traceWidth<=0||c.clearance<0||c.viaCost<0) throw new Error('Pitch/width must be positive; clearance/via cost cannot be negative.');
  for(const [k,min,max]of [['columns',2,1000],['rows',2,1000],['layers',1,8],['passes',1,4],['maxExpanded',1,2000000],['geometryBudget',1,10000000]]) if(!Number.isInteger(c[k])||c[k]<min||c[k]>max) throw new Error(`Routing ${k} must be an integer in [${min},${max}].`);
  for(const k of ['startLayer','endLayer']) if(!Number.isInteger(c[k])||c[k]<0||c[k]>=c.layers) throw new Error(`Invalid ${k}.`);
  if(c.columns*c.rows*c.layers>250000) throw new Error('Routing grid exceeds 250,000 cells. Increase pitch or reduce the window.');
  if(Math.ceil((c.traceWidth+c.clearance)/c.pitch)>8) throw new Error('Trace/clearance halo exceeds eight grid steps. Increase pitch.');
  if(!Array.isArray(c.obstacles)||c.obstacles.length>128) throw new Error('At most 128 explicit routing obstacles are supported.');
  const ids=new Set();
  c.obstacles=c.obstacles.map((o,i)=>{
    const r={id:`obstacle-${i}`,layers:Array.from({length:c.layers},(_,j)=>j),...o};
    if(typeof r.id!=='string'||!r.id.length||r.id.length>512||ids.has(r.id)) throw new Error('Routing obstacles require unique text IDs.');ids.add(r.id);
    for(const k of ['x','y','width','height']) if(typeof r[k]!=='number'||!Number.isFinite(r[k])||Math.abs(r[k])>1e8) throw new Error(`Invalid obstacle ${k}.`);
    if(r.width<=0||r.height<=0||!Array.isArray(r.layers)||!r.layers.length||r.layers.some(z=>!Number.isInteger(z)||z<0||z>=c.layers)) throw new Error('Invalid obstacle dimensions or routing layers.');
    return r;
  });
  return c;
}
function stageLinks(p,from,to) {
  assertProject(p);
  if(!p.rules.allowedStagePairs.some(v=>v[0]===from&&v[1]===to)) throw new Error('Select an allowed forward stage.');
  const ctx=effectiveSignals(p),edges=p.connections.filter(e=>ctx.ports.get(e.from).kind===from&&ctx.ports.get(e.to).kind===to);
  if(edges.length>512) throw new Error('Routing planner limit: 512 connections per stage.');
  return {ctx,edges};
}
function grid(c) {
  const plane=c.columns*c.rows,encode=(x,y,z)=>z*plane+y*c.columns+x;
  const decode=id=>({x:id%c.columns,y:Math.floor(id/c.columns)%c.rows,z:Math.floor(id/plane)});
  const world=id=>{const n=decode(id);return {x:c.x+n.x*c.pitch,y:c.y+n.y*c.pitch,layer:n.z};};
  const onGrid=p=>{const x=(p.x-c.x)/c.pitch,y=(p.y-c.y)/c.pitch;return Math.abs(x-Math.round(x))<=EPS/c.pitch&&Math.abs(y-Math.round(y))<=EPS/c.pitch&&x>=-EPS/c.pitch&&y>=-EPS/c.pitch&&x<=c.columns-1+EPS/c.pitch&&y<=c.rows-1+EPS/c.pitch&&Number.isInteger(p.layer)&&p.layer>=0&&p.layer<c.layers;};
  const index=p=>{if(!onGrid(p)) throw new Error(`Endpoint (${p.x}, ${p.y}, layer ${p.layer}) is off-grid or outside the routing window; no silent snapping is performed.`);return encode(Math.round((p.x-c.x)/c.pitch),Math.round((p.y-c.y)/c.pitch),p.layer);};
  return {plane,encode,decode,world,onGrid,index};
}
function bounds(a,b){return {x1:Math.min(a.x,b.x),x2:Math.max(a.x,b.x),y1:Math.min(a.y,b.y),y2:Math.max(a.y,b.y)};}
function blocked(a,b,c) {
  const box=bounds(a,b),margin=c.traceWidth/2+c.clearance;
  return c.obstacles.some(o=>(o.layers.includes(a.layer)||o.layers.includes(b.layer))&&box.x2>=o.x-margin-EPS&&box.x1<=o.x+o.width+margin+EPS&&box.y2>=o.y-margin-EPS&&box.y1<=o.y+o.height+margin+EPS);
}
class Heap {
  constructor(){this.a=[];}
  less(a,b){return a.f<b.f || a.f===b.f&&(a.g<b.g || a.g===b.g&&a.id<b.id);}
  push(v){const a=this.a;let i=a.length;a.push(v);while(i){const p=(i-1)>>1;if(!this.less(v,a[p]))break;a[i]=a[p];i=p;}a[i]=v;}
  pop(){const a=this.a,root=a[0],last=a.pop();if(a.length){let i=0;while(2*i+1<a.length){let j=2*i+1;if(j+1<a.length&&this.less(a[j+1],a[j]))j++;if(!this.less(a[j],last))break;a[i]=a[j];i=j;}a[i]=last;}return root;}
}
function halo(id,c,g,fn) {
  const p=g.decode(id),r=Math.ceil((c.traceWidth+c.clearance)/c.pitch);
  for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++) {const x=p.x+dx,y=p.y+dy;if(x>=0&&x<c.columns&&y>=0&&y<c.rows)fn(g.encode(x,y,p.z));}
}
function findPath(start,end,owner,c,g,occupied,terminals,budget) {
  const clear=id=>!occupied.has(id)&&(!terminals.has(id)||[...terminals.get(id)].every(o=>o===owner));
  if(!clear(start)||!clear(end)||blocked(g.world(start),g.world(start),c)||blocked(g.world(end),g.world(end),c)) return {reason:'blocked-terminal',expanded:0};
  const endP=g.decode(end),heur=id=>{const p=g.decode(id);return (Math.abs(p.x-endP.x)+Math.abs(p.y-endP.y))*c.pitch+Math.abs(p.z-endP.z)*c.viaCost;};
  const costs=new Map([[start,0]]),parent=new Map(),closed=new Set(),heap=new Heap();heap.push({id:start,g:0,f:heur(start)});
  let expanded=0;
  while(heap.a.length) {
    const n=heap.pop();if(closed.has(n.id)||n.g!==costs.get(n.id))continue;
    if(expanded>=budget)return {reason:'search-budget',expanded};
    expanded++;closed.add(n.id);
    if(n.id===end) {const path=[end];while(path.at(-1)!==start)path.push(parent.get(path.at(-1)));path.reverse();return {path,cost:n.g,expanded};}
    const p=g.decode(n.id),moves=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
    for(const [dx,dy,dz]of moves) {
      const x=p.x+dx,y=p.y+dy,z=p.z+dz;if(x<0||x>=c.columns||y<0||y>=c.rows||z<0||z>=c.layers)continue;
      const id=g.encode(x,y,z);if(closed.has(id)||!clear(id)||blocked(g.world(n.id),g.world(id),c))continue;
      const cost=n.g+(dz?c.viaCost:c.pitch);if(cost>=(costs.get(id)??Infinity))continue;
      costs.set(id,cost);parent.set(id,n.id);heap.push({id,g:cost,f:cost+heur(id)});
    }
  }
  return {reason:'no-path-in-current-order-and-grid',expanded};
}
/** Independently checks supplied path geometry, not the router's success flag.
 * Uniform trace/via diameter; clearances are centerline Euclidean distances.
 */
export function checkRoutes(project,from,to,rawConfig,routes) {
  const c=routingConfig(rawConfig),g=grid(c),{ctx,edges}=stageLinks(project,from,to),byId=new Map(edges.map(e=>[e.id,e]));
  if(!Array.isArray(routes)||routes.length>512)throw new Error('Expected at most 512 paths.');
  if(routes.reduce((n,r)=>n+(Array.isArray(r?.points)?r.points.length:0),0)>250000)throw new Error('Route verification limit: 250,000 total path points.');
  let errors=0,comparisons=0,complete=true,wireLength=0,vias=0;const issues=[],seen=new Set(),segments=[],lengths={},pairs=new Map();
  const add=(code,ids,message)=>{errors++;if(issues.length<5000)issues.push({code,connections:ids,message});};
  for(const route of routes) {
    if(!route||typeof route!=='object'||!byId.has(route.connectionId)||seen.has(route.connectionId)) {add('ROUTE_ID',[], 'Unknown or duplicate route ID.');continue;}seen.add(route.connectionId);
    const e=byId.get(route.connectionId),points=route.points;
    if(!Array.isArray(points)||!points.length||points.length>250000) {add('ROUTE_POINTS',[e.id],'Invalid path length.');continue;}
    if(points.some(p=>!p||typeof p.x!=='number'||typeof p.y!=='number'||!Number.isFinite(p.x)||!Number.isFinite(p.y)||!g.onGrid(p))) {add('ROUTE_GRID',[e.id],'Path contains an invalid/off-grid point.');continue;}
    const source={...worldPoint(ctx.ports.get(e.from),ctx),layer:c.startLayer},target={...worldPoint(ctx.ports.get(e.to),ctx),layer:c.endLayer};
    if(manhattan(source,points[0])>EPS||source.layer!==points[0].layer||manhattan(target,points.at(-1))>EPS||target.layer!==points.at(-1).layer) add('ROUTE_ENDPOINT',[e.id],'Path does not terminate at the actual source/target and declared routing layers.');
    let length=0;
    if(points.length===1) {segments.push({...bounds(points[0],points[0]),layer:points[0].layer,id:e.id});if(blocked(points[0],points[0],c))add('ROUTE_OBSTACLE',[e.id],'Point touches an inflated obstacle.');}
    for(let k=1;k<points.length;k++) {
      const a=points[k-1],b=points[k],dx=Math.abs(a.x-b.x),dy=Math.abs(a.y-b.y),dz=Math.abs(a.layer-b.layer);
      if(dz===0&&((Math.abs(dx-c.pitch)<=EPS&&dy<=EPS)||(Math.abs(dy-c.pitch)<=EPS&&dx<=EPS))) {length+=dx+dy;segments.push({...bounds(a,b),layer:a.layer,id:e.id});}
      else if(dz===1&&dx<=EPS&&dy<=EPS) {vias++;segments.push({...bounds(a,a),layer:a.layer,id:e.id},{...bounds(b,b),layer:b.layer,id:e.id});}
      else {add('ROUTE_STEP',[e.id],'Paths must use unit orthogonal grid steps or one-layer vias.');continue;}
      if(blocked(a,b,c))add('ROUTE_OBSTACLE',[e.id],'Trace or via touches an obstacle including width/clearance inflation.');
    }
    lengths[e.id]=length;wireLength+=length;
    if(length>project.rules.maxLength+EPS)add('ROUTE_MAX_LENGTH',[e.id],'Routed planar length exceeds the configured maximum.');
    const s=ctx.signals.get(e.from);if(s.pair){if(!pairs.has(s.pair))pairs.set(s.pair,[]);pairs.get(s.pair).push({id:e.id,length,polarity:s.polarity});}
  }
  for(const [pair,items]of pairs) if(items.length===2&&items[0].polarity!==items[1].polarity&&Math.abs(items[0].length-items[1].length)>project.rules.pairMaxSkew+EPS) add('ROUTE_PAIR_SKEW',items.map(v=>v.id),`${pair}: routed planar skew exceeds the configured limit.`);
  const sep=c.traceWidth+c.clearance,sorted=segments.sort((a,b)=>a.layer-b.layer||a.x1-b.x1),conflicts=new Set();
  outer:for(let i=0;i<sorted.length;i++)for(let j=i+1;j<sorted.length;j++) {
    const a=sorted[i],b=sorted[j];if(a.layer!==b.layer||b.x1-a.x2>=sep-EPS)break;
    if(++comparisons>c.geometryBudget){complete=false;break outer;}
    if(a.id===b.id)continue;
    const dx=Math.max(0,a.x1-b.x2,b.x1-a.x2),dy=Math.max(0,a.y1-b.y2,b.y1-a.y2);
    if(Math.hypot(dx,dy)<sep-EPS) {const key=[a.id,b.id].sort().join('\u0000');if(!conflicts.has(key)){conflicts.add(key);add('ROUTE_CLEARANCE',[a.id,b.id],'Same-layer centerlines/via lands violate width plus clearance.');}}
  }
  const missing=edges.filter(e=>!seen.has(e.id)).map(e=>e.id);
  for(const id of missing)add('ROUTE_MISSING',[id],'No path was supplied for this stage connection.');
  if(!complete)add('ROUTE_CHECK_INCOMPLETE',[],'Geometry comparison budget reached; no pass may be issued.');
  return {complete,valid:complete&&errors===0,errors,issues,detailsTruncated:errors>issues.length,missing,comparisons,metrics:{routed:seen.size,required:edges.length,wireLength,vias,cost:wireLength+vias*c.viaCost},lengths};
}
export function routeStage(project,from='pad',to='ball',rawConfig={}) {
  const c=routingConfig(rawConfig),g=grid(c),{ctx,edges}=stageLinks(project,from,to);
  if(!edges.length)throw new Error('No connections in the selected stage.');
  const requests=edges.map(e=>({id:e.id,start:g.index({...worldPoint(ctx.ports.get(e.from),ctx),layer:c.startLayer}),end:g.index({...worldPoint(ctx.ports.get(e.to),ctx),layer:c.endLayer})}));
  const terminals=new Map();for(const r of requests)for(const id of [r.start,r.end])halo(id,c,g,key=>{if(!terminals.has(key))terminals.set(key,new Set());terminals.get(key).add(r.id);});
  let expanded=0,best=null;const attempts=[];
  for(let pass=0;pass<c.passes&&expanded<c.maxExpanded;pass++) {
    const occupied=new Set(),routes=[],unrouted=[];
    const order=[...requests].sort((a,b)=>manhattan(g.world(b.start),g.world(b.end))-manhattan(g.world(a.start),g.world(a.end)) || (a.id<b.id?-1:1));
    if(pass%2)order.reverse();if(pass>1)order.push(...order.splice(0,Math.floor(order.length/2)));
    for(const r of order) {
      if(expanded>=c.maxExpanded){unrouted.push({connectionId:r.id,reason:'search-budget'});continue;}
      const result=findPath(r.start,r.end,r.id,c,g,occupied,terminals,c.maxExpanded-expanded);expanded+=result.expanded;
      if(!result.path){unrouted.push({connectionId:r.id,reason:result.reason});continue;}
      for(const id of result.path)halo(id,c,g,key=>occupied.add(key));
      routes.push({connectionId:r.id,points:result.path.map(g.world)});
    }
    routes.sort((a,b)=>a.connectionId<b.connectionId?-1:1);
    const check=checkRoutes(project,from,to,c,routes),result={routes,unrouted,check,pass:pass+1};
    attempts.push({pass:pass+1,routed:routes.length,errors:check.errors,cost:check.metrics.cost});
    if(!best || (check.valid&&!best.check.valid) || check.valid===best.check.valid&&(routes.length>best.routes.length || routes.length===best.routes.length&&check.errors<best.check.errors || routes.length===best.routes.length&&check.errors===best.check.errors&&check.metrics.cost<best.check.metrics.cost))best=result;
  }
  const a=analyze(project),inputCheck={complete:a.complete,errors:a.errors,warnings:a.warnings};
  return {algorithm:ROUTING_VERSION,from,to,config:c,inputCheck,status:!a.complete||a.errors?'invalid-input':best.check.valid?'routed':'partial',expanded,attempts,...best,
    limitation:'Conservative uniform-width grid planning, explicit routing obstacles only. No padstacks, SI/PI, delay matching, impedance, thermal analysis, or foundry signoff. Failure is not a proof of global unroutability.'};
}
