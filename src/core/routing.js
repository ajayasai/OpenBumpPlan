import { assertProject, clone, effectiveSignals, worldPoint, transformPoint, stableStringify } from './model.js';
import { analyze } from './rules.js';
import { EPS, manhattan } from './geometry.js';

export function routingDesignKey(project) {
  const p = clone(project); delete p.audit; delete p.revision;
  return stableStringify(p); // Full canonical content, not the 32-bit display fingerprint.
}
function finite(value, name, min, max, integer = false) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max || integer && !Number.isInteger(value)) {
    throw new Error(`${name} must be ${integer?'an integer':'finite'} in [${min}, ${max}].`);
  }
  return value;
}
function context(project, fromKind, toKind, options = {}) {
  assertProject(project);
  if (!project.rules.allowedStagePairs.some(([a,b]) => a === fromKind && b === toKind)) throw new Error('Routing requires an allowed stage.');
  const ctx = effectiveSignals(project);
  const edges = project.connections.filter(e => ctx.ports.get(e.from).kind === fromKind && ctx.ports.get(e.to).kind === toKind);
  if (!edges.length || edges.length > 512) throw new Error('Routing requires 1 to 512 assignments in the selected stage.');
  const pitch = finite(options.pitch ?? 100,'pitch',0.001,1e7);
  const layers = finite(options.layers ?? 2,'layers',1,8,true);
  const clearance = finite(options.clearance ?? 0,'clearance',0,pitch*8);
  const viaCost = finite(options.viaCost ?? 4*pitch,'viaCost',0,1e9);
  const startLayer = finite(options.startLayer ?? 0,'startLayer',0,layers-1,true), endLayer = finite(options.endLayer ?? 0,'endLayer',0,layers-1,true);
  const points = edges.flatMap(e=>[worldPoint(ctx.ports.get(e.from),ctx),worldPoint(ctx.ports.get(e.to),ctx)]);
  const originX = finite(options.originX ?? (Math.floor(Math.min(...points.map(p=>p.x))/pitch)-3)*pitch,'originX',-1e9,1e9);
  const originY = finite(options.originY ?? (Math.floor(Math.min(...points.map(p=>p.y))/pitch)-3)*pitch,'originY',-1e9,1e9);
  const columns = finite(options.columns ?? Math.ceil((Math.max(...points.map(p=>p.x))-originX)/pitch)+4,'columns',1,1024,true);
  const rows = finite(options.rows ?? Math.ceil((Math.max(...points.map(p=>p.y))-originY)/pitch)+4,'rows',1,1024,true);
  const plane = columns*rows, count = plane*layers;
  if (count > 262144) throw new Error('Routing grid exceeds 262,144 cells across all layers; increase pitch or restrict the window.');
  const config = {fromKind,toKind,pitch,layers,clearance,viaCost,startLayer,endLayer,originX,originY,columns,rows};
  const node = (x,y,z) => z*plane+y*columns+x;
  const coords = n => [n%columns,Math.floor(n/columns)%rows,Math.floor(n/plane)];
  function endpoint(port, z) {
    const p = worldPoint(port,ctx), x = Math.round((p.x-originX)/pitch), y = Math.round((p.y-originY)/pitch);
    if (Math.abs(originX+x*pitch-p.x)>EPS || Math.abs(originY+y*pitch-p.y)>EPS) throw new Error(`OFF_GRID: ${port.id} is not on the declared routing grid. No silent snapping is allowed.`);
    if (x<0 || y<0 || x>=columns || y>=rows) throw new Error(`OUT_OF_GRID: ${port.id}.`);
    return node(x,y,z);
  }
  const endpoints = new Map(edges.map(e=>[e.id,[endpoint(ctx.ports.get(e.from),startLayer),endpoint(ctx.ports.get(e.to),endLayer)]]));
  const blockedCells = new Set(), siteOwners = new Map(); let obstacleOps = 0;
  const inflate = clearance + pitch/2;
  function raster(rect, fn) {
    const x0=Math.max(0,Math.ceil((rect.x-inflate-originX)/pitch-EPS)), x1=Math.min(columns-1,Math.floor((rect.x+rect.width+inflate-originX)/pitch+EPS));
    const y0=Math.max(0,Math.ceil((rect.y-inflate-originY)/pitch-EPS)), y1=Math.min(rows-1,Math.floor((rect.y+rect.height+inflate-originY)/pitch+EPS));
    for (let y=y0; y<=y1; y++) for (let x=x0; x<=x1; x++) {
      if (++obstacleOps > 2000000) throw new Error('Obstacle rasterization budget exhausted.');
      fn(y*columns+x);
    }
  }
  for (const k of project.keepouts.filter(k=>k.kinds.includes(fromKind)||k.kinds.includes(toKind))) {
    const corners = [[0,0],[k.width,0],[0,k.height],[k.width,k.height]].map(([x,y])=>transformPoint({x:k.x+x,y:k.y+y},ctx.dies.get(k.dieId)));
    const x=Math.min(...corners.map(p=>p.x)), y=Math.min(...corners.map(p=>p.y));
    raster({x,y,width:Math.max(...corners.map(p=>p.x))-x,height:Math.max(...corners.map(p=>p.y))-y},cell=>blockedCells.add(cell));
  }
  // Conservative site columns: active terminals and reserved/NC positions block all
  // route layers except for a route's own terminals. Empty candidate sites are not copper.
  for (const p of project.ports.filter(p=>[fromKind,toKind].includes(p.kind) && (['reserved','nc'].includes(p.role)||ctx.incoming.has(p.id)||ctx.outgoing.has(p.id)))) {
    const q=worldPoint(p,ctx);
    raster({...q,width:0,height:0},cell=>{if(!siteOwners.has(cell))siteOwners.set(cell,new Set());siteOwners.get(cell).add(p.id);});
  }
  function staticBlocked(n,e) {
    const cell=n%plane;
    return blockedCells.has(cell) || [...(siteOwners.get(cell)||[])].some(id=>id!==e.from&&id!==e.to);
  }
  const radius = Math.ceil(clearance/pitch);
  function halo(n) {
    const [x,y,z]=coords(n), result=[];
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++) {
      if(x+dx>=0&&x+dx<columns&&y+dy>=0&&y+dy<rows)result.push(node(x+dx,y+dy,z));
    }
    return result;
  }
  return {ctx,edges,config,node,coords,plane,count,endpoints,staticBlocked,halo};
}
class MinHeap {
  constructor(){this.items=[];}
  push(item){const a=this.items;a.push(item);let i=a.length-1;while(i>0){const p=(i-1)>>1;if(a[p][0]<=item[0])break;a[i]=a[p];i=p;}a[i]=item;}
  pop(){const a=this.items,top=a[0],last=a.pop();if(a.length){let i=0;while(i*2+1<a.length){let child=i*2+1;if(child+1<a.length&&a[child+1][0]<a[child][0])child++;if(a[child][0]>=last[0])break;a[i]=a[child];i=child;}a[i]=last;}return top;}
  get size(){return this.items.length;}
}
function pathSearch(c, edge, occupied, budget, penalty = null) {
  const [start,goal]=c.endpoints.get(edge.id), [gx,gy,gz]=c.coords(goal), {pitch,viaCost,columns,rows,layers}=c.config;
  if(c.staticBlocked(start,edge)||c.staticBlocked(goal,edge)||!penalty&&(occupied.has(start)||occupied.has(goal)))return {path:null,reason:'blocked-terminal'};
  const dist=new Float64Array(c.count).fill(Infinity), prev=new Int32Array(c.count).fill(-1), closed=new Uint8Array(c.count), heap=new MinHeap();
  const h=n=>{const [x,y,z]=c.coords(n);return (Math.abs(x-gx)+Math.abs(y-gy))*pitch+Math.abs(z-gz)*viaCost;};
  dist[start]=0;heap.push([h(start),start,0]);
  while(heap.size){
    if(budget.expansions>=budget.maxExpansions||performance.now()-budget.started>=budget.timeLimitMs)return {path:null,reason:'search-budget'};
    const [,n,g]=heap.pop();if(closed[n]||g!==dist[n])continue;closed[n]=1;budget.expansions++;
    if(n===goal){const path=[];for(let v=goal;v!==-1;v=prev[v])path.push(c.coords(v));return {path:path.reverse(),reason:null};}
    const [x,y,z]=c.coords(n), neighbours=[];
    if(x)neighbours.push([n-1,pitch]);if(x+1<columns)neighbours.push([n+1,pitch]);if(y)neighbours.push([n-columns,pitch]);if(y+1<rows)neighbours.push([n+columns,pitch]);
    if(z)neighbours.push([n-c.plane,viaCost]);if(z+1<layers)neighbours.push([n+c.plane,viaCost]);
    for(const [v,cost]of neighbours){if(closed[v]||c.staticBlocked(v,edge)||!penalty&&occupied.has(v))continue;const ng=g+cost+(penalty?penalty(v):0);if(ng<dist[v]){dist[v]=ng;prev[v]=n;heap.push([ng+h(v),v,ng]);}}
  }
  return {path:null,reason:'no-path-with-current-reservations'};
}
function routeMetrics(routes,pitch){let wireLength=0,vias=0;for(const r of routes)for(let i=1;i<r.path.length;i++){if(r.path[i][2]!==r.path[i-1][2])vias++;else wireLength+=pitch;}return {routed:routes.length,wireLength,vias};}

