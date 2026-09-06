import { routeNegotiated } from './routing.js';
import { normalizeTechnology, verifyCopper } from './copper.js';

/** The search deliberately uses a conservative inflated grid; the gate then
 * computes continuous distances without using that grid's obstacle rasterizer. */
export function routePhysical(project,fromKind='pad',toKind='ball',options={}) {
  const tech=normalizeTechnology(options.technology);
  const clearance=tech.clearance+Math.max(tech.traceWidth,tech.viaDiameter,tech.padDiameter);
  const result=routeNegotiated(project,fromKind,toKind,{...options,clearance});
  const copperVerification=verifyCopper(project,result,tech);
  const verified=result.verified&&copperVerification.ok;
  return {...result,technology:tech,copperVerification,verified,status:verified?'routed-physical':result.status==='routed'?'physical-check-failed':result.status,
    message:verified?'Both the grid witness and independent continuous copper geometry checks pass for the declared technology. This is not foundry or electrical signoff.':'No fully checked copper witness was found. Review grid/physical findings; constraints were NOT weakened.'};
}
