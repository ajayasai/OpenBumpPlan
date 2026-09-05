import { assertProject, effectiveSignals, worldPoint, inversePoint, rank } from './model.js';
import { EPS, manhattan, euclidean, insideRect, crossingAnalysis, SpatialIndex } from './geometry.js';
export const DRAFT_CODES = new Set(['EMPTY_DESIGN','NO_ASSIGNMENTS','UNASSIGNED','PATH_INCOMPLETE','PAIR_INCOMPLETE','DOMAIN_UNSPECIFIED','NET_UNSPECIFIED']);
export const issueKey = issue => `${issue.code}|${[...(issue.ports || [])].sort().join('|')}|${issue.ref || ''}`;
export function blockedPosition(n, p, ctx) {
  const d = ctx.dies.get(n.dieId), result = [], w = worldPoint(n,ctx);
  if (d) {
    if (n.x < -EPS || n.y < -EPS || n.x > d.width+EPS || n.y > d.height+EPS) result.push('OUTSIDE_DIE');
    if (d.edgeKeepout > 0 && Math.min(n.x,n.y,d.width-n.x,d.height-n.y) < d.edgeKeepout-EPS) result.push('EDGE_KEEPOUT');
    if (d.cornerKeepout > 0 && [[0,0],[d.width,0],[0,d.height],[d.width,d.height]].some(([x,y]) => Math.hypot(n.x-x,n.y-y) < d.cornerKeepout-EPS)) result.push('CORNER_KEEPOUT');
  }
  for (const k of p.keepouts) if (k.kinds.includes(n.kind)) {
    if (k.dieId && n.dieId !== k.dieId) continue;
    const q = k.dieId ? inversePoint(w,ctx.dies.get(k.dieId)) : w;
    if (insideRect(q,k)) result.push(`KEEPOUT:${k.id}`);
  }
  return result;
}
/** A separable hard-compatibility predicate. Coupled rules need analyze(). */
export function compatible(source, target, p, ctx = effectiveSignals(p)) {
  if (['reserved','nc'].includes(target.role) || ['reserved','nc'].includes(source.role)) return false;
  const s = ctx.signals.get(source.id) || source;
  if (target.net && s.net && target.net !== s.net) return false;
  if (target.domain && s.domain && target.domain !== s.domain) return false;
  if (target.role !== 'any' && target.role !== s.role) return false;
  if (target.pair && target.pair !== s.pair || target.polarity && target.polarity !== s.polarity) return false;
  if (blockedPosition(target,p,ctx).length) return false;
  if (manhattan(worldPoint(source,ctx),worldPoint(target,ctx)) > p.rules.maxLength+EPS) return false;
  return true;
}
export function analyze(p) {
  assertProject(p);
  const ctx = effectiveSignals(p), r = p.rules, issues = [];
  let totalIssues=0, errors=0, warnings=0, geometryOps=0, complete=true;
  const add = (code,severity,message,ports=[],ref='') => {
    totalIssues++; if (severity === 'error') errors++; else if (severity === 'warning') warnings++;
    if (issues.length < 5000) issues.push({code,severity,message,ports,ref,category:DRAFT_CODES.has(code)?'incomplete':'constraint'});
  };
  const spend = () => { geometryOps++; if (geometryOps > r.geometryBudget) complete=false; return complete; };
  if(!p.ports.length)add('EMPTY_DESIGN','error','The project contains no interface sites.');
  else if(!p.connections.length)add('NO_ASSIGNMENTS','error','The project contains no assignments.');
  const positions = new Map(p.ports.map(n => [n.id,worldPoint(n,ctx)]));
  const active = n => Boolean(ctx.incoming.get(n.id)?.length || ctx.outgoing.get(n.id)?.length);
  let unassigned=0;
  for (const n of p.ports) {
    const used=active(n), ins=ctx.incoming.get(n.id) || [], outs=ctx.outgoing.get(n.id) || [], s=ctx.signals.get(n.id);
    if (ins.length > 1) add('MULTIPLE_DRIVERS','error',`${n.id} has ${ins.length} incoming assignments. Each physical site has capacity one.`,[n.id]);
    if (outs.length > 1) add('FANOUT','error',`${n.id} has ${outs.length} outgoing assignments. Model a branch with separate physical sites.`,[n.id]);
    if (n.required && !used) {unassigned++; add('UNASSIGNED','error',`Required port ${n.id} is unassigned.`,[n.id]);}
    if (used && ['reserved','nc'].includes(n.role)) add('FORBIDDEN_SITE','error',`${n.id} is ${n.role} and cannot carry an assignment.`,[n.id]);
    // Keep-outs describe forbidden occupied sites, not forbidden empty candidate grid points.
    if (used) for (const reason of blockedPosition(n,p,ctx)) add(reason.split(':')[0],'error',`${n.id} violates ${reason.toLowerCase().replaceAll('_',' ')}.`,[n.id],reason.split(':')[1] || '');
    if (used && !s.net) add('NET_UNSPECIFIED','error',`Active port ${n.id} has no logical net.`,[n.id]);
    if (used && ['signal','clock','power'].includes(s.role) && !s.domain) add('DOMAIN_UNSPECIFIED','error',`Active port ${n.id} has no voltage-domain identifier.`,[n.id]);
    if (used && s.role === 'any') add('ROLE_UNSPECIFIED','warning',`Active port ${n.id} has no electrical role; coverage checks cannot classify it.`,[n.id]);
    if (r.requireCompletePaths && used && rank(n.kind) < rank(r.terminalKind) && !outs.length) add('PATH_INCOMPLETE','error',`The path stops at ${n.id} before the declared terminal layer ${r.terminalKind}.`,[n.id]);
  }
  const segments=[], lengths=Object.create(null), stageTotals=Object.create(null); let totalLength=0,maxLength=0;
  const pairEdges = new Map();
  for (const e of p.connections) {
    const a=ctx.ports.get(e.from), b=ctx.ports.get(e.to), s=ctx.signals.get(a.id), t=ctx.signals.get(b.id);
    if (!r.allowedStagePairs.some(([x,y]) => x===a.kind && y===b.kind) || rank(a.kind)>=rank(b.kind)) add('STAGE_ORDER','error',`Connection ${e.id} is not an allowed forward stage.`,[a.id,b.id],e.id);
    if (b.net && s.net && b.net!==s.net || e.net && s.net && e.net!==s.net || e.net && b.net && e.net!==b.net) add('NET_CONFLICT','error',`Connection ${e.id} joins incompatible logical nets.`,[a.id,b.id],e.id);
    if (b.domain && s.domain && b.domain!==s.domain) add('DOMAIN_CONFLICT','error',`Connection ${e.id} joins ${s.domain} to ${b.domain}.`,[a.id,b.id],e.id);
    if (b.role!=='any' && s.role!=='any' && b.role!==s.role) add('ROLE_CONFLICT','error',`Connection ${e.id} joins ${s.role} to a ${b.role} site.`,[a.id,b.id],e.id);
    if (b.pair && s.pair && b.pair!==s.pair || b.polarity && s.polarity && b.polarity!==s.polarity) add('PAIR_POLARITY','error',`Connection ${e.id} changes differential-pair identity/polarity.`,[a.id,b.id],e.id);
    const length=manhattan(positions.get(a.id),positions.get(b.id)), stage=`${a.kind} -> ${b.kind}`;
    lengths[e.id]=length; totalLength+=length; maxLength=Math.max(maxLength,length); stageTotals[stage]=(stageTotals[stage] || 0)+length;
    if (length>r.maxLength+EPS) add('MAX_LENGTH','error',`${e.id}: L1 ${length.toFixed(2)} um exceeds ${r.maxLength} um.`,[a.id,b.id],e.id);
    segments.push({id:e.id,from:a.id,to:b.id,a:positions.get(a.id),b:positions.get(b.id),net:s.net || t.net,stage});
    if(s.pair) { const k=`${stage}:${s.pair}`; if(!pairEdges.has(k)) pairEdges.set(k,[]); pairEdges.get(k).push({e,s,length}); }
  }
  // Detect same-coordinate occupied sites within the same physical layer.
  const occupied=p.ports.filter(active).map(n => ({...n,...positions.get(n.id),signal:ctx.signals.get(n.id)}));
  const layerGroups = new Map();
  for(const n of occupied) {if(!layerGroups.has(n.kind)) layerGroups.set(n.kind,[]); layerGroups.get(n.kind).push(n);}
  for(const [kind,group] of layerGroups) {
    const duplicates=new Map();
    for(const n of group) {
      const key=`${n.x.toFixed(8)},${n.y.toFixed(8)}`;
      if(duplicates.has(key)) add('SITE_COLLISION','error',`Two occupied ${kind} sites share the same physical coordinate.`,[duplicates.get(key),n.id]);
      else duplicates.set(key,n.id);
    }
    if(r.minDomainSpacing>0 && complete) {
      const spatial=new SpatialIndex(group,r.minDomainSpacing);
      outer: for(const n of group) for(const m of spatial.near(n,r.minDomainSpacing)) {
        if(!spend()) break outer;
        if(n.id>=m.id || !n.signal.domain || !m.signal.domain || n.signal.domain===m.signal.domain || n.signal.role==='ground' || m.signal.role==='ground') continue;
        if(euclidean(n,m)<r.minDomainSpacing-EPS) add('DOMAIN_SPACING','error',`Different voltage domains at ${n.id}/${m.id} are closer than ${r.minDomainSpacing} um.`,[n.id,m.id]);
      }
    }
    const ground=group.filter(n => n.signal.role==='ground' && n.signal.net), power=group.filter(n => n.signal.role==='power' && n.signal.net);
    const radius=Math.max(r.groundRadius,r.clockShieldRadius,r.powerRadius,1), groundIndex=new SpatialIndex(ground,radius), powerIndex=new SpatialIndex(power,radius);
    for(const n of group) {
      if(!complete) break;
      if(!['signal','clock'].includes(n.signal.role)) continue;
      const nearby=groundIndex.near(n,radius); geometryOps+=nearby.length+1; if(geometryOps>r.geometryBudget){complete=false;break;}
      if(r.groundRadius>0 && !nearby.some(g => euclidean(n,g)<=r.groundRadius+EPS)) add('GROUND_COVERAGE','error',`No connected ground ${kind} lies within ${r.groundRadius} um of ${n.id}.`,[n.id]);
      if(n.signal.role==='clock') {
        const count=nearby.filter(g => euclidean(n,g)<=r.clockShieldRadius+EPS).length;
        if(count<r.clockGroundMin) add('CLOCK_SHIELD','error',`${n.id} needs ${r.clockGroundMin} connected ground neighbour(s) within ${r.clockShieldRadius} um; found ${count}.`,[n.id]);
      }
      if(r.requirePowerForSignals && r.powerRadius>0) {
        const supplies=powerIndex.near(n,r.powerRadius); geometryOps+=supplies.length+1; if(geometryOps>r.geometryBudget){complete=false;break;}
        if(!supplies.some(g => g.signal.domain===n.signal.domain)) add('POWER_COVERAGE','error',`No connected ${n.signal.domain || '(unspecified)'} power ${kind} within ${r.powerRadius} um of ${n.id}.`,[n.id]);
      }
    }
    const ratio=group.length ? ground.length/group.length : 0;
    if(r.minGroundRatio>0 && ratio+EPS<r.minGroundRatio) add('GROUND_RATIO','error',`${kind}: connected ground ratio ${(100*ratio).toFixed(1)}% is below ${(100*r.minGroundRatio).toFixed(1)}%.`,[],kind);
  }
  const pairGroups=new Map();
  for(const n of occupied) if(n.signal.pair) {const key=`${n.kind}:${n.signal.pair}`;if(!pairGroups.has(key))pairGroups.set(key,[]);pairGroups.get(key).push(n);}
  for(const [key,nodes] of pairGroups) {
    if(nodes.length!==2 || new Set(nodes.map(n=>n.signal.polarity)).size!==2) add('PAIR_INCOMPLETE','error',`${key} needs exactly one + and one - endpoint on this layer.`,nodes.map(n=>n.id),key);
    else if(manhattan(nodes[0],nodes[1])>r.pairMaxDistance+EPS) add('PAIR_ADJACENCY','error',`${key}: pair separation exceeds ${r.pairMaxDistance} um (L1).`,nodes.map(n=>n.id),key);
  }
  for(const [key,items] of pairEdges) if(items.length===2 && items[0].s.polarity!==items[1].s.polarity) {
    if(Math.abs(items[0].length-items[1].length)>r.pairMaxSkew+EPS) add('PAIR_SKEW','error',`${key}: L1 length mismatch exceeds ${r.pairMaxSkew} um.`,items.flatMap(v=>[v.e.from,v.e.to]),key);
  }
  for(const region of p.regions) {
    const group=occupied.filter(n=>n.kind===region.kind && insideRect(n,region));
    const ground=group.filter(n=>n.signal.role==='ground').length;
    const power=group.filter(n=>n.signal.role==='power' && (!region.domain || n.signal.domain===region.domain)).length;
    if(ground<region.minGround) add('REGION_GROUND','error',`Region ${region.id}: requires ${region.minGround} connected grounds; found ${ground}.`,[],region.id);
    if(power<region.minPower) add('REGION_POWER','error',`Region ${region.id}: requires ${region.minPower} connected power sites; found ${power}.`,[],region.id);
  }
  const crossing=crossingAnalysis(segments,Math.max(0,r.geometryBudget-geometryOps));
  complete=complete && crossing.complete;
  if(crossing.crossings>r.maxCrossings) add('RATSNEST_CROSSING','warning',`${crossing.crossings} same-stage straight-line crossing(s), above budget ${r.maxCrossings}. This is not routed-layer DRC.`,[]);
  if(crossing.overlaps) add('RATSNEST_OVERLAP','warning',`${crossing.overlaps} same-stage collinear overlap(s). Layered routing may resolve these.`,[]);
  if(!complete) add('ANALYSIS_INCOMPLETE','error','Geometry budget exhausted. Counts are lower bounds; the design must not be treated as checked.',[]);
  issues.sort((a,b) => (a.severity==='error'?0:1)-(b.severity==='error'?0:1) || a.code.localeCompare(b.code));
  return {complete, ready:complete && errors===0 && warnings===0, errors,warnings,totalIssues, detailsTruncated:totalIssues>issues.length,issues,
    metrics:{ports:p.ports.length,connections:p.connections.length,unassigned,totalLength,maxLength,meanLength:p.connections.length?totalLength/p.connections.length:0,
      crossings:crossing.crossings,overlaps:crossing.overlaps,score:totalLength+r.crossingWeight*crossing.crossings,scoreExact:complete,stageTotals},
    lengths, crossingExamples:crossing.examples, geometryComparisons:geometryOps+crossing.comparisons};
}
/** Draft incompleteness is allowed while editing; new hard violations are not. */
export function regressionCheck(before,after,{draft=true}={}) {
  if(!after.complete || after.detailsTruncated) return {ok:false,reason:'The candidate was not fully checked.'};
  const hard = a => a.issues.filter(i=>i.severity==='error' && (!draft || !DRAFT_CODES.has(i.code)));
  const oldKeys=new Set(hard(before).map(issueKey)), introduced=hard(after).filter(i=>!oldKeys.has(issueKey(i)));
  return {ok:introduced.length===0,introduced,reason:introduced[0]?.message || ''};
}