/** Sequential multi-order A* supplies geometric route witnesses, not global routing
 * infeasibility proofs or foundry-qualified conductor/return-path signoff. */
export function routeStage(project,fromKind='pad',toKind='ball',options={}) {
  const c=context(project,fromKind,toKind,options), before=analyze(project);
  const maxExpansions=finite(options.maxExpansions??500000,'maxExpansions',1,2000000,true), timeLimitMs=finite(options.timeLimitMs??5000,'timeLimitMs',1,60000);
  const orderTrials=finite(options.orderTrials??3,'orderTrials',1,3,true);
  const budget={expansions:0,maxExpansions,timeLimitMs,started:performance.now()};
  let best={routes:[],failures:c.edges.map(e=>({connectionId:e.id,reason:'not-attempted'}))};
  const result={type:'openbumpplan-route-witness',schemaVersion:1,designKey:routingDesignKey(project),config:c.config,routes:[],failures:[],metrics:{routed:0,wireLength:0,vias:0},verified:false};
  if(!before.complete||before.detailsTruncated||before.errors)return {...result,status:'input-invalid',failures:best.failures,message:'Repair hard planning violations and incomplete analysis before routing.'};
  const length=e=>manhattan(worldPoint(c.ctx.ports.get(e.from),c.ctx),worldPoint(c.ctx.ports.get(e.to),c.ctx));
  const longest=[...c.edges].sort((a,b)=>length(b)-length(a)||a.id.localeCompare(b.id));
  const orders=[longest,[...longest].reverse(),[...c.edges].sort((a,b)=>a.id.localeCompare(b.id))];
  let attemptedOrders=0;
  for(const order of orders.slice(0,orderTrials)){
    attemptedOrders++;const occupied=new Set(), routes=[],failures=[];
    for(const edge of order){
      const path=pathSearch(c,edge,occupied,budget);
      if(!path.path){failures.push({connectionId:edge.id,reason:path.reason});continue;}
      routes.push({connectionId:edge.id,path:path.path});
      for(const [x,y,z]of path.path)for(const n of c.halo(c.node(x,y,z)))occupied.add(n);
    }
    if(attemptedOrders===1||routes.length>best.routes.length||routes.length===best.routes.length&&routeMetrics(routes,c.config.pitch).wireLength<routeMetrics(best.routes,c.config.pitch).wireLength)best={routes,failures};
    if(!failures.length||budget.expansions>=maxExpansions||performance.now()-budget.started>=timeLimitMs)break;
  }
  Object.assign(result,best,{metrics:routeMetrics(best.routes,c.config.pitch),expansions:budget.expansions,attemptedOrders,elapsedMs:performance.now()-budget.started});
  const verification=verifyRoutes(project,result);result.verification=verification;result.verified=verification.ok;
  result.status=verification.ok?'routed':best.failures.length?'partial':'constraint-failed';
  result.message=verification.ok?'All selected-stage routes independently checked on the declared conservative grid. Not electrical or manufacturing signoff.':
    'No fully valid witness was found within the route-order/search budget. This is NOT proof that the design is unroutable.';
  return result;
}

