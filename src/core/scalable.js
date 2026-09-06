import { sparseAssignmentProblem } from './sparse-problem.js';
import { minCostMatching } from './mincost.js';
import { verifyAssignmentCertificate } from './assignment-certificate.js';
import { analyze } from './rules.js';
import { clone, effectiveSignals, stableStringify } from './model.js';

export function optimizeScalable(project,fromKind='pad',toKind='ball',options={}) {
  const started=performance.now(),pb=sparseAssignmentProblem(project,fromKind,toKind,options),before=analyze(project);
  const raw=minCostMatching(pb.rows,pb.targets.length,options);
  const base={before,after:before,project:clone(project),scope:pb.scope,feasible:false,changed:false,edgeCount:pb.edgeCount,candidateChecks:pb.candidateChecks,stats:{flow:raw.flow,relaxations:raw.relaxations},certificate:null};
  if(raw.status==='unknown')return {...base,status:'unknown',stopReason:raw.stopReason,elapsedMs:performance.now()-started,message:'Resource limit reached. Partial assignments were NOT applied; infeasibility and optimality are unknown.'};
  const certificate={type:'openbumpplan-assignment-certificate',schemaVersion:1,scope:pb.scope,problemSHA256:pb.digest,claim:raw.status,...(raw.status==='optimal'?{assignment:raw.assignment,potentials:raw.potentials,objectiveTicks:raw.objectiveTicks}:{hall:raw.hall})};
  const verification=verifyAssignmentCertificate(project,certificate);
  if(!verification.ok)throw new Error(`Assignment certificate failed independent verification: ${verification.issues.join('; ')}`);
  if(raw.status==='infeasible')return {...base,status:'infeasible',certificate,verification,elapsedMs:performance.now()-started,message:'Verified Hall deficiency: this source scope has too few compatible targets. No mapping was applied.'};
  const candidate=pb.materialize(raw.assignment),after=analyze(candidate),ctx=effectiveSignals(candidate);
  const locksPreserved=project.ports.filter(n=>n.locked).every(n=>stableStringify(pb.ctx.signals.get(n.id))===stableStringify(ctx.signals.get(n.id)));
  const feasible=after.complete&&!after.detailsTruncated&&after.errors===0&&locksPreserved;
  const changed=pb.sources.some((s,i)=>pb.original.get(s.id)[0]?.to!==pb.targets[raw.assignment[i]].id);
  return {...base,status:feasible?'certified-optimal':'coupled-constraints-rejected',certificate,verification,feasible,changed:feasible&&changed,
    project:feasible?candidate:clone(project),after:feasible?after:before,candidateAnalysis:after,locksPreserved,
    objectiveTicks:raw.objectiveTicks,objectiveUm:raw.objectiveTicks*pb.scope.quantum,roundingErrorBoundUm:pb.sources.length*pb.scope.quantum/2,
    elapsedMs:performance.now()-started,
    message:feasible?'Integer assignment optimum independently certified and all configured hard rules rechecked. Objective is stage L1 + ECO penalty, NOT the crossing-weighted score or manufacturing signoff.':'The certified relaxed assignment violates coupled hard constraints or changes a locked downstream signal. It was NOT applied. Use coupled ECO search; this does not prove hard-constrained infeasibility.'};
}
