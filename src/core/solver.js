import { assertProject, clone, effectiveSignals, worldPoint, rank, stableStringify } from './model.js';
import { analyze, blockedPosition } from './rules.js';
import { manhattan, EPS } from './geometry.js';
import { hungarian } from './optimizer.js';

/** Stage-local coupled search. Other stages, physical placement, and locked mappings
 * are immutable. All reported optima are for this finite scope and numeric model. */
export function assignmentProblem(project, fromKind, toKind, options = {}) {
  assertProject(project);
  if (!project.rules.allowedStagePairs.some(([a,b]) => a === fromKind && b === toKind) || rank(fromKind) >= rank(toKind)) {
    throw new Error('Select an allowed forward stage.');
  }
  const ctx = effectiveSignals(project);
  const stage = project.connections.filter(e => ctx.ports.get(e.from).kind === fromKind && ctx.ports.get(e.to).kind === toKind);
  const fixed = new Set(stage.filter(e => e.locked || ctx.ports.get(e.from).locked || ctx.ports.get(e.to).locked).flatMap(e => [e.from,e.to]));
  let sources = project.ports.filter(n => n.kind === fromKind && !n.locked && !fixed.has(n.id) && !['reserved','nc'].includes(n.role) &&
    ctx.signals.get(n.id).net && !(ctx.outgoing.get(n.id) || []).some(e => ctx.ports.get(e.to).kind !== toKind));
  if (options.sourceIds !== undefined) {
    if (!Array.isArray(options.sourceIds) || new Set(options.sourceIds).size !== options.sourceIds.length || options.sourceIds.some(x => !sources.some(s => s.id === x))) {
      throw new Error('sourceIds must be distinct, eligible unlocked source IDs in this stage.');
    }
    sources = sources.filter(s => options.sourceIds.includes(s.id));
  }
  sources.sort((a,b) => a.id.localeCompare(b.id));
  const sourceSet = new Set(sources.map(s => s.id));
  const targets = project.ports.filter(n => n.kind === toKind && !n.locked && !fixed.has(n.id) && !['reserved','nc'].includes(n.role) &&
    !(ctx.incoming.get(n.id) || []).some(e => !sourceSet.has(e.from))).sort((a,b) => a.id.localeCompare(b.id));
  if (sources.length > 12 || targets.length > 64) throw new Error("Exact search supports at most 12 movable sources and 64 candidate targets. Set sourceIds for an ECO window.");
  const retained = project.connections.filter(e => !sourceSet.has(e.from));
  const original = new Map(sources.map(s => [s.id, stage.filter(e => e.from === s.id)]));
  if ([...original.values()].some(edges => edges.length > 1)) throw new Error('Repair multiple outgoing assignments before exact optimization.');
  const penalty = options.changePenalty ?? 0;
  if (!Number.isFinite(penalty) || penalty < 0 || penalty > 1e9) throw new Error('changePenalty must be finite and in [0, 1e9].');
  const cost = sources.map(s => targets.map(t => {
    const signal = ctx.signals.get(s.id), length = manhattan(worldPoint(s,ctx), worldPoint(t,ctx));
    // Only NECESSARY conditions: do not exclude feasible target-specified roles or pairs.
    if (t.net && signal.net && t.net !== signal.net || t.domain && signal.domain && t.domain !== signal.domain ||
        t.role !== 'any' && signal.role !== 'any' && t.role !== signal.role ||
        t.pair && signal.pair && t.pair !== signal.pair || t.polarity && signal.polarity && t.polarity !== signal.polarity ||
        blockedPosition(t,project,ctx).length || length > project.rules.maxLength + EPS) return Infinity;
    return length + (original.get(s.id)[0]?.to === t.id ? 0 : penalty);
  }));
  const constantLength = retained.reduce((sum,e) => sum + manhattan(worldPoint(ctx.ports.get(e.from),ctx),worldPoint(ctx.ports.get(e.to),ctx)),0);
  function materialize(assignment) {
    const p = clone(project); p.connections = clone(retained);
    const ids = new Set(p.connections.map(e => e.id));
    for (let i = 0; i < sources.length; i++) {
      const old = original.get(sources[i].id)[0];
      let id = old?.id || `exact:${sources[i].id}`, suffix = 1;
      while (ids.has(id)) id = `exact:${sources[i].id}:${suffix++}`;
      ids.add(id);
      p.connections.push({id, from:sources[i].id, to:targets[assignment[i]].id, net:old?.net || '', locked:false});
    }
    return p;
  }
  return {sources, targets, cost, ctx, retained, original, constantLength, materialize, penalty};
}