/** Search-independent witness check: never trust solver status, claimed metrics,
 * or completeness. Validate every segment, obstacle, terminal and inter-route gap. */
export function verifyRoutes(project,witness) {
  const issues=[];const add=(code,message)=>{if(issues.length<1000)issues.push({code,message});};
  try {
    if(!witness||witness.type!=='openbumpplan-route-witness'||witness.schemaVersion!==1)throw new Error('Unsupported route witness.');
    if(witness.designKey!==routingDesignKey(project))throw new Error('STALE_DESIGN: route witness belongs to different design content.');
    const c=context(project,witness.config.fromKind,witness.config.toKind,witness.config);
    if(!Array.isArray(witness.routes)||witness.routes.length>c.edges.length)throw new Error('Invalid route list.');
    const edgeMap=new Map(c.edges.map(e=>[e.id,e])),seen=new Set(),occupied=new Map(),lengths=new Map();let checkedNodes=0;
    const planning=analyze(project);if(!planning.complete||planning.detailsTruncated||planning.errors)add('PLANNING_INVALID','Input does not pass a complete hard-rule check.');
    for(const route of witness.routes){
      const e=edgeMap.get(route.connectionId);
      if(!e||seen.has(route.connectionId)){add('ROUTE_ID','Unknown or duplicate routed connection.');continue;}seen.add(e.id);
      if(!Array.isArray(route.path)||!route.path.length){add('EMPTY_PATH',e.id);continue;}
      const nodes=[];let valid=true;
      for(const xyz of route.path){
        if(++checkedNodes>1000000)throw new Error('Route witness exceeds the one-million-node verification limit.');
        if(!Array.isArray(xyz)||xyz.length!==3||xyz.some(v=>!Number.isInteger(v))||xyz[0]<0||xyz[0]>=c.config.columns||xyz[1]<0||xyz[1]>=c.config.rows||xyz[2]<0||xyz[2]>=c.config.layers){add('INVALID_NODE',e.id);valid=false;break;}
        const n=c.node(...xyz);nodes.push(n);
        if(c.staticBlocked(n,e))add('OBSTACLE',`${e.id}: obstacle/site column at ${xyz.join(',')}.`);
        if(occupied.has(n))add('ROUTE_CLEARANCE',`${e.id} conflicts with ${occupied.get(n)} at ${xyz.join(',')}.`);
      }
      if(!valid)continue;
      const [start,end]=c.endpoints.get(e.id);
      if(nodes[0]!==start||nodes.at(-1)!==end)add('ENDPOINT_MISMATCH',e.id);
      if(new Set(nodes).size!==nodes.length)add('ROUTE_LOOP',e.id);
      let wireLength=0;
      for(let i=1;i<route.path.length;i++){
        const a=route.path[i-1],b=route.path[i];
        if(Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1])+Math.abs(a[2]-b[2])!==1)add('NON_ADJACENT_STEP',e.id);
        else if(a[2]===b[2])wireLength+=c.config.pitch;
      }
      if(wireLength>project.rules.maxLength+EPS)add('ROUTED_LENGTH_LIMIT',e.id);
      lengths.set(e.id,wireLength);
      for(const n of nodes)for(const h of c.halo(n))occupied.set(h,e.id);
    }
    for(const e of c.edges)if(!seen.has(e.id))add('MISSING_ROUTE',e.id);
    const pairs=new Map();
    for(const e of c.edges){const s=c.ctx.signals.get(e.from);if(s.pair){if(!pairs.has(s.pair))pairs.set(s.pair,[]);pairs.get(s.pair).push(e);}}
    for(const [pair,edges]of pairs)if(edges.length===2&&edges.every(e=>lengths.has(e.id))&&Math.abs(lengths.get(edges[0].id)-lengths.get(edges[1].id))>project.rules.pairMaxSkew+EPS)add('ROUTED_PAIR_SKEW',pair);
    const metrics=routeMetrics(witness.routes.filter(r=>Array.isArray(r.path)&&r.path.every(p=>Array.isArray(p)&&p.length===3)),c.config.pitch);
    if(stableStringify(metrics)!==stableStringify(witness.metrics))add('METRICS_MISMATCH','Claimed routing metrics do not match the witness.');
    return {ok:issues.length===0,issues,metrics,checkedNodes,complete:seen.size===c.edges.length};
  } catch(error){add('INVALID_WITNESS',error.message);return {ok:false,issues,complete:false};}
}

