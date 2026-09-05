import { clone, effectiveSignals, worldPoint, assertProject, rank } from './model.js';
import { analyze, compatible, regressionCheck } from './rules.js';
import { manhattan } from './geometry.js';
/** Rectangular Hungarian algorithm; null means no full finite assignment exists. */
export function hungarian(cost) {
  const n=cost.length;if(!n)return [];
  const m=cost[0].length;if(m<n || !m || cost.some(row=>row.length!==m))return null;
  if(cost.some(row=>row.some(v=>typeof v!=='number' || Number.isNaN(v) || v===-Infinity)))throw new Error('Cost matrix contains invalid values.');
  const u=new Float64Array(n+1),v=new Float64Array(m+1),p=new Int32Array(m+1),way=new Int32Array(m+1);
  for(let i=1;i<=n;i++) {
    p[0]=i;let j0=0;const minv=new Float64Array(m+1).fill(Infinity),used=new Uint8Array(m+1);
    do {
      used[j0]=1;const i0=p[j0];let delta=Infinity,j1=0;
      for(let j=1;j<=m;j++)if(!used[j]) {const cur=cost[i0-1][j-1]-u[i0]-v[j];if(cur<minv[j]){minv[j]=cur;way[j]=j0;}if(minv[j]<delta){delta=minv[j];j1=j;}}
      if(!Number.isFinite(delta))return null;
      for(let j=0;j<=m;j++)if(used[j]){u[p[j]]+=delta;v[j]-=delta;}else minv[j]-=delta;
      j0=j1;
    }while(p[j0]!==0);
    do {const j1=way[j0];p[j0]=p[j1];j0=j1;}while(j0);
  }
  const assignment=new Array(n).fill(-1);for(let j=1;j<=m;j++)if(p[j])assignment[p[j]-1]=j-1;
  return assignment.some((j,i)=>j<0 || !Number.isFinite(cost[i][j]))?null:assignment;
}
/** Stage-level heuristic: pair placement + exact linear subproblem + guarded swaps.
 * Full coupled constraints are validated before acceptance. No global-optimality claim.
 */
