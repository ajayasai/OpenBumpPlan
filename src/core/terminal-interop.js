import { parseSExpression, children, singleton, finiteDecimal, identifier } from './sexpr.js';
import { emptyProject, normalizeProject, indexProject, worldPoint, KINDS, stableStringify } from './model.js';
import { sha256Bytes } from './hash.js';

export const INTEROP_VERSION='0.4.0';
export function textDigest(text){return sha256Bytes(new TextEncoder().encode(text));}
export function objectDigest(value){return textDigest(stableStringify(value));}
const clean=n=>Math.abs(n)<1e-9?0:Math.round(n*1e6)/1e6;
const pos=(node,required=false)=>{
  const at=singleton(node,'at',required)||['at','0','0'];
  if(at.length<3||at.length>4)throw new Error('Invalid at coordinates');
  return [finiteDecimal(at[1],'x'),finiteDecimal(at[2],'y'),finiteDecimal(at[3]??'0','angle')];
};
function reference(fp) {
  const props=children(fp,'property').filter(v=>v[1]==='Reference');
  const texts=children(fp,'fp_text').filter(v=>v[1]==='reference');
  if(props.length>1||texts.length>1||props.length&&texts.length)throw new Error('Ambiguous footprint reference');
  return (props[0]||texts[0])?.[2]||'';
}
function strictOptions(options,allowed) {for(const key of Object.keys(options))if(!allowed.includes(key))throw new Error(`Unknown interchange option ${key}`);}
/** Reads terminal maps, NOT PCB routing/stackup/DRC. Already-flipped B.Cu
 * footprint local coordinates must not be mirrored a second time. */