export function exportRoutesSVG(project,witness) {
  // Even partial routes are useful for debugging, but the title never calls them clear.
  const checked=verifyRoutes(project,witness);
  if(!witness?.config||!Array.isArray(witness.routes))throw new Error('Invalid route witness.');
  const c=witness.config, esc=s=>String(s).replace(/[&<>"']/g,x=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[x]));
  const palette=['#2563eb','#dc2626','#059669','#7c3aed','#d97706','#0891b2','#be185d','#475569'];
  const lines=[];
  for(const r of witness.routes)for(let i=1;i<r.path.length;i++){
    const a=r.path[i-1],b=r.path[i];if(![...a,...b].every(Number.isFinite))continue;
    const title=esc(`${r.connectionId} / routing layer ${a[2]}`);
    if(a[2]!==b[2])lines.push(`<circle cx="${a[0]}" cy="${a[1]}" r=".22" fill="none" stroke="#111827" stroke-width=".08"><title>${title} via</title></circle>`);
    else lines.push(`<path d="M${a[0]},${a[1]} L${b[0]},${b[1]}" stroke="${palette[a[2]]||'#111827'}" stroke-width=".12" fill="none"><title>${title}</title></path>`);
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-1 -3 ${Number(c.columns)+1} ${Number(c.rows)+4}" role="img"><title>${esc(project.name)}: ${checked.ok?'checked grid witness':'NOT fully checked'} — planning, not signoff</title><rect x="-1" y="-3" width="${Number(c.columns)+1}" height="${Number(c.rows)+4}" fill="white"/><text x="0" y="-1.5" font-family="sans-serif" font-size=".7">${esc(checked.ok?'Checked routing grid — not signoff':'Partial / invalid routing — review required')}</text><g transform="translate(0,${Number(c.rows)-1}) scale(1,-1)">${lines.join('')}</g></svg>`;
}


/** Negotiated-congestion rip-up/reroute. Temporary collisions are allowed ONLY
 * during search. The exact same fail-closed grid verifier gates final results.
 * Historical congestion steers later searches out of scarce routing channels. */
export function routeNegotiated(project,fromKind='pad',toKind='ball',options={}) {
  const started=performance.now();
  const timeLimitMs=finite(options.timeLimitMs??15000,'timeLimitMs',1,60000);
  const maxIterations=finite(options.maxIterations??20,'maxIterations',1,50,true);
  const maxExpansions=finite(options.maxExpansions??2000000,'maxExpansions',1,2000000,true);
  const base=routeStage(project,fromKind,toKind,{...options,timeLimitMs:Math.max(1,timeLimitMs/4),maxExpansions:Math.max(1,Math.floor(maxExpansions/4))});
  if(base.verified||base.status==='input-invalid')return {...base,strategy:'negotiated-congestion',negotiationIterations:0};
  const c=context(project,fromKind,toKind,options),occupancy=new Int32Array(c.count),history=new Float64Array(c.count);
  const budget={started,timeLimitMs,maxExpansions,expansions:base.expansions||0};
  const paths=new Map(base.routes.map(r=>[r.connectionId,r.path]));
  const reserve=(path,sign)=>{const cells=new Set();for(const xyz of path)for(const h of c.halo(c.node(...xyz)))cells.add(h);for(const h of cells)occupancy[h]+=sign;};
  for(const path of paths.values())reserve(path,1);
  const degree=e=>c.endpoints.get(e.id).reduce((sum,n)=>sum+history[n],0);
  let best=base,bestIssues=base.verification?.issues?.length??Infinity,iterations=0;
  for(let iteration=1;iteration<=maxIterations;iteration++){
    if(performance.now()-started>=timeLimitMs||budget.expansions>=maxExpansions)break;
    iterations=iteration;const failures=[];
    const order=[...c.edges].sort((a,b)=>Number(paths.has(a.id))-Number(paths.has(b.id))||degree(b)-degree(a)||a.id.localeCompare(b.id));
    if(iteration%2===0)order.reverse();
    for(const e of order){
      if(paths.has(e.id)){reserve(paths.get(e.id),-1);paths.delete(e.id);}
      const found=pathSearch(c,e,new Set(),budget,n=>c.config.pitch*(2+iteration)*(occupancy[n]+history[n]));
      if(!found.path)failures.push({connectionId:e.id,reason:found.reason});
      else{paths.set(e.id,found.path);reserve(found.path,1);}
    }
    for(let n=0;n<c.count;n++)if(occupancy[n]>1)history[n]+=occupancy[n]-1;
    const routes=[...paths].map(([connectionId,path])=>({connectionId,path}));
    const candidate={...base,routes,failures,metrics:routeMetrics(routes,c.config.pitch)};
    const check=verifyRoutes(project,candidate);candidate.verification=check;candidate.verified=check.ok;
    candidate.status=check.ok?'routed':failures.length?'partial':'constraint-failed';
    if(check.ok||routes.length>best.routes.length||routes.length===best.routes.length&&check.issues.length<bestIssues){best=candidate;bestIssues=check.issues.length;}
    if(check.ok)break;
  }
  return {...best,strategy:'negotiated-congestion',negotiationIterations:iterations,expansions:budget.expansions,elapsedMs:performance.now()-started,
    message:best.verified?'A congestion-repaired route witness passed an independent grid check. No electrical or manufacturing signoff is implied.':'Negotiation budget exhausted without a valid complete witness. This is NOT a proof of unroutability.'};
}
