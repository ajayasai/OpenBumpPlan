import { assertProject, clone, effectiveSignals, worldPoint, stableStringify, rank } from './model.js';
import { blockedPosition } from './rules.js';
import { manhattan, EPS } from './geometry.js';
import { sha256Bytes } from './hash.js';

/** Complete sparse unary-compatible assignment graph. No nearest-k truncation.
 * Costs are integer ticks: round((L1 + ECO penalty)/quantum). A certificate is
 * for this declared integer objective, not the separate crossing score. */
export function sparseAssignmentProblem(project, fromKind, toKind, options = {}) {
  assertProject(project);
  if (!project.rules.allowedStagePairs.some(([a,b]) => a===fromKind && b===toKind) || rank(fromKind)>=rank(toKind)) throw new Error('Select an allowed forward stage.');
  const allowed = new Set(['sourceIds','changePenalty','quantum','maxEdges','maxCandidateChecks','timeLimitMs','maxAugmentations']);
  for (const key of Object.keys(options)) if (!allowed.has(key)) throw new Error(`Unknown scalable-solver option: ${key}`);
  const penalty = options.changePenalty ?? 0, quantum = options.quantum ?? 0.001;
  if (!Number.isFinite(penalty) || penalty<0 || penalty>1e9 || !Number.isFinite(quantum) || quantum<1e-6 || quantum>1e6) throw new Error('Invalid changePenalty or quantum.');
  const maxEdges=options.maxEdges??250000, maxChecks=options.maxCandidateChecks??5000000;
  if (!Number.isInteger(maxEdges)||maxEdges<1||maxEdges>1000000||!Number.isInteger(maxChecks)||maxChecks<1||maxChecks>20000000) throw new Error('Invalid sparse graph resource limits.');
  const ctx=effectiveSignals(project);
  const stage=project.connections.filter(e=>ctx.ports.get(e.from).kind===fromKind&&ctx.ports.get(e.to).kind===toKind);
  const fixed=new Set(stage.filter(e=>e.locked||ctx.ports.get(e.from).locked||ctx.ports.get(e.to).locked).flatMap(e=>[e.from,e.to]));
  let sources=project.ports.filter(s=>s.kind===fromKind&&!s.locked&&!fixed.has(s.id)&&!['reserved','nc'].includes(s.role)&&ctx.signals.get(s.id).net&&!(ctx.outgoing.get(s.id)||[]).some(e=>ctx.ports.get(e.to).kind!==toKind));
  if (options.sourceIds!==undefined) {
    if (!Array.isArray(options.sourceIds)||new Set(options.sourceIds).size!==options.sourceIds.length||options.sourceIds.some(id=>!sources.some(s=>s.id===id))) throw new Error('sourceIds must contain distinct eligible unlocked source IDs.');
    const ids=new Set(options.sourceIds);sources=sources.filter(s=>ids.has(s.id));
  }
  sources.sort((a,b)=>(a.id<b.id?-1:a.id>b.id?1:0));
  const ids=new Set(sources.map(s=>s.id));
  const targets=project.ports.filter(t=>t.kind===toKind&&!t.locked&&!fixed.has(t.id)&&!['reserved','nc'].includes(t.role)&&!(ctx.incoming.get(t.id)||[]).some(e=>!ids.has(e.from))).sort((a,b)=>(a.id<b.id?-1:a.id>b.id?1:0));
  const retained=project.connections.filter(e=>!ids.has(e.from));
  const original=new Map(sources.map(s=>[s.id,stage.filter(e=>e.from===s.id)]));
  if ([...original.values()].some(es=>es.length>1)) throw new Error('Repair multiple outgoing assignments before optimization.');
  const point=targets.map(t=>worldPoint(t,ctx));
  const eligible=targets.map(t=>blockedPosition(t,project,ctx).length===0);
  const sorted=targets.map((_,j)=>j).sort((a,b)=>point[a].x-point[b].x||a-b);
  const lower=x=>{let lo=0,hi=sorted.length;while(lo<hi){const m=(lo+hi)>>>1;if(point[sorted[m]].x<x)lo=m+1;else hi=m;}return lo;};
  const rows=[],limit=project.rules.maxLength;let candidateChecks=0,edgeCount=0;
  // Limit the magnitudes to keep every potential, path, and total cost calculation
  // exact in the IEEE-754 integer range. No epsilon optimality test is used.
  const maxArcCost=Math.floor(Number.MAX_SAFE_INTEGER/(32*(sources.length+targets.length+2)));
  for (const s of sources) {
    const sp=worldPoint(s,ctx),signal=ctx.signals.get(s.id),row=[];
    for(let k=lower(sp.x-limit-EPS);k<sorted.length&&point[sorted[k]].x<=sp.x+limit+EPS;k++) {
      if(++candidateChecks>maxChecks)throw new Error('Candidate-check budget exceeded. Narrow the ECO scope or maximum length; no graph truncation was accepted.');
      const j=sorted[k],t=targets[j];
      if(!eligible[j]||t.net&&signal.net&&t.net!==signal.net||t.domain&&signal.domain&&t.domain!==signal.domain||t.role!=='any'&&signal.role!=='any'&&t.role!==signal.role||t.pair&&signal.pair&&t.pair!==signal.pair||t.polarity&&signal.polarity&&t.polarity!==signal.polarity)continue;
      const length=manhattan(sp,point[j]);if(length>limit+EPS)continue;
      const cost=Math.round((length+(original.get(s.id)[0]?.to===t.id?0:penalty))/quantum);
      if(!Number.isSafeInteger(cost)||cost<0||cost>maxArcCost)throw new Error('Integer-cost safety bound exceeded; increase quantum or narrow the scope.');
      if(++edgeCount>maxEdges)throw new Error('Compatible-edge budget exceeded. Narrow the ECO scope or maximum length; no nearest-k pruning was performed.');
      row.push({j,cost});
    }
    row.sort((a,b)=>a.j-b.j);rows.push(row);
  }
  const scope={fromKind,toKind,sourceIds:sources.map(s=>s.id),targetIds:targets.map(t=>t.id),quantum,changePenalty:penalty,objective:'sum round((L1_um + changedTargetPenalty_um) / quantum_um)',candidatePolicy:'all unary-compatible targets within maxLength; no nearest-k pruning'};
  const content=clone(project);delete content.audit;delete content.revision;
  const digest=sha256Bytes(new TextEncoder().encode(stableStringify({project:content,scope,rows})));
  function materialize(assignment) {
    if(!Array.isArray(assignment)||assignment.length!==sources.length||new Set(assignment).size!==assignment.length)throw new Error('Invalid complete assignment.');
    const p=clone(project);p.connections=clone(retained);const edgeIds=new Set(p.connections.map(e=>e.id));
    sources.forEach((s,i)=>{
      if(!rows[i].some(e=>e.j===assignment[i]))throw new Error('Assignment uses an absent candidate arc.');
      const old=original.get(s.id)[0];let id=old?.id||`certified:${s.id}`,suffix=1;
      while(edgeIds.has(id))id=`certified:${s.id}:${suffix++}`;edgeIds.add(id);
      p.connections.push({id,from:s.id,to:targets[assignment[i]].id,net:old?.net||'',locked:false});
    });return p;
  }
  return {sources,targets,rows,scope,digest,edgeCount,candidateChecks,materialize,ctx,original};
}