export function importKiCad(text, options={}) {
  strictOptions(options,['kind','prefix','references']);
  const {kind='pcb',prefix='',references=null}=options;
  if(!KINDS.includes(kind))throw new Error('Invalid destination kind');
  identifier(prefix,'prefix',true);
  if(references!==null&&(!Array.isArray(references)||!references.length||references.some(r=>typeof r!=='string')||new Set(references).size!==references.length))throw new Error('references must be a nonempty unique string list');
  const root=parseSExpression(text),board=root[0]==='kicad_pcb';
  if(!board&&root[0]!=='footprint')throw new Error('Expected modern kicad_pcb or footprint root');
  const nets=new Map(),names=new Set();
  if(board)for(const net of children(root,'net')) {
    if(net.length!==3||!/^(0|[1-9]\d*)$/.test(net[1])||!Number.isSafeInteger(Number(net[1])))throw new Error('Invalid net declaration');
    identifier(net[2],'net name',true);
    if(nets.has(net[1])||names.has(net[2]))throw new Error('Duplicate net code/name');
    if((net[1]==='0')!==(net[2]===''))throw new Error('Net zero must be the empty net');
    nets.set(net[1],net[2]);names.add(net[2]);
  }
  const all=board?children(root,'footprint'):[root],selected=[],found=new Set(),refs=new Set();
  if(board&&children(root,'module').length)throw new Error('Legacy modules cannot be silently omitted');
  if(!all.length)throw new Error('No modern footprints found');
  for(const fp of all) {
    let ref=reference(fp);
    if(!ref&&!board)ref='PACKAGE';
    if(references&&!references.includes(ref))continue;
    identifier(ref,'footprint reference');
    if(refs.has(ref))throw new Error(`Duplicate selected reference ${ref}`);
    refs.add(ref);found.add(ref);selected.push({fp,ref});
  }
  if(references&&references.some(ref=>!found.has(ref)))throw new Error('Requested footprint reference not found');
  if(!selected.length)throw new Error('No selected footprints');
  const p=emptyProject('KiCad terminal map'),ids=new Set(),warnings=[
    'Terminal-map import only: tracks, vias, zones, rules, board outline, 3D models and stackup are not imported.',
    'Pad geometry is retained as interchange metadata; the planning engine still treats sites as points. No manufacturability approval.'
  ];
  if(all.length!==selected.length)warnings.push(`${all.length-selected.length} unselected footprints omitted by explicit reference selection.`);
  for(const {fp,ref}of selected) {
    const layer=singleton(fp,'layer',true);if(layer.length!==2||!['F.Cu','B.Cu'].includes(layer[1]))throw new Error('Only front/back copper footprints supported');
    const [fx,fy,angle]=pos(fp),a=angle*Math.PI/180,cos=Math.cos(a),sin=Math.sin(a);
    let pads=children(fp,'pad');if(!pads.length)throw new Error(`${ref} has no pads`);
    for(const pad of pads) {
      const number=identifier(pad[1],'pad number'),type=pad[2],shape=pad[3];
      if(type!=='smd'||!['circle','rect','oval','roundrect'].includes(shape))throw new Error(`${ref}:${number}: unsupported pad type/shape; only simple SMD pads are imported`);
      const known=new Set(['at','size','layers','net','pinfunction','pintype','uuid','tstamp','roundrect_rratio','locked','solder_mask_margin','solder_paste_margin','solder_paste_margin_ratio','clearance','zone_connect','thermal_bridge_width','thermal_gap','remove_unused_layers','keep_end_layers','property']);
      for(const item of pad.slice(4))if(Array.isArray(item)&&!known.has(item[0])||!Array.isArray(item)&&item!=='locked')throw new Error(`${ref}:${number}: unsupported pad field`);
      const unsupported=['offset','rect_delta','primitives','options','chamfer','chamfer_ratio','drill'];
      if(unsupported.some(k=>children(pad,k).length))throw new Error(`${ref}:${number}: unsupported pad geometry modifier`);
      const layers=singleton(pad,'layers',true);
      if(layers.slice(1).some(v=>typeof v!=='string')||!layers.includes(layer[1])||layers.some(v=>v==='*.Cu'||v===(layer[1]==='F.Cu'?'B.Cu':'F.Cu')||/^In\d+\.Cu$/.test(v)))throw new Error('Unsupported or inconsistent pad copper layers');
      const size=singleton(pad,'size',true);if(size.length!==3)throw new Error('Invalid pad size');
      const width=finiteDecimal(size[1],'pad width'),height=finiteDecimal(size[2],'pad height');
      if(width<=0||height<=0||shape==='circle'&&width!==height)throw new Error('Invalid positive pad dimensions');
      const ratio=singleton(pad,'roundrect_rratio');
      if(shape==='roundrect'&&(!ratio||ratio.length!==2||finiteDecimal(ratio[1])<0||finiteDecimal(ratio[1])>0.5))throw new Error('Invalid roundrect ratio');
      const [px,py,rotation]=pos(pad,true),net=singleton(pad,'net');let netName='';
      if(net) {
        if(net.length!==3||!/^(0|[1-9]\d*)$/.test(net[1]))throw new Error('Invalid pad net reference');
        netName=identifier(net[2],'pad net name',true);
        if(board&&!(net[1]==='0'&&netName===''&&!nets.has('0'))&&nets.get(net[1])!==netName)throw new Error(`Unresolved/mismatched pad net on ${ref}:${number}`);
      }
      const id=prefix+ref+':'+number;
      if(ids.has(id))throw new Error(`Duplicate physical pin identifier ${id}; split stacked pads explicitly`);ids.add(id);
      const locked=fp.includes('locked')||pad.includes('locked')||!!singleton(fp,'locked')||!!singleton(pad,'locked');
      p.ports.push({id,label:number,kind,x:clean(1000*(fx+px*cos+py*sin)),y:clean(-1000*(fy-px*sin+py*cos)),net:netName,role:'any',locked,
        interchange:{format:'kicad-terminal/v1',reference:ref,footprint:identifier(fp[1],'footprint name'),number,shape,width:width*1000,height:height*1000,rotation,side:layer[1],sourceFrame:'mm/y-down',local:[px,py],footprintAt:[fx,fy,angle]}});
      if(p.ports.length>10000)throw new Error('Terminal-map safety limit: 10000 sites');
    }
  }
  p.description=warnings.join('\n');
  return {project:normalizeProject(p),report:{schema:'openbumpplan.import/v1',adapter:'kicad-terminal/v1',sourceSHA256:textDigest(text),units:'um',yAxis:'up',terminalCount:p.ports.length,footprints:[...refs],warnings}};
}

