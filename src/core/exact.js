/** Deterministic branch-and-bound oracle for a SMALL, explicitly scoped stage.
 * Lower bounds relax all coupled rules and crossing penalties. Leaves are checked
 * against the entire project's configured rule engine. No timeout is a proof.
 */
import { assertProject, clone, effectiveSignals, worldPoint, rank } from './model.js';
import { analyze, compatible } from './rules.js';
import { hungarian } from './optimizer.js';
import { manhattan } from './geometry.js';
export const EXACT_VERSION = 'stage-bnb/1';
const TOL = 1e-7;
export function stageProblem(project, from, to, limits={maxSources:16,maxTargets:64}) {
  assertProject(project);
  if (rank(from) < 0 || rank(to) <= rank(from) || !project.rules.allowedStagePairs.some(v => v[0] === from && v[1] === to)) throw new Error('Select an allowed forward stage.');
  const ctx = effectiveSignals(project);
  // Only well-formed capacity-one inputs define an unambiguous reassignment domain.
  for (const n of project.ports) if ((ctx.incoming.get(n.id)?.length || 0) > 1 || (ctx.outgoing.get(n.id)?.length || 0) > 1) throw new Error('Repair multiple drivers/fanout before exact assignment.');
  const stage = project.connections.filter(e => ctx.ports.get(e.from).kind === from && ctx.ports.get(e.to).kind === to);
  const fixed = new Set(stage.filter(e => e.locked || ctx.ports.get(e.from).locked || ctx.ports.get(e.to).locked).flatMap(e => [e.from,e.to]));
  const sources = project.ports.filter(n => n.kind === from && !n.locked && !fixed.has(n.id) && !['reserved','nc'].includes(n.role) && ctx.signals.get(n.id).net && !(ctx.outgoing.get(n.id) || []).some(e => ctx.ports.get(e.to).kind !== to)).sort((a,b) => a.id < b.id ? -1 : 1);
  const ids = new Set(sources.map(n => n.id));
  const targets = project.ports.filter(n => n.kind === to && !n.locked && !fixed.has(n.id) && !['reserved','nc'].includes(n.role) && !(ctx.incoming.get(n.id) || []).some(e => !ids.has(e.from))).sort((a,b) => a.id < b.id ? -1 : 1);
  if(sources.length>limits.maxSources || targets.length>limits.maxTargets) throw new Error(`Exact oracle safety limit: ${limits.maxSources} sources / ${limits.maxTargets} targets; found ${sources.length}/${targets.length}. Lock unrelated mappings or use the heuristic.`);
  const costs = sources.map(s => targets.map(t => compatible(s,t,project,ctx) ? manhattan(worldPoint(s,ctx),worldPoint(t,ctx)) : Infinity));
  const retained = project.connections.filter(e => !ids.has(e.from));
  const constantLength = retained.reduce((sum,e) => sum + manhattan(worldPoint(ctx.ports.get(e.from),ctx),worldPoint(ctx.ports.get(e.to),ctx)),0);
  return {ctx,sources,targets,costs,retained,constantLength,stage};
}
/** Maximum matching plus an explicit Hall-deficient set, NOT just a solver error. */
export function hallWitness(costs) {
  const n=costs.length,m=costs[0]?.length || 0;
  if (costs.some(row => row.length!==m || row.some(x => typeof x !== 'number' || Number.isNaN(x) || x === -Infinity))) throw new Error('Invalid compatibility matrix.');
  const owner=Array(m).fill(-1), matched=Array(n).fill(-1);
  function augment(i,seen) {
    for(let j=0;j<m;j++) if(Number.isFinite(costs[i][j]) && !seen.has(j)) {
      seen.add(j);
      if(owner[j]===-1 || augment(owner[j],seen)) {owner[j]=i;matched[i]=j;return true;}
    }
    return false;
  }
  for(let i=0;i<n;i++) augment(i,new Set());
  if(matched.every(j=>j>=0)) return null;
  const rows=new Set(matched.flatMap((j,i)=>j<0?[i]:[])),columns=new Set(),queue=[...rows];
  for(let k=0;k<queue.length;k++) for(let j=0;j<m;j++) if(Number.isFinite(costs[queue[k]][j]) && !columns.has(j)) {
    columns.add(j);if(owner[j]>=0 && !rows.has(owner[j])) {rows.add(owner[j]);queue.push(owner[j]);}
  }
  return {sourceIndices:[...rows].sort((a,b)=>a-b),targetIndices:[...columns].sort((a,b)=>a-b),deficit:rows.size-columns.size};
}
function buildCandidate(project,problem,assignment) {
  const candidate=clone(project),used=new Set(problem.retained.map(e=>e.id));
  candidate.connections=clone(problem.retained);
  for(let i=0;i<assignment.length;i++) {
    const source=problem.sources[i],old=problem.stage.find(e=>e.from===source.id);
    let id=old?.id || `exact:${source.id}`,suffix=1;
    while(used.has(id)) id=`exact:${source.id}:${suffix++}`;
    used.add(id);candidate.connections.push({...old,id,from:source.id,to:problem.targets[assignment[i]].id,net:old?.net || '',locked:false});
  }
  return candidate;
}
export function solveExactStage(project,from='pad',to='ball',options={}) {
  const nodeLimit=options.nodeLimit ?? 20000, maxSources=options.maxSources ?? 12, maxTargets=options.maxTargets ?? 24;
  for(const [name,value,min,max] of [['nodeLimit',nodeLimit,1,200000],['maxSources',maxSources,1,16],['maxTargets',maxTargets,1,64]]) if(!Number.isInteger(value)||value<min||value>max) throw new Error(`${name} must be an integer in [${min}, ${max}].`);
  const problem=stageProblem(project,from,to,{maxSources,maxTargets}),{sources,targets,constantLength}=problem;
  const changePenalty=options.changePenalty??0,maxChanges=options.maxChanges??sources.length;
  if(typeof changePenalty!=='number'||!Number.isFinite(changePenalty)||changePenalty<0||changePenalty>1e9)throw new Error('changePenalty must be a finite value from 0 to 1e9.');
  if(!Number.isInteger(maxChanges)||maxChanges<0||maxChanges>16)throw new Error('maxChanges must be an integer from 0 to 16.');
  const oldTargets=sources.map(s=>problem.stage.find(e=>e.from===s.id)?.to);
  const changedAt=(i,j)=>oldTargets[i]!==targets[j].id;
  const changeCount=a=>a.reduce((n,j,i)=>n+(j>=0&&changedAt(i,j)?1:0),0);
  const costs=problem.costs.map((row,i)=>row.map((v,j)=>v+(changedAt(i,j)?changePenalty:0)));
  if(sources.length>maxSources || targets.length>maxTargets) throw new Error(`Exact oracle safety limit: ${maxSources} sources / ${maxTargets} targets; found ${sources.length}/${targets.length}. Lock unrelated mappings or use the heuristic.`);
  // A large candidate can multiply rule evaluation cost by the search budget.
  if(project.ports.length>2000 || project.connections.length>2000) throw new Error('Exact oracle limit: 2,000 project sites/connections. Use a reduced validation fixture.');
  const report={algorithm:EXACT_VERSION,from,to,options:{nodeLimit,maxSources,maxTargets,changePenalty,maxChanges},tolerance:TOL,
    scope:{sourceIds:sources.map(n=>n.id),targetIds:targets.map(n=>n.id),objective:'whole-project L1 + crossingWeight * same-stage straight-line crossings + changePenalty * changed assignments',constraints:'all configured hard rules; warnings permitted',fixed:'all geometry, rules, other-stage links and locked mappings'},
    status:'unknown',reason:'',nodes:0,leaves:0,pruned:0,uncheckedLeaves:0,rejectedByRule:{},lowerBound:null,upperBound:null,absoluteGap:null,relativeGap:null,changed:false,project:null,analysis:null};
  if(!sources.length) {report.status='no-op';report.reason='No movable named sources in the selected stage.';return report;}
  const witness=hallWitness(costs);
  if(witness) {report.status='infeasible';report.reason='The separable compatibility graph has a Hall-deficient set.';report.witness={sources:witness.sourceIndices.map(i=>sources[i].id),targets:witness.targetIndices.map(j=>targets[j].id),deficit:witness.deficit};return report;}
  let bestScore=Infinity,best=null,bestAnalysis=null,unknownBound=Infinity;
  const accept=assignment=>{
    report.leaves++;
    if(changeCount(assignment)>maxChanges){report.rejectedByRule.ECO_CHANGE_BUDGET=(report.rejectedByRule.ECO_CHANGE_BUDGET||0)+1;return false;}
    const candidate=buildCandidate(project,problem,assignment),a=analyze(candidate);
    if(!a.complete||a.detailsTruncated) {report.uncheckedLeaves++;return null;}
    if(a.errors) {for(const code of new Set(a.issues.filter(i=>i.severity==='error').map(i=>i.code))) report.rejectedByRule[code]=(report.rejectedByRule[code]||0)+1;return false;}
    const score=a.metrics.score+changePenalty*changeCount(assignment);
    if(score<bestScore) {best=candidate;bestAnalysis=a;bestScore=score;report.changedAssignments=changeCount(assignment);}
    return true;
  };
  // Incumbents must belong to THIS domain: all movable sources get one target.
  const current=sources.map(s=>targets.findIndex(t=>problem.stage.some(e=>e.from===s.id&&e.to===t.id)));
  if(current.every((j,i)=>j>=0&&Number.isFinite(costs[i][j]))&&new Set(current).size===current.length) accept(current);
  const relaxed=hungarian(costs);if(relaxed) accept(relaxed);
  const order=sources.map((_,i)=>i).sort((i,j)=>costs[i].filter(Number.isFinite).length-costs[j].filter(Number.isFinite).length || i-j);
  function bound(assignment) {
    const used=new Set(assignment.filter(j=>j>=0)),rows=order.filter(i=>assignment[i]<0),cols=targets.map((_,j)=>j).filter(j=>!used.has(j));
    let value=constantLength;for(let i=0;i<assignment.length;i++) if(assignment[i]>=0) value+=costs[i][assignment[i]];
    const matrix=rows.map(i=>cols.map(j=>costs[i][j])),result=hungarian(matrix);
    if(!result) return Infinity;
    for(let r=0;r<rows.length;r++) value+=matrix[r][result[r]];
    return value;
  }
  const root=Array(sources.length).fill(-1),stack=[{assignment:root,depth:0,bound:bound(root)}];
  while(stack.length && report.nodes<nodeLimit) {
    const node=stack.pop();report.nodes++;
    if(node.bound>=bestScore-TOL) {report.pruned++;continue;}
    if(node.depth===sources.length) {if(accept(node.assignment)===null) unknownBound=Math.min(unknownBound,node.bound);continue;}
    const i=order[node.depth],used=new Set(node.assignment),children=[];
    for(let j=0;j<targets.length;j++) if(!used.has(j)&&Number.isFinite(costs[i][j])) {
      const assignment=[...node.assignment];assignment[i]=j;if(changeCount(assignment)>maxChanges){report.pruned++;continue;}const lower=bound(assignment);
      if(lower>=bestScore-TOL) report.pruned++;else children.push({assignment,depth:node.depth+1,bound:lower});
    }
    // Reverse push for deterministic best-bound-first siblings with depth-first memory.
    children.sort((a,b)=>b.bound-a.bound || b.assignment[i]-a.assignment[i]);stack.push(...children);
  }
  let frontier=Math.min(unknownBound,...stack.map(n=>n.bound));
  const exhausted=frontier>=bestScore-TOL && Number.isFinite(bestScore) || !stack.length && unknownBound===Infinity;
  report.status=exhausted?(best?'optimal':'infeasible'):(best?'feasible':'unknown');
  report.reason=exhausted?'Search exhausted or every open lower bound meets the incumbent within tolerance.':stack.length?'Node budget reached; unresolved branches remain.':'Rule evaluation was incomplete for a potentially better candidate.';
  report.lowerBound=Number.isFinite(Math.min(bestScore,frontier))?Math.min(bestScore,frontier):null;
  report.upperBound=Number.isFinite(bestScore)?bestScore:null;
  if(best) {report.absoluteGap=Math.max(0,bestScore-report.lowerBound);report.relativeGap=report.absoluteGap/Math.max(1,Math.abs(bestScore));report.changed=JSON.stringify(best.connections)!==JSON.stringify(project.connections);report.project=best;report.analysis=bestAnalysis;}
  return report;
}
