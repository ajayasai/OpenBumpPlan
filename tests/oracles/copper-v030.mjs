// Frozen v0.3.0 reference. Do not optimize or import the spatial index here.
import { assertProject, clone, effectiveSignals, worldPoint, transformPoint, stableStringify } from '../../src/core/model.js';
import { analyze } from '../../src/core/rules.js';

/** Continuous-coordinate capsule/disc geometry. Deliberately does not import
 * routing.js, its rasterizer, its cell halo, or its path checker. This validates
 * a DECLARED simplified technology, not a foundry deck or a 3D field solution. */
const TOL=1e-8;
export function normalizeTechnology(technology) {
  if(!technology||technology.units!=='um')throw new Error('Explicit copper technology with units="um" is required.');
  const keys=['units','traceWidth','viaDiameter','padDiameter','clearance'];
  if(Object.keys(technology).some(k=>!keys.includes(k)))throw new Error('Unknown copper technology field.');
  for(const k of keys.slice(1))if(!Number.isFinite(technology[k])||technology[k]<(k==='clearance'?0:1e-5)||technology[k]>1e7)throw new Error(`Invalid copper ${k}.`);
  return Object.fromEntries(keys.map(k=>[k,technology[k]]));
}
function key(project){const p=clone(project);delete p.audit;delete p.revision;return stableStringify(p);}
function box(a,b,radius,layer,connectionId,kind){return {minX:Math.min(a.x,b.x),maxX:Math.max(a.x,b.x),minY:Math.min(a.y,b.y),maxY:Math.max(a.y,b.y),radius,layer,connectionId,kind};}
export function boxDistance(a,b) {
  const dx=Math.max(0,a.minX-b.maxX,b.minX-a.maxX),dy=Math.max(0,a.minY-b.maxY,b.minY-a.maxY);
  return Math.hypot(dx,dy);
}
export function verifyCopper(project,witness,technology,options={}) {
  const issues=[];let comparisons=0,totalIssues=0;
  const add=(code,message,objects=[])=>{totalIssues++;if(issues.length<1000)issues.push({code,message,objects});};
  try {
    assertProject(project);const tech=normalizeTechnology(technology);
    const maxComparisons=options.maxComparisons??2000000;
    if(!Number.isInteger(maxComparisons)||maxComparisons<1||maxComparisons>10000000)throw new Error('Invalid continuous-geometry comparison budget.');
    if(witness?.type!=='openbumpplan-route-witness'||witness.schemaVersion!==1||witness.designKey!==key(project))throw new Error('Missing, stale or unsupported route witness.');
    const c=witness.config,ctx=effectiveSignals(project);
    if(!c||!project.rules.allowedStagePairs.some(([a,b])=>a===c.fromKind&&b===c.toKind))throw new Error('Invalid routing stage.');
    for(const v of ['pitch','originX','originY'])if(!Number.isFinite(c[v])||Math.abs(c[v])>1e9)throw new Error('Invalid grid coordinate system.');
    if(c.pitch<=0||!Number.isInteger(c.layers)||c.layers<1||c.layers>8||!Number.isInteger(c.columns)||!Number.isInteger(c.rows)||c.columns<1||c.rows<1||c.columns*c.rows*c.layers>262144||![c.startLayer,c.endLayer].every(z=>Number.isInteger(z)&&z>=0&&z<c.layers))throw new Error('Invalid grid bounds.');
    const expected=project.connections.filter(e=>ctx.ports.get(e.from).kind===c.fromKind&&ctx.ports.get(e.to).kind===c.toKind),edgeMap=new Map(expected.map(e=>[e.id,e]));
    if(!Array.isArray(witness.routes)||witness.routes.length>expected.length||!expected.length)throw new Error('Invalid route collection.');
    const planning=analyze(project);if(!planning.complete||planning.detailsTruncated||planning.errors)add('PLANNING_INVALID','Configured hard rules are not fully satisfied.');
    const primitives=[],seen=new Set(),lengths=new Map();let nodes=0,wireLength=0,vias=0;
    const xy=xyz=>({x:c.originX+xyz[0]*c.pitch,y:c.originY+xyz[1]*c.pitch});
    for(const route of witness.routes){
      const e=edgeMap.get(route.connectionId);
      if(!e||seen.has(e.id))throw new Error('Unknown or duplicate route ID.');seen.add(e.id);
      if(!Array.isArray(route.path)||!route.path.length)throw new Error('Empty path.');
      for(const v of route.path){
        if(++nodes>1000000)throw new Error('Continuous geometry node budget exceeded.');
        if(!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isInteger(n))||v[0]<0||v[0]>=c.columns||v[1]<0||v[1]>=c.rows||v[2]<0||v[2]>=c.layers)throw new Error('Invalid route coordinate.');
      }
      const first=xy(route.path[0]),last=xy(route.path.at(-1)),start=worldPoint(ctx.ports.get(e.from),ctx),end=worldPoint(ctx.ports.get(e.to),ctx);
      if(Math.hypot(first.x-start.x,first.y-start.y)>TOL||Math.hypot(last.x-end.x,last.y-end.y)>TOL||route.path[0][2]!==c.startLayer||route.path.at(-1)[2]!==c.endLayer)add('ENDPOINT_MISMATCH',e.id,[e.id]);
      if(new Set(route.path.map(p=>p.join(','))).size!==route.path.length)add('LOOP',e.id,[e.id]);
      let length=0,run=null;
      const flush=()=>{if(run){primitives.push(box(run.start,run.end,tech.traceWidth/2,run.z,e.id,'trace'));run=null;}};
      if(route.path.length===1)primitives.push(box(first,first,tech.traceWidth/2,c.startLayer,e.id,'terminal'));
      for(let i=1;i<route.path.length;i++){
        const a=route.path[i-1],b=route.path[i],dx=b[0]-a[0],dy=b[1]-a[1],dz=b[2]-a[2];
        if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)!==1)throw new Error('Non-adjacent/diagonal route step.');
        if(dz){flush();vias++;const p=xy(a);for(const z of [a[2],b[2]])primitives.push(box(p,p,tech.viaDiameter/2,z,e.id,'via'));}
        else{
          const direction=dx?`x${dx}`:`y${dy}`;
          if(run&&run.z===a[2]&&run.direction===direction)run.end=xy(b);
          else{flush();run={start:xy(a),end:xy(b),z:a[2],direction};}
          length+=c.pitch;
        }
      }
      flush();lengths.set(e.id,length);wireLength+=length;
      if(length>project.rules.maxLength+TOL)add('ROUTED_LENGTH_LIMIT',e.id,[e.id]);
    }
    for(const e of expected)if(!seen.has(e.id))add('MISSING_ROUTE',e.id,[e.id]);
    const pairGroups=new Map();for(const e of expected){const signal=ctx.signals.get(e.from);if(signal.pair){if(!pairGroups.has(signal.pair))pairGroups.set(signal.pair,[]);pairGroups.get(signal.pair).push(e.id);}}
    for(const [pair,ids]of pairGroups)if(ids.length===2&&ids.every(id=>lengths.has(id))&&Math.abs(lengths.get(ids[0])-lengths.get(ids[1]))>project.rules.pairMaxSkew+TOL)add('ROUTED_PAIR_SKEW',pair,ids);
    const obstacles=[];
    for(const k of project.keepouts.filter(k=>k.kinds.includes(c.fromKind)||k.kinds.includes(c.toKind))){
      const corners=[[0,0],[k.width,0],[0,k.height],[k.width,k.height]].map(([x,y])=>transformPoint({x:k.x+x,y:k.y+y},ctx.dies.get(k.dieId)));
      obstacles.push({minX:Math.min(...corners.map(p=>p.x)),maxX:Math.max(...corners.map(p=>p.x)),minY:Math.min(...corners.map(p=>p.y)),maxY:Math.max(...corners.map(p=>p.y)),radius:0,id:k.id,kind:'keepout'});
    }
    for(const p of project.ports.filter(p=>[c.fromKind,c.toKind].includes(p.kind)&&(['reserved','nc'].includes(p.role)||ctx.incoming.has(p.id)||ctx.outgoing.has(p.id)))){
      const pos=worldPoint(p,ctx);obstacles.push({...box(pos,pos,tech.padDiameter/2,-1,'','pad'),id:p.id});
    }
    const near=(a,b)=>{
      if(++comparisons>maxComparisons)throw new Error('Continuous geometry comparison budget exceeded; no all-clear result.');
      const distance=boxDistance(a,b),required=a.radius+b.radius+tech.clearance;
      return tech.clearance===0?distance<=required+TOL:distance<required-TOL;
    };
    // Copper-to-copper sweep on EACH layer. The primitive metric is continuous
    // Euclidean separation, independent of grid occupancy or raster-cell spacing.
    for(let z=0;z<c.layers;z++){
      const list=primitives.filter(p=>p.layer===z).sort((a,b)=>(a.minX-a.radius)-(b.minX-b.radius));let active=[];
      for(const a of list){
        active=active.filter(b=>b.maxX+b.radius+tech.clearance+TOL>=a.minX-a.radius);
        for(const b of active)if(a.connectionId!==b.connectionId&&near(a,b))add('COPPER_CLEARANCE',`${a.kind}/${b.kind} separation violates declared width/clearance.`,[a.connectionId,b.connectionId]);
        active.push(a);
      }
    }
    for(const a of primitives){
      const e=edgeMap.get(a.connectionId);
      for(const b of obstacles){
        if(b.kind==='pad'&&(b.id===e.from||b.id===e.to))continue;
        if(near(a,b))add(b.kind==='pad'?'PAD_CLEARANCE':'COPPER_KEEPOUT',`${a.connectionId} violates ${b.kind} clearance at ${b.id}.`,[a.connectionId,b.id]);
      }
    }
    // Occupied terminal pads are actual discs, not just route obstacles. Check
    // pairwise separation within a physical stage, even when neither trace
    // approaches the overlap (the old point-site collision rule cannot see it).
    const pads=obstacles.filter(p=>p.kind==='pad');
    for(let i=0;i<pads.length;i++)for(let j=0;j<i;j++){
      if(ctx.ports.get(pads[i].id).kind===ctx.ports.get(pads[j].id).kind&&near(pads[i],pads[j]))add('PAD_PAD_CLEARANCE','Occupied/reserved pads overlap or violate spacing.',[pads[i].id,pads[j].id]);
    }
    const metrics={routed:seen.size,wireLength,vias};
    if(stableStringify(metrics)!==stableStringify(witness.metrics))add('METRICS_MISMATCH','Route metrics do not match physical path lengths and layer transitions.');
    return {ok:totalIssues===0,complete:true,technology:tech,scope:'Declared round-capped trace widths, circular pads/vias and axis-aligned keepouts on each routing layer; no electrical/thermal/foundry signoff.',metrics,primitives:primitives.length,comparisons,totalIssues,issues};
  }catch(error){add('INVALID_OR_INCOMPLETE',error.message);return {ok:false,complete:false,comparisons,totalIssues,issues};}
}
