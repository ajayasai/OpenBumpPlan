import { normalizeProject, stableStringify } from './model.js';
import { analyze } from './rules.js';
import { objectDigest } from './terminal-interop.js';
import { identifier } from './sexpr.js';

function keys(value,allowed,label){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))throw new Error(`Invalid ${label} object/unknown field`);}
export function validateContract(raw) {
  keys(raw,['schema','name','coverage','nets','unassigned'],'connectivity contract');
  if(raw.schema!=='openbumpplan.connectivity-contract/v1'||!['all','listed'].includes(raw.coverage))throw new Error('Contract requires schema v1 and explicit all/listed coverage');
  identifier(raw.name,'contract name');
  if(!Array.isArray(raw.nets)||!raw.nets.length||raw.nets.length>10000||!Array.isArray(raw.unassigned)||raw.unassigned.length>10000)throw new Error('Invalid contract nets/unassigned arrays');
  const ports=new Set(),names=new Set();
  function pin(id){identifier(id,'contract port');if(ports.has(id))throw new Error(`Port occurs twice in contract: ${id}`);ports.add(id);if(ports.size>10000)throw new Error('Contract exceeds 10000-port budget');}
  for(const net of raw.nets){keys(net,['name','ports','domain'],'contract net');identifier(net.name,'net name');if(names.has(net.name))throw new Error('Duplicate contract net name');names.add(net.name);
    if(net.domain!==undefined)identifier(net.domain,'domain');
    if(!Array.isArray(net.ports)||!net.ports.length||net.ports.length>10000)throw new Error('Each contract net needs ports');net.ports.forEach(pin);
  }
  raw.unassigned.forEach(pin);return structuredClone(raw);
}
/** Independent intent verification. Undirected graph traversal over explicit
 * edges; equal labels do NOT imply connectivity. No first-parent propagation.
 * A contract must originate in separately reviewed design intent. */
export function verifyConnectivityContract(project,raw,{maxWork=250000}={}) {
  if(!Number.isSafeInteger(maxWork)||maxWork<1||maxWork>2000000)throw new Error('Invalid contract work budget');
  const p=normalizeProject(project),contract=validateContract(raw),issues=[],adj=new Map(p.ports.map(n=>[n.id,[]])),nodes=new Map(p.ports.map(n=>[n.id,n]));
  let work=0,issueCount=0;
  const step=()=>{if(++work>maxWork)throw new Error('WORK_LIMIT');};
  function issue(code,message,ports=[]){issueCount++;if(issues.length<2000)issues.push({code,message,ports:ports.slice(0,32)});}
  const required=new Map(),declared=new Set(),unassigned=new Set(contract.unassigned);
  for(const net of contract.nets)for(const id of net.ports){required.set(id,net);declared.add(id);}
  contract.unassigned.forEach(id=>declared.add(id));
  const component=new Map(),groups=[];
  let complete=true;
  try {
    for(const id of declared){step();if(!nodes.has(id))issue('MISSING_PORT',`Contract port ${id} is absent`,[id]);}
    if(contract.coverage==='all')for(const n of p.ports){step();if(!declared.has(n.id))issue('UNCOVERED_PORT',`No intent declared for ${n.id}`,[n.id]);}
    for(const e of p.connections){step();adj.get(e.from).push({to:e.to,edge:e});adj.get(e.to).push({to:e.from,edge:e});}
    for(const n of p.ports) {
      step();if(component.has(n.id))continue;
      const idx=groups.length,queue=[n.id],group={ports:[],names:new Set(),edges:new Map()};groups.push(group);component.set(n.id,idx);
      for(let k=0;k<queue.length;k++) {
        step();const id=queue[k];group.ports.push(id);if(required.has(id))group.names.add(required.get(id).name);
        for(const link of adj.get(id)){step();group.edges.set(link.edge.id,link.edge);if(!component.has(link.to)){component.set(link.to,idx);queue.push(link.to);}}
      }
    }
    for(const g of groups) {
      step();const first=g.names.values().next().value;
      if(g.names.size>1)issue('SHORT',`Connected component joins ${[...g.names].slice(0,10).join(', ')}`,g.ports);
      for(const id of g.ports) {
        step();const n=nodes.get(id);
        if((unassigned.has(id)||['nc','reserved'].includes(n.role))&&adj.get(id).length)issue('FORBIDDEN_CONNECTION',`Isolated/reserved/NC port ${id} is connected`,[id]);
        if(['nc','reserved'].includes(n.role)&&(n.net||required.has(id)))issue('FORBIDDEN_NET',`Reserved/NC port ${id} has signal intent or a net`,[id]);
        if(unassigned.has(id)&&n.net)issue('UNASSIGNED_NET',`Unassigned port ${id} declares a net`,[id]);
        if(first&&n.net&&!g.names.has(n.net))issue('NET_LABEL',`Port ${id} declares ${n.net}, expected ${[...g.names].slice(0,10).join(' / ')}`,[id]);
        const expected=required.get(id);
        if(expected?.domain&&expected.domain!==n.domain)issue('DOMAIN',`Port ${id} domain conflicts with intent`,[id]);
      }
      for(const e of g.edges.values()){step();if(first&&e.net&&!g.names.has(e.net))issue('EDGE_NET',`Connection ${e.id} has an unexpected net name`,[e.from,e.to]);}
    }
    for(const net of contract.nets){step();const comps=new Set(net.ports.filter(id=>nodes.has(id)).map(id=>component.get(id)));if(comps.size>1)issue('OPEN',`Net ${net.name} is split into ${comps.size} disconnected components`,net.ports);}
  }catch(error){if(error.message!=='WORK_LIMIT')throw error;complete=false;issue('INCOMPLETE','Connectivity check work budget exhausted');}
  return {schema:'openbumpplan.connectivity-review/v1',ok:complete&&issueCount===0,complete,coverage:contract.coverage,contractSHA256:objectDigest(contract),projectSHA256:objectDigest(p),issueCount,issues,findingsTruncated:issueCount>issues.length,
    statistics:{ports:p.ports.length,connections:p.connections.length,expectedNets:contract.nets.length,declaredPorts:declared.size,components:groups.length,work},
    limitations:contract.coverage==='listed'?['Only listed terminals have independently specified intent; unlisted terminals are not fully qualified.','Logical mapping verification, not copper extraction or electrical signoff.']:['Logical mapping verification, not copper extraction or electrical signoff.']};
}
export function verifyIntentReview(project,contract,review) {
  const actual=verifyConnectivityContract(project,contract);
  return {ok:actual.ok&&stableStringify(actual)===stableStringify(review),complete:actual.complete,current:actual,
    reason:stableStringify(actual)===stableStringify(review)?'Recomputed against independently supplied project and contract':'Stale, tampered, differently scoped or wrong review'};
}
/** Atomic mapping-only ECO. Preconditions pin the complete normalized base;
 * there is no force mode and no implicit weakening of intent/rules. */
