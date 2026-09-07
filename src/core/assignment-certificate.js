import { stableStringify } from './model.js';
import { sparseAssignmentProblem } from './sparse-problem.js';

/** No imports from mincost.js. Integer primal feasibility and nonnegative
 * residual reduced costs prove optimality for this explicitly supplied graph. */
export function checkIntegerMatching(rows,m,c) {
  const issues=[];const fail=message=>{if(issues.length<100)issues.push(message);};
  try {
    const n=rows.length,S=n+m,T=S+1;
    if(c.claim==='infeasible'){
      const left=c.hall?.sourceIndices,right=c.hall?.targetIndices;
      if(!Array.isArray(left)||!left.length||!Array.isArray(right)||new Set(left).size!==left.length||new Set(right).size!==right.length||left.some(i=>!Number.isInteger(i)||i<0||i>=n)||right.some(j=>!Number.isInteger(j)||j<0||j>=m))throw new Error('Invalid Hall sets.');
      const neighbours=new Set(left.flatMap(i=>rows[i].map(e=>e.j))),r=new Set(right);
      if(neighbours.size!==r.size||[...neighbours].some(j=>!r.has(j))||left.length<=right.length)throw new Error('Not a Hall-deficient source set.');
      return {ok:true,claim:'infeasible',deficiency:left.length-right.length,issues};
    }
    if(c.claim!=='optimal')throw new Error('A resource-limited result is not an optimality certificate.');
    const a=c.assignment,p=c.potentials,bound=Math.floor(Number.MAX_SAFE_INTEGER/8);
    if(!Array.isArray(a)||a.length!==n||new Set(a).size!==a.length||a.some(j=>!Number.isInteger(j)||j<0||j>=m))throw new Error('Invalid complete primal assignment.');
    if(!Array.isArray(p)||p.length!==n+m+2||p.some(v=>!Number.isSafeInteger(v)||Math.abs(v)>bound))throw new Error('Invalid safe-integer node potentials.');
    const used=new Set(a);let objective=0,checkedResidualArcs=0;
    const check=(u,v,cost)=>{checkedResidualArcs++;const value=cost+p[u]-p[v];if(!Number.isSafeInteger(value)||value<0)fail(`Negative or unsafe residual cost ${u}->${v}.`);};
    for(let i=0;i<n;i++){
      const chosen=rows[i].find(e=>e.j===a[i]);if(!chosen)throw new Error('Primal assignment uses a forbidden/missing arc.');objective+=chosen.cost;
      check(i,S,0);for(const e of rows[i])if(e.j===a[i])check(n+e.j,i,-e.cost);else check(i,n+e.j,e.cost);
    }
    for(let j=0;j<m;j++)if(used.has(j))check(T,n+j,0);else check(n+j,T,0);
    if(!Number.isSafeInteger(objective)||c.objectiveTicks!==objective)fail('Objective ticks do not match the complete matching.');
    return {ok:issues.length===0,claim:'optimal',objectiveTicks:objective,checkedResidualArcs,issues};
  }catch(e){fail(e.message);return {ok:false,issues};}
}

/** Reconstructs the COMPLETE candidate graph from the original project. Scope
 * tampering or omitted candidates cannot silently narrow an optimality claim. */
export function verifyAssignmentCertificate(project,certificate) {
  try {
    const c=certificate,scope=c?.scope;
    if(c?.type!=='openbumpplan-assignment-certificate'||c.schemaVersion!==1)throw new Error('Unsupported assignment certificate.');
    const pb=sparseAssignmentProblem(project,scope.fromKind,scope.toKind,{sourceIds:scope.sourceIds,quantum:scope.quantum,changePenalty:scope.changePenalty,maxEdges:1000000,maxCandidateChecks:20000000});
    if(stableStringify(scope)!==stableStringify(pb.scope)||c.problemSHA256!==pb.digest)throw new Error('Project, scope or candidate-graph digest mismatch.');
    const checked=checkIntegerMatching(pb.rows,pb.targets.length,c);
    return {...checked,scope:pb.scope,hardRulesChecked:false,claimScope:'Unary-compatible integer assignment graph only; coupled rules require a separate check.',
      ...(checked.claim==='optimal'?{objectiveUm:checked.objectiveTicks*scope.quantum,roundingErrorBoundUm:pb.sources.length*scope.quantum/2}:{})};
  }catch(e){return {ok:false,issues:[e.message]};}
}
