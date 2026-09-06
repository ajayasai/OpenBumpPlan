import { VERSION, clone, normalizeProject, stableStringify } from './model.js';
import { analyze } from './rules.js';
import { verifyRoutes } from './routing.js';
import { verifyCopper, normalizeTechnology } from './copper.js';
import { sha256Bytes } from './hash.js';

export async function sha256(value) {
  const bytes = new TextEncoder().encode(typeof value === 'string' ? value : stableStringify(value));
  if(!globalThis.crypto?.subtle)return sha256Bytes(bytes);
  return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
}
export async function projectSHA256(project) { return sha256(normalizeProject(project)); }

/** Self-contained, content-bound review evidence. Unkeyed hashes detect accidental
 * corruption, not malicious replacement. Use an externally trusted signing key for authenticity. */
export async function createReviewBundle(project, {routing = null} = {}) {
  const p = normalizeProject(project), validation = analyze(p);
  let routingVerification = null;
  if (routing) {
    routingVerification = verifyRoutes(p,routing);
    if (!routingVerification.ok) throw new Error('Cannot approve stale, partial or invalid routing evidence. Export it separately as a diagnostic.');
  }
  const copperVerification=routing?.technology?verifyCopper(p,routing,routing.technology):null;
  if(copperVerification&&!copperVerification.ok)throw new Error('Cannot approve invalid continuous copper evidence.');
  const payload = {project:p,validation,routing:routing?clone(routing):null,routingVerification,copperVerification};
  const digests = {};
  for (const [key,value] of Object.entries(payload)) digests[key] = await sha256(value);
  const manifest = {type:'openbumpplan-review',schemaVersion:1,engineVersion:VERSION,digestAlgorithm:'SHA-256',digests,
    planningPass:validation.complete&&!validation.detailsTruncated&&validation.errors===0,
    warningCount:validation.warnings,routingPass:routing?true:null,copperPass:copperVerification?true:null,
    scope:'Configured geometric planning rules and optional conservative routing-grid witness; NOT SI/PI/thermal or manufacturing signoff.'};
  return {manifest,payload,manifestSHA256:await sha256(manifest)};
}

/** Recomputes all findings and route checks. Stored 'pass' flags are not authority.
 * Require a separately supplied expected project digest when checking another design. */
export async function verifyReviewBundle(bundle, {expectedProjectSHA256 = null, expectedTechnology = null} = {}) {
  const errors = [];
  try {
    if (!bundle || bundle.manifest?.type !== 'openbumpplan-review' || bundle.manifest.schemaVersion !== 1 || bundle.manifest.digestAlgorithm !== 'SHA-256') throw new Error('Unsupported evidence bundle.');
    if (bundle.manifest.engineVersion !== VERSION) throw new Error(`Engine version mismatch. Recompute with ${bundle.manifest.engineVersion}, or create a new review using ${VERSION}.`);
    const expected = ['copperVerification','project','routing','routingVerification','validation'];
    if (!bundle.payload || stableStringify(Object.keys(bundle.payload).sort()) !== stableStringify(expected) || stableStringify(Object.keys(bundle.manifest.digests||{}).sort()) !== stableStringify(expected)) throw new Error('Unexpected/missing evidence payload members.');
    for (const key of expected) if (await sha256(bundle.payload[key]) !== bundle.manifest.digests[key]) errors.push(`Digest mismatch: ${key}.`);
    if (await sha256(bundle.manifest) !== bundle.manifestSHA256) errors.push('Manifest digest mismatch.');
    if (expectedProjectSHA256 && expectedProjectSHA256 !== await projectSHA256(bundle.payload.project)) errors.push('Evidence is stale or belongs to a different expected project.');
    if(expectedTechnology&&stableStringify(normalizeTechnology(expectedTechnology))!==stableStringify(bundle.payload.routing?.technology))errors.push('Evidence technology differs from the independently expected technology.');
    const fresh = await createReviewBundle(bundle.payload.project,{routing:bundle.payload.routing});
    if (stableStringify(fresh.manifest) !== stableStringify(bundle.manifest)) errors.push('Manifest claims disagree with recomputed evidence.');
    if (stableStringify(fresh.payload.validation) !== stableStringify(bundle.payload.validation)) errors.push('Validation findings do not match an independent rerun.');
    if (stableStringify(fresh.payload.routingVerification) !== stableStringify(bundle.payload.routingVerification)) errors.push('Routing findings do not match an independent witness check.');
    if(stableStringify(fresh.payload.copperVerification)!==stableStringify(bundle.payload.copperVerification))errors.push('Continuous copper findings differ from independent recheck.');
    return {valid:errors.length===0,copperPass:errors.length===0?fresh.manifest.copperPass:false,planningPass:errors.length===0&&fresh.manifest.planningPass,
      routingPass:errors.length===0?fresh.manifest.routingPass:false,warnings:fresh.manifest.warningCount,errors,
      authenticity:'Not authenticated by this hash-only check. A trusted external public key is required for a signature check.'};
  } catch(error) {errors.push(error.message);return {valid:false,planningPass:false,routingPass:false,copperPass:false,errors};}
}