/** Maximum matching plus a Hall-deficient source set: independently checkable
 * necessary-condition infeasibility, not a generic 'solver failed' explanation. */
export function hallConflict(cost) {
  const n = cost.length, m = cost[0]?.length || 0;
  if (cost.some(row => row.length !== m)) throw new Error('Ragged cost matrix.');
  const owner = new Array(m).fill(-1), match = new Array(n).fill(-1);
  function augment(i, seen) {
    for (let j = 0; j < m; j++) if (Number.isFinite(cost[i][j]) && !seen.has(j)) {
      seen.add(j);
      if (owner[j] < 0 || augment(owner[j],seen)) {owner[j] = i; match[i] = j; return true;}
    }
    return false;
  }
  for (let i = 0; i < n; i++) augment(i,new Set());
  if (match.every(j => j >= 0)) return null;
  const left = new Set(), right = new Set(), queue = [];
  for (let i = 0; i < n; i++) if (match[i] < 0) {left.add(i); queue.push(i);}
  for (let k = 0; k < queue.length; k++) for (let j = 0; j < m; j++) {
    if (!Number.isFinite(cost[queue[k]][j]) || right.has(j)) continue;
    right.add(j);
    if (owner[j] >= 0 && !left.has(owner[j])) {left.add(owner[j]); queue.push(owner[j]);}
  }
  return {sources:[...left].sort((a,b)=>a-b), targets:[...right].sort((a,b)=>a-b), deficiency:left.size-right.size};
}

function lockedSignalsPreserved(problem, candidate) {
  const ctx = effectiveSignals(candidate);
  return candidate.ports.filter(n => n.locked).every(n => stableStringify(ctx.signals.get(n.id)) === stableStringify(problem.ctx.signals.get(n.id)));
}