/** Graph-net labels are computed from all component members, not first-parent
 * propagation. Conflicting declarations are rejected rather than picked. */
export function componentNetNames(project) {
  const p=normalizeProject(project),parents=new Map(p.ports.map(v=>[v.id,v.id]));
  function find(id){let r=id;while(parents.get(r)!==r)r=parents.get(r);while(id!==r){const next=parents.get(id);parents.set(id,r);id=next;}return r;}
  for(const e of p.connections){const a=find(e.from),b=find(e.to);if(a!==b)parents.set(a,b);}
  const labels=new Map();
  function add(id,net){if(!net)return;const r=find(id);if(!labels.has(r))labels.set(r,new Set());labels.get(r).add(net);}
  for(const n of p.ports)add(n.id,n.net);for(const e of p.connections)add(e.from,e.net);
  for(const [r,set]of labels)if(set.size>1)throw new Error(`Conflicting connected net names near ${r}`);
  return new Map(p.ports.map(n=>[n.id,[...(labels.get(find(n.id))||[])][0]||'']));
}
const q=s=>JSON.stringify(identifier(s,'output text',true));
const mm=n=>{if(!Number.isFinite(n)||Math.abs(n)>1e9)throw new Error('Export coordinate out of range');return (Math.round(n*1000)/1e6).toFixed(6).replace(/\.?0+$/,'')||'0';};
/** Generates an UNROUTED pin-map board plus a library footprint. It does not
 * modify an existing PCB and it cannot serve as a manufacturing layout. */
