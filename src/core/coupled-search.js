import { sparseAssignmentProblem } from './sparse-problem.js';
import { minCostMatching } from './mincost.js';
import { verifyCoupledProof } from './coupled-proof.js';
import { analyze } from './rules.js';
import { clone, effectiveSignals, stableStringify } from './model.js';

/** Best-first assignment enumeration with a hard-constraint oracle. Unlike the
 * 12-source permutation search, each node solves a sparse assignment relaxation.
 * Worst case is still exponential. No universal performance claim is made. */
export function optimizeCoupledScalable(project,fromKind='pad',toKind='ball',options={}) {
  const {maxSubproblems=64,timeLimitMs=15000,...graphOptions}=options;
  if(!Number.isInteger(maxSubproblems)||maxSubproblems<1||maxSubproblems>128||!Number.isFinite(timeLimitMs)||timeLimitMs<1||timeLimitMs>60000)throw new Error('Invalid coupled-search resource limits.');
  const started=performance.now(),pb=sparseAssignmentProblem(project,fromKind,toKind,graphOptions),n=pb.sources.length,before=analyze(project);
  const queue=[{id:'root',prefix:[],excluded:[],bound:0}],records=[];let upper=Infinity,best=null,bestId=null,stopReason=null;
  const makeCertificate=raw=>({claim:raw.status,...(raw.status==='optimal'?{assignment:raw.assignment,objectiveTicks:raw.objectiveTicks,potentials:raw.potentials}:{hall:raw.hall})});
  while(queue.length){
    queue.sort((a,b)=>a.bound-b.bound||a.id.length-b.id.length||(a.id<b.id?-1:1));
    if(queue[0].bound>=upper)break;
    if(records.length>=maxSubproblems||pb.edgeCount*(records.length+1)>20000000){stopReason='subproblem-limit';break;}
    if(performance.now()-started>=timeLimitMs){stopReason='time-limit';break;}
    const node=queue.shift(),fixed=new Set(node.prefix),banned=new Set(node.excluded.map(([i,j])=>`${i}:${j}`));
    const rows=pb.rows.map((row,i)=>row.filter(e=>(i<node.prefix.length?e.j===node.prefix[i]:!fixed.has(e.j))&&!banned.has(`${i}:${e.j}`)));
    const raw=minCostMatching(rows,pb.targets.length,{timeLimitMs:Math.max(1,timeLimitMs-(performance.now()-started))});
    if(raw.status==='unknown'){queue.push(node);stopReason=raw.stopReason;break;}
    records.push({id:node.id,certificate:makeCertificate(raw)});
    if(raw.status==='infeasible')continue;
    const candidate=pb.materialize(raw.assignment),a=analyze(candidate),ctx=effectiveSignals(candidate);
    const locks=project.ports.filter(p=>p.locked).every(p=>stableStringify(ctx.signals.get(p.id))===stableStringify(pb.ctx.signals.get(p.id)));
    if(!a.complete||a.detailsTruncated){queue.push({...node,bound:raw.objectiveTicks});stopReason='analysis-incomplete';break;}
    if(!a.errors&&locks){if(raw.objectiveTicks<upper){upper=raw.objectiveTicks;best=candidate;bestId=node.id;}continue;}
    if(queue.length+n-node.prefix.length>20000){
      // Do not exclude an unexpanded assignment when resources are insufficient.
      records.pop();queue.push(node);stopReason='frontier-limit';break;
    }
    for(let i=node.prefix.length;i<n;i++)if(rows[i].length>1)queue.push({id:`${node.id}/${i}`,prefix:raw.assignment.slice(0,i),excluded:[...node.excluded,[i,raw.assignment[i]]],bound:raw.objectiveTicks});
  }
  const lower=Math.min(upper,...queue.map(n=>n.bound)),feasible=!!best;
  const claim=feasible&&lower>=upper&&stopReason!=='analysis-incomplete'?'optimal':feasible?'feasible':queue.length?'unknown':'infeasible';
  const proof={type:'openbumpplan-coupled-proof',schemaVersion:1,scope:pb.scope,problemSHA256:pb.digest,claim,bestNodeId:bestId,records};
  const verification=verifyCoupledProof(project,proof);if(!verification.ok)throw new Error(`Coupled proof replay failed: ${verification.issues.join('; ')}`);
  const changed=feasible&&pb.sources.some(s=>pb.original.get(s.id)[0]?.to!==best.connections.find(e=>e.from===s.id)?.to);
  return {status:claim==='optimal'?'certified-coupled-optimal':claim,feasible,changed,project:best||clone(project),before,after:best?analyze(best):before,scope:pb.scope,proof,verification,stopReason,
    objectiveTicks:feasible?upper:null,objectiveUm:feasible?upper*pb.scope.quantum:null,lowerBoundTicks:Number.isFinite(lower)?lower:null,gapTicks:feasible?upper-lower:null,
    edgeCount:pb.edgeCount,stats:{subproblems:records.length,frontierNodes:queue.length},elapsedMs:performance.now()-started,
    message:claim==='optimal'?'Coupled hard-rule optimum for the declared integer L1/ECO objective is certified by independently replayed bounds, constraint rechecks and complete prefix partitions. Not crossing-score or manufacturing signoff.':
      claim==='infeasible'?'Exhaustive prefix-partition proof found no mapping satisfying the configured hard rules in this scope.':`Search stopped (${stopReason||'budget'}); ${feasible?'a checked incumbent is available with a certified bound, not proven optimal':'no feasible mapping is known; this is not proof of infeasibility'}.`};
}
