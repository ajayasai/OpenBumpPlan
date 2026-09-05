/** SHA-256 binds results to exact input documents; it does NOT identify a signer.
 * Replay checks claims with the declared deterministic engine. This is not a
 * formal independent proof, a trusted timestamp, or an authorization workflow.
 */
import { VERSION, assertProject, clone, stableStringify } from './model.js';
import { EXACT_VERSION, solveExactStage } from './exact.js';
import { ROUTING_VERSION, routeStage, checkRoutes } from './routing.js';
export async function sha256JSON(value) {
  // Never hash lossy NaN/Infinity/undefined JSON as though it were a valid result.
  function check(v,depth=0) {
    if(depth>100)throw new Error('Evidence JSON nesting limit exceeded.');
    if(v===null||typeof v==='string'||typeof v==='boolean')return;
    if(typeof v==='number'&&Number.isFinite(v))return;
    if(Array.isArray(v)){v.forEach(x=>check(x,depth+1));return;}
    if(v&&typeof v==='object'&&(Object.getPrototypeOf(v)===Object.prototype||Object.getPrototypeOf(v)===null)){Object.values(v).forEach(x=>check(x,depth+1));return;}
    throw new Error('Evidence requires finite, plain JSON values.');
  }
  check(value);
  if(!globalThis.crypto?.subtle) throw new Error('SHA-256 evidence requires Web Crypto. Use localhost, HTTPS, a supported local-file browser, or the Node CLI.');
  const bytes=new TextEncoder().encode(stableStringify(value));
  if(bytes.length>25000000)throw new Error('Evidence document exceeds 25 MB.');
  const digest=await globalThis.crypto.subtle.digest('SHA-256',bytes);
  return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('');
}
export async function createEvidence(project,kind,result) {
  assertProject(project);
  if(!['exact','routing'].includes(kind))throw new Error('Evidence kind must be exact or routing.');
  if(result?.algorithm!==(kind==='exact'?EXACT_VERSION:ROUTING_VERSION))throw new Error('Unsupported result algorithm.');
  const body={schema:'openbumpplan-evidence/1',engineVersion:VERSION,kind,projectSHA256:await sha256JSON(project),resultSHA256:await sha256JSON(result),result:clone(result)};
  return {...body,envelopeSHA256:await sha256JSON(body)};
}
export async function verifyEvidence(project,envelope,limits={}) {
  assertProject(project);
  const fail=reason=>({valid:false,planningPass:false,reason});
  if(!envelope||envelope.schema!=='openbumpplan-evidence/1'||!['exact','routing'].includes(envelope.kind))return fail('Unsupported evidence schema.');
  if(envelope.engineVersion!==VERSION)return fail('Engine version mismatch: replay with the recorded version.');
  const {envelopeSHA256,...body}=envelope;
  if(await sha256JSON(body)!==envelopeSHA256)return fail('Evidence envelope checksum mismatch.');
  if(await sha256JSON(project)!==envelope.projectSHA256)return fail('Stale evidence: input project/revision differs.');
  const r=envelope.result;
  if(await sha256JSON(r)!==envelope.resultSHA256)return fail('Result checksum mismatch.');
  let replay;
  if(envelope.kind==='exact') {
    if(r.algorithm!==EXACT_VERSION)return fail('Unsupported exact engine.');
    const cap=limits.maxReplayNodes??20000;
    if(!Number.isInteger(cap)||cap<1||cap>200000)throw new Error('Invalid replay node limit.');
    if(!r.options||r.options.nodeLimit>cap)return fail(`Replay budget exceeds the authorized ${cap} nodes.`);
    replay=solveExactStage(project,r.from,r.to,r.options);
  } else {
    if(r.algorithm!==ROUTING_VERSION)return fail('Unsupported routing engine.');
    const cap=limits.maxReplayExpanded??200000;
    if(!Number.isInteger(cap)||cap<1||cap>2000000)throw new Error('Invalid replay expansion limit.');
    if(!r.config||r.config.maxExpanded>cap)return fail(`Replay budget exceeds the authorized ${cap} grid expansions.`);
    replay=routeStage(project,r.from,r.to,r.config);
    // Geometric replay is also checked by a path validator independent of A*.
    const checked=checkRoutes(project,r.from,r.to,r.config,r.routes);
    if(await sha256JSON(checked)!==await sha256JSON(r.check))return fail('Supplied routing check does not match independently checked geometry.');
  }
  if(await sha256JSON(replay)!==envelope.resultSHA256)return fail('Deterministic replay disagrees with the supplied result.');
  return {valid:true,planningPass:envelope.kind==='exact'?Boolean(replay.project&&replay.analysis?.complete&&!replay.analysis.errors):replay.status==='routed',
    status:replay.status,assurance:'SHA-256 document binding and deterministic replay; not a digital signature or fabrication signoff'};
}