export function optimizeExact(project, fromKind = 'pad', toKind = 'ball', options = {}) {
  const {maxNodes = 50000, timeLimitMs = 5000, maxChanges = Infinity} = options;
  if (!Number.isInteger(maxNodes) || maxNodes < 1 || maxNodes > 1000000 || !Number.isFinite(timeLimitMs) || timeLimitMs < 1 || timeLimitMs > 60000 ||
      maxChanges !== Infinity && (!Number.isInteger(maxChanges) || maxChanges < 0)) throw new Error('Invalid exact-search limits.');
  const pb = assignmentProblem(project,fromKind,toKind,options);
  if (pb.sources.length > 12 || pb.targets.length > 64) throw new Error('Exact search supports at most 12 movable sources and 64 candidate targets. Set sourceIds for an ECO window.');
  const before = analyze(project), started = performance.now();
  const scope = {fromKind,toKind,sourceIds:pb.sources.map(s=>s.id),targetIds:pb.targets.map(t=>t.id),fixedConnections:pb.retained.length,
    objective:'full-project L1 + crossingWeight * crossings + changePenalty * changed-source-targets',changePenalty:pb.penalty,maxChanges:Number.isFinite(maxChanges)?maxChanges:null};
  const stats = {nodes:0,leaves:0,pruned:0,ruleRejected:0};
  const base = {scope,before,stats};
  const early = (status,message,extra={}) => ({...base,status,message,project:clone(project),after:before,changed:false,searchComplete:false,feasible:false,lowerBound:null,objective:null,gap:null,...extra});
  if (!before.complete || before.detailsTruncated) return early('unchecked','Input analysis is incomplete; exact search was not started.');
  if (!pb.sources.length) return early('no-op','No movable sources in this scope.',{feasible:before.errors===0});
  const conflict = hallConflict(pb.cost);
  if (conflict) return early('infeasible','A Hall-deficient source set has fewer compatible targets than required.',{
    searchComplete:true,conflict:{type:'HALL_DEFICIENCY',sourceIds:conflict.sources.map(i=>pb.sources[i].id),targetIds:conflict.targets.map(j=>pb.targets[j].id),deficiency:conflict.deficiency}});
  const rootMatch = hungarian(pb.cost);
  const rootBound = pb.constantLength + rootMatch.reduce((sum,j,i)=>sum+pb.cost[i][j],0);
  let incumbent = null, incumbentAnalysis = null, upper = Infinity, bestChanges = 0, stop = '';
  const assignments = new Array(pb.sources.length).fill(-1), used = new Set();
  const order = pb.sources.map((_,i)=>i).sort((a,b)=>pb.cost[a].filter(Number.isFinite).length-pb.cost[b].filter(Number.isFinite).length || a-b);
  function inspect(candidate, changes) {
    const a = analyze(candidate);
    if (!a.complete || a.detailsTruncated) {stop = 'analysis-budget'; return;}
    if (a.errors || !lockedSignalsPreserved(pb,candidate)) {stats.ruleRejected++; return;}
    const score = a.metrics.score + changes * pb.penalty;
    if (score < upper) {incumbent = candidate; incumbentAnalysis = a; upper = score; bestChanges = changes;}
  }
  // The existing design is an incumbent only when it belongs to the searched space.
  const current = pb.sources.map(s=>pb.targets.findIndex(t=>t.id===pb.original.get(s.id)[0]?.to));
  if (current.every((j,i)=>j>=0&&Number.isFinite(pb.cost[i][j])) && new Set(current).size === current.length) inspect(pb.materialize(current),0);
  function visit(depth, accumulated, changes) {
    if (stop) return;
    if (stats.nodes >= maxNodes) {stop = 'node-limit'; return;}
    if (performance.now()-started >= timeLimitMs) {stop = 'time-limit'; return;}
    stats.nodes++;
    if (changes > maxChanges) {stats.pruned++; return;}
    if (depth === order.length) {stats.leaves++; inspect(pb.materialize(assignments),changes); return;}
    const rows = order.slice(depth), columns = pb.targets.map((_,j)=>j).filter(j=>!used.has(j));
    const matrix = rows.map(i=>columns.map(j=>pb.cost[i][j])), matching = hungarian(matrix);
    if (!matching) {stats.pruned++; return;}
    const bound = pb.constantLength + accumulated + matching.reduce((sum,j,k)=>sum+matrix[k][j],0);
    // Conservative roundoff margin. This is an exhaustive floating-point-model result,
    // not an exact-arithmetic or manufacturing certificate.
    const slack = Number.EPSILON * 128 * Math.max(1,Math.abs(bound),Number.isFinite(upper)?Math.abs(upper):1);
    if (bound > upper + slack) {stats.pruned++; return;}
    const i = order[depth];
    const candidates = columns.filter(j=>Number.isFinite(pb.cost[i][j])).sort((a,b)=>pb.cost[i][a]-pb.cost[i][b] || a-b);
    for (const j of candidates) {
      const delta = pb.original.get(pb.sources[i].id)[0]?.to === pb.targets[j].id ? 0 : 1;
      assignments[i] = j; used.add(j); visit(depth+1,accumulated+pb.cost[i][j],changes+delta); used.delete(j);
      if (stop) break;
    }
  }
  visit(0,0,0);
  const complete = !stop, feasible = Boolean(incumbent), status = complete ? feasible?'optimal':'infeasible' : feasible?'feasible':'unknown';
  const lower = complete && feasible ? upper : rootBound;
  const changed = feasible && pb.sources.some(s=>pb.original.get(s.id)[0]?.to!==incumbent.connections.find(e=>e.from===s.id)?.to);
  return {...base,status,searchComplete:complete,feasible,stopReason:stop||null,elapsedMs:performance.now()-started,
    project:incumbent||clone(project),after:incumbentAnalysis||before,changed,changes:bestChanges,objective:feasible?upper:null,
    lowerBound:lower,gap:feasible?Math.max(0,upper-lower):null,
    message:complete?(feasible?'Exhaustive stage-local optimum under all configured hard rules and stated ECO limits.':'Exhaustive stage-local search found no mapping passing every hard rule.'):
      `Search stopped (${stop}); ${feasible?'a checked feasible incumbent is available, but optimality is not proved':'no feasible result is known; this is not proof of infeasibility'}.`};
}