export function previewMappingECO(project,patch,rawContract) {
  const p=normalizeProject(project),contract=validateContract(rawContract);
  if(contract.coverage!=='all')throw new Error('ECO acceptance requires all-port intent coverage');
  keys(patch,['schema','baseProjectSHA256','contractSHA256','edits'],'mapping ECO');
  if(patch.schema!=='openbumpplan.mapping-eco/v1'||patch.baseProjectSHA256!==objectDigest(p)||patch.contractSHA256!==objectDigest(contract))throw new Error('Stale/wrong ECO project or independent contract');
  if(!Array.isArray(patch.edits)||!patch.edits.length||patch.edits.length>20000)throw new Error('ECO requires a bounded edit list');
  const candidate=structuredClone(p),edges=new Map(candidate.connections.map(e=>[e.id,e])),ports=new Map(p.ports.map(n=>[n.id,n])),seen=new Set();
  for(const edit of patch.edits) {
    keys(edit,['id','expected','to'],'ECO edit');keys(edit.expected,['from','to','net'],'ECO precondition');
    identifier(edit.id,'edge id');identifier(edit.to,'target id');
    const e=edges.get(edit.id);if(!e||seen.has(edit.id))throw new Error('Missing or duplicate ECO connection');seen.add(edit.id);
    if(!ports.has(edit.to)||edit.expected.from!==e.from||edit.expected.to!==e.to||edit.expected.net!==e.net)throw new Error('ECO connection precondition failed');
    if(e.locked||[e.from,e.to,edit.to].some(id=>ports.get(id).locked))throw new Error('ECO would change a locked endpoint or mapping');
    e.to=edit.to;
  }
  const analysis=analyze(candidate),intent=verifyConnectivityContract(candidate,contract);
  const accepted=analysis.complete&&analysis.errors===0&&intent.ok;
  return {accepted,baseProjectSHA256:objectDigest(p),candidateProjectSHA256:objectDigest(candidate),changed:patch.edits.length,
    project:accepted?candidate:null,planning:{complete:analysis.complete,errors:analysis.errors,warnings:analysis.warnings,issues:analysis.issues},intent};
}