export function optimizeStage(project,fromKind='pad',toKind='ball',options={}) {
  assertProject(project);
  if(!project.rules.allowedStagePairs.some(([a,b])=>a===fromKind&&b===toKind) || rank(fromKind)>=rank(toKind))throw new Error('Select an allowed forward stage.');
  const maxSources=options.maxSources??256,maxTargets=options.maxTargets??512,maxTrials=options.maxTrials??1500;
  if(!Number.isInteger(maxSources)||maxSources<1||maxSources>512||!Number.isInteger(maxTargets)||maxTargets<1||maxTargets>1024||!Number.isInteger(maxTrials)||maxTrials<0||maxTrials>20000)throw new Error('Invalid optimizer safety limits.');
  const ctx=effectiveSignals(project),before=analyze(project);
  if(!before.complete || before.detailsTruncated)return {project:clone(project),before,after:before,changed:false,status:'unchecked',message:'Input is not fully checked; increase the geometry budget or reduce the design.',trials:0};
  const stageEdges=project.connections.filter(e=>ctx.ports.get(e.from).kind===fromKind&&ctx.ports.get(e.to).kind===toKind);
  const fixed=new Set(stageEdges.filter(e=>e.locked||ctx.ports.get(e.from).locked||ctx.ports.get(e.to).locked).flatMap(e=>[e.from,e.to]));
  const sources=project.ports.filter(n=>n.kind===fromKind&&!n.locked&&!fixed.has(n.id)&&!['reserved','nc'].includes(n.role)&&ctx.signals.get(n.id).net&&
    !(ctx.outgoing.get(n.id)||[]).some(e=>ctx.ports.get(e.to).kind!==toKind)).sort((a,b)=>a.id.localeCompare(b.id));
  const sourceIds=new Set(sources.map(n=>n.id));
  const targets=project.ports.filter(n=>n.kind===toKind&&!n.locked&&!fixed.has(n.id)&&!['reserved','nc'].includes(n.role)&&
    !(ctx.incoming.get(n.id)||[]).some(e=>!sourceIds.has(e.from))).sort((a,b)=>a.id.localeCompare(b.id));
  if(sources.length>maxSources||targets.length>maxTargets)throw new Error(`Optimizer limit: ${maxSources} sources / ${maxTargets} targets. Selected ${sources.length}/${targets.length}. Split the stage or use smaller data.`);
  if(!sources.length)return {project:clone(project),before,after:before,changed:false,status:'no-op',message:'No unlocked, named sources in this stage.',trials:0};
  const cost=sources.map(s=>targets.map(t=>compatible(s,t,project,ctx)?manhattan(worldPoint(s,ctx),worldPoint(t,ctx)):Infinity));
  const assignment=new Map(),usedTargets=new Set(),pairMap=new Map();
  sources.forEach((s,i)=>{const signal=ctx.signals.get(s.id);if(signal.pair){if(!pairMap.has(signal.pair))pairMap.set(signal.pair,[]);pairMap.get(signal.pair).push(i);}});
  let constructionFailed=targets.length<sources.length;
  for(const [,indices]of [...pairMap].sort(([a],[b])=>a.localeCompare(b))) {
    // A locked mate is handled by full validation, not moved implicitly.
    if(indices.length!==2)continue;
    const [a,b]=indices;let best=null;
    for(let j=0;j<targets.length;j++)if(!usedTargets.has(j)&&Number.isFinite(cost[a][j]))for(let k=0;k<targets.length;k++) {
      if(j===k||usedTargets.has(k)||!Number.isFinite(cost[b][k]))continue;
      if(manhattan(worldPoint(targets[j],ctx),worldPoint(targets[k],ctx))>project.rules.pairMaxDistance+1e-8||Math.abs(cost[a][j]-cost[b][k])>project.rules.pairMaxSkew+1e-8)continue;
      const value=cost[a][j]+cost[b][k];if(!best||value<best.value)best={j,k,value};
    }
    if(!best){constructionFailed=true;break;}
    assignment.set(a,best.j);assignment.set(b,best.k);usedTargets.add(best.j);usedTargets.add(best.k);
  }
  const remaining=sources.map((_,i)=>i).filter(i=>!assignment.has(i)),free=targets.map((_,i)=>i).filter(i=>!usedTargets.has(i));
  if(!constructionFailed) {
    const result=hungarian(remaining.map(i=>free.map(j=>cost[i][j])));
    if(!result)constructionFailed=true;else result.forEach((j,k)=>assignment.set(remaining[k],free[j]));
  }
  let best=clone(project),bestAnalysis=before,reason='';
  const better = a => a.errors<bestAnalysis.errors || a.errors===bestAnalysis.errors && a.metrics.unassigned<bestAnalysis.metrics.unassigned || a.errors===bestAnalysis.errors && a.metrics.unassigned===bestAnalysis.metrics.unassigned && a.metrics.score<bestAnalysis.metrics.score-1e-8;
  if(!constructionFailed) {
    const candidate=clone(project);candidate.connections=candidate.connections.filter(e=>!sourceIds.has(e.from));
    for(const [i,j]of assignment) {
      const previous=stageEdges.find(e=>e.from===sources[i].id);
      let id=previous?.id || `auto:${sources[i].id}`,suffix=1;while(candidate.connections.some(e=>e.id===id))id=`auto:${sources[i].id}:${suffix++}`;
      candidate.connections.push({id,from:sources[i].id,to:targets[j].id,net:previous?.net || '',locked:false});
    }
    const candidateAnalysis=analyze(candidate),gate=regressionCheck(before,candidateAnalysis,{draft:false});
    if(gate.ok&&better(candidateAnalysis)){best=candidate;bestAnalysis=candidateAnalysis;}else reason=gate.ok?'Linear assignment did not improve the checked objective.':`Linear candidate rejected: ${gate.reason}`;
  }else reason='Pair/linear construction found no full assignment. This is not a proof of global infeasibility.';
  // Guarded pairwise exchanges; bounded and deterministic. Fixed sites are never touched.
  let trials=0,acceptedSwaps=0,changed=true;
  while(changed&&trials<maxTrials) {
    changed=false;
    const movable=best.connections.filter(e=>sourceIds.has(e.from)&&!e.locked&&!ctx.ports.get(e.to).locked&&!fixed.has(e.to));
    outer:for(let i=0;i<movable.length;i++)for(let j=i+1;j<movable.length;j++) {
      if(trials>=maxTrials)break outer;trials++;
      const a=movable[i],b=movable[j],aSource=ctx.ports.get(a.from),bSource=ctx.ports.get(b.from),aTarget=ctx.ports.get(a.to),bTarget=ctx.ports.get(b.to);
      if(!compatible(aSource,bTarget,best,ctx)||!compatible(bSource,aTarget,best,ctx))continue;
      const candidate=clone(best),ca=candidate.connections.find(e=>e.id===a.id),cb=candidate.connections.find(e=>e.id===b.id);[ca.to,cb.to]=[cb.to,ca.to];
      const score=analyze(candidate);
      if(!better(score)||!regressionCheck(bestAnalysis,score,{draft:false}).ok)continue;
      best=candidate;bestAnalysis=score;acceptedSwaps++;changed=true;break outer;
    }
  }
  const actualChanged=JSON.stringify(best.connections)!==JSON.stringify(project.connections);
  return {project:best,before,after:bestAnalysis,changed:actualChanged,status:actualChanged?'improved':'unchanged',trials,acceptedSwaps,
    message:actualChanged?`Accepted a fully checked stage mapping; ${acceptedSwaps} guarded swap(s). Heuristic, not a global optimum.`:(reason || 'No improving legal exchange found within the search budget.')};
}