export function exportKiCad(project, options={}) {
  strictOptions(options,['kind','diameter','side','name','reference','originX','originY']);
  const {kind='ball',diameter,side='F.Cu',name='OpenBumpPlan_PinMap',reference='U1',originX=0,originY=0}=options;
  const p=normalizeProject(project);
  if(!KINDS.includes(kind)||!['F.Cu','B.Cu'].includes(side))throw new Error('Invalid export kind or copper side');
  identifier(name,'footprint name');identifier(reference,'reference');
  if(typeof diameter!=='number'||!Number.isFinite(diameter)||diameter<0.001||diameter>1e6||Math.abs(diameter*1000-Math.round(diameter*1000))>1e-6)throw new Error('Supply explicit positive SMD pad diameter in um');
  if(!Number.isFinite(originX)||!Number.isFinite(originY)||Math.abs(originX)>1e9||Math.abs(originY)>1e9)throw new Error('Invalid export origin');
  const ports=p.ports.filter(n=>n.kind===kind);if(!ports.length)throw new Error('No sites on selected layer');
  const ctx=indexProject(p),labels=componentNetNames(p),numbers=new Set();
  const map=ports.map(n=>{
    const number=identifier(n.label||n.id,'pad number');
    if(numbers.has(number))throw new Error(`Duplicate output pad number ${number}`);numbers.add(number);
    const w=worldPoint(n,ctx),net=labels.get(n.id);
    if(['nc','reserved'].includes(n.role)&&net)throw new Error(`Reserved/NC site ${n.id} has a net`);
    return {id:n.id,number,net,x:clean(w.x-originX),y:clean(w.y-originY),side,diameter};
  });
  const netNames=[...new Set(map.map(n=>n.net).filter(Boolean))].sort(),netCodes=new Map(netNames.map((net,i)=>[net,i+1]));
  const tech=side[0],effects='(effects (font (size 1 1) (thickness 0.15)))';
  function footprint(withNets) {
    return `(footprint ${q(name)}${withNets?'':' (version 20221018) (generator openbumpplan)'}\n  (layer ${q(side)})\n  (at 0 0)\n  (descr "OpenBumpPlan terminal map only; unrouted; not fabrication approval")\n  (attr smd)\n  (fp_text reference ${q(reference)} (at 0 0) (layer "${tech}.SilkS") hide ${effects})\n  (fp_text value ${q(name)} (at 0 0) (layer "${tech}.Fab") hide ${effects})\n`+
      map.map(n=>`  (pad ${q(n.number)} smd circle (at ${mm(n.x)} ${mm(-n.y)}) (size ${mm(diameter)} ${mm(diameter)}) (layers "${tech}.Cu" "${tech}.Paste" "${tech}.Mask")${withNets&&n.net?` (net ${netCodes.get(n.net)} ${q(n.net)})`:''})`).join('\n')+'\n)\n';
  }
  const board=`(kicad_pcb (version 20221018) (generator openbumpplan)\n  (general (thickness 1.6))\n  (paper "A4")\n  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user) (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (48 "B.Fab" user) (49 "F.Fab" user))\n  (setup (pad_to_mask_clearance 0))\n  (net 0 "")\n`+netNames.map((net,i)=>`  (net ${i+1} ${q(net)})`).join('\n')+'\n'+footprint(true)+')\n';
  const library=footprint(false);
  // File identity is separate from source intent. Hashes do not approve a design.
  const receipt={schema:'openbumpplan.kicad-export/v1',adapterVersion:INTEROP_VERSION,projectSHA256:objectDigest(p),kind,side,diameter,name,reference,origin:{x:originX,y:originY},coordinateConvention:'KiCad mm/y-down; package um/y-up',terminalCount:map.length,map,
    files:{boardSHA256:textDigest(board),footprintSHA256:textDigest(library)},warnings:['Generated unrouted pin-map board; no traces, vias, outline, stackup or manufacturing DRC.','Library footprints do not carry net assignments; use the board and mapping receipt.','Selected-layer sites flattened to package XY; circular pads regenerated from explicit diameter, not from imported shape metadata.']};
  return {board,footprint:library,receipt};
}
export function verifyKiCadExport(project,board,receipt,expectedOptions) {
  if(!expectedOptions||typeof expectedOptions.diameter!=='number')throw new Error('Supply independently expected export geometry options');
  if(!receipt||receipt.schema!=='openbumpplan.kicad-export/v1')throw new Error('Invalid export receipt');
  const p=normalizeProject(project),issues=[];
  if(receipt.projectSHA256!==objectDigest(p))issues.push('Stale or wrong source project');
  if(receipt.files?.boardSHA256!==textDigest(board))issues.push('Board checksum mismatch');
  // Recreate expectations from the independently supplied project and explicit
  // export specification, never from receipt.map or receipt.terminalCount.
  const expectedReceipt=exportKiCad(p,expectedOptions).receipt,expected=expectedReceipt.map;
  for(const key of ['kind','side','diameter','origin','name','reference'])if(stableStringify(receipt[key])!==stableStringify(expectedReceipt[key]))issues.push(`Unexpected export specification: ${key}`);
  if(receipt.terminalCount!==expected.length||stableStringify(receipt.map)!==stableStringify(expected))issues.push('Mapping receipt differs from independent source');
  const tree=parseSExpression(board);
  const allowedRoot=['version','generator','generator_version','general','paper','layers','setup','net','footprint'];
  if(tree[0]!=='kicad_pcb'||tree.slice(1).some(n=>!Array.isArray(n)||!allowedRoot.includes(n[0])))issues.push('Unexpected non-terminal board content');
  const allowedFootprint=['version','generator','layer','at','descr','attr','fp_text','property','pad','uuid','tstamp'];
  for(const f of children(tree,'footprint'))if(f.slice(2).some(n=>!Array.isArray(n)||!allowedFootprint.includes(n[0])))issues.push('Unexpected non-terminal footprint content');
  const actual=importKiCad(board,{kind:expectedReceipt.kind}).project.ports;
  const byNumber=new Map(actual.map(n=>[n.label,n]));
  if(actual.length!==expected.length||byNumber.size!==expected.length)issues.push('Terminal coverage mismatch');
  for(const e of expected){const a=byNumber.get(e.number);if(!a||a.net!==e.net||Math.abs(a.x-e.x)>0.00051||Math.abs(a.y-e.y)>0.00051||Math.abs(a.interchange.width-e.diameter)>0.0000001||Math.abs(a.interchange.height-e.diameter)>0.0000001||a.interchange.side!==e.side||a.interchange.reference!==expectedReceipt.reference||a.interchange.footprint!==expectedReceipt.name)issues.push(`Terminal mismatch: ${e.number}`);}
  return {ok:issues.length===0,complete:true,issues,checked:expected.length,projectSHA256:objectDigest(p),boardSHA256:textDigest(board)};
}
