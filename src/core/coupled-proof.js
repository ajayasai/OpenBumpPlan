import { sparseAssignmentProblem } from './sparse-problem.js';
import { checkIntegerMatching } from './assignment-certificate.js';
import { analyze } from './rules.js';
import { effectiveSignals, stableStringify } from './model.js';

/** Proof replay, without invoking an optimization solver. Every relaxed optimum
 * or Hall deficiency is verified. Every excluded complete mapping is rechecked
 * against the actual rule engine. Prefix partitions cover ALL other mappings. */
export function verifyCoupledProof(project,proof) {
  try {
    if(proof?.type!=='openbumpplan-coupled-proof'||proof.schemaVersion!==1||!Array.isArray(proof.records)||proof.records.length>128)throw new Error('Unsupported or oversized coupled proof.');
    const s=proof.scope,pb=sparseAssignmentProblem(project,s.fromKind,s.toKind,{sourceIds:s.sourceIds,quantum:s.quantum,changePenalty:s.changePenalty,maxEdges:1000000,maxCandidateChecks:20000000});
    if(proof.problemSHA256!==pb.digest||stableStringify(s)!==stableStringify(pb.scope))throw new Error('Coupled proof input or scope mismatch.');
    if(pb.edgeCount*Math.max(1,proof.records.length)>20000000)throw new Error('Coupled proof work budget exceeded.');
    const frontier=new Map([['root',{prefix:[],excluded:[],bound:0}]]),n=pb.sources.length;
    let upper=Infinity,bestId=null,bestAssignment=null,unresolved=false,processed=0;
    for(const record of proof.records){
      processed++;
      const node=frontier.get(record.id);if(!node)throw new Error('Proof references an absent, duplicate, or fabricated search node.');frontier.delete(record.id);
      const used=new Set(node.prefix),banned=new Set(node.excluded.map(([i,j])=>`${i}:${j}`));
      const rows=pb.rows.map((row,i)=>row.filter(e=>(i<node.prefix.length?e.j===node.prefix[i]:!used.has(e.j))&&!banned.has(`${i}:${e.j}`)));
      const checked=checkIntegerMatching(rows,pb.targets.length,record.certificate);if(!checked.ok)throw new Error(`Invalid subproblem certificate: ${checked.issues.join('; ')}`);
      if(checked.claim==='infeasible')continue;
      const c=record.certificate;if(c.objectiveTicks<node.bound)throw new Error('Child lower bound decreases below its proved parent bound.');
      const candidate=pb.materialize(c.assignment),a=analyze(candidate),ctx=effectiveSignals(candidate);
      const locks=project.ports.filter(p=>p.locked).every(p=>stableStringify(ctx.signals.get(p.id))===stableStringify(pb.ctx.signals.get(p.id)));
      if(!a.complete||a.detailsTruncated){frontier.set(record.id,{...node,bound:c.objectiveTicks});unresolved=true;break;}
      if(a.errors===0&&locks){if(c.objectiveTicks<upper){upper=c.objectiveTicks;bestId=record.id;bestAssignment=c.assignment;}continue;}
      // Independent reconstruction of a disjoint prefix partition. Do not trust
      // a producer-supplied children list or its claim of exhaustive coverage.
      if(frontier.size+n-node.prefix.length>20000)throw new Error('Proof frontier limit exceeded.');
      for(let i=node.prefix.length;i<n;i++)if(rows[i].length>1)frontier.set(`${record.id}/${i}`,{prefix:c.assignment.slice(0,i),excluded:[...node.excluded,[i,c.assignment[i]]],bound:c.objectiveTicks});
    }
    if(processed!==proof.records.length)throw new Error('Records appended after incomplete analysis.');
    const lower=Math.min(upper,...[...frontier.values()].map(node=>node.bound));
    const feasible=Number.isFinite(upper),optimal=feasible&&lower>=upper&&!unresolved;
    const claim=optimal?'optimal':feasible?'feasible':frontier.size?'unknown':'infeasible';
    if(proof.claim!==claim||proof.bestNodeId!==bestId)throw new Error('Claimed proof status or incumbent does not follow from verified coverage.');
    return {ok:true,claim,feasible,objectiveTicks:feasible?upper:null,lowerBoundTicks:Number.isFinite(lower)?lower:null,gapTicks:feasible?upper-lower:null,
      bestAssignment,checkedSubproblems:proof.records.length,frontierNodes:frontier.size,scope:pb.scope,issues:[]};
  }catch(e){return {ok:false,issues:[e.message]};}
}
