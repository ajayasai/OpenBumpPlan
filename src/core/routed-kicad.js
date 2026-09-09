import { normalizeProject, effectiveSignals, worldPoint, transformPoint, stableStringify } from './model.js';
import { verifyRoutes } from './routing.js';
import { normalizeTechnology, verifyCopper } from './copper.js';
import { sha256Bytes } from './hash.js';
import { parseSExpression, identifier } from './sexpr.js';

/** A deliberately bounded native handoff: one routing stage, two copper layers,
 * circular SMD terminals and full through vias. Not a foundry signoff adapter. */
export const ROUTED_KICAD_SCHEMA = 'openbumpplan.routed-kicad/v1';
const digest = value => sha256Bytes(new TextEncoder().encode(typeof value === 'string' ? value : stableStringify(value)));
const quote = value => JSON.stringify(identifier(value, 'native identifier', true));
const order = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const layer = z => z === 0 ? 'F.Cu' : 'B.Cu';

// KiCad coordinates are integer nanometres in a signed 32-bit representation.
// Leave a small range margin; do not silently round genuine sub-nanometre input.
function nm(value, name) {
  if (!Number.isFinite(value) || Math.abs(value * 1000) > 2000000000 ||
      Math.abs(value * 1000 - Math.round(value * 1000)) > 0.00001) {
    throw new Error(`${name}: require representable 1 nm geometry within +/-2 m`);
  }
  return Math.round(value * 1000);
}
const mm = value => (value / 1000000).toFixed(6);
function specification(options) {
  const keys = ['viaDrill', 'boardThickness', 'edgeMargin'];
  if (!options || Array.isArray(options) || typeof options !== 'object' ||
      Object.keys(options).some(k => !keys.includes(k))) throw new Error('Supply explicit viaDrill, boardThickness and edgeMargin in um');
  const result = {};
  for (const key of keys) {
    nm(options[key], key);
    if (options[key] <= 0) throw new Error(`${key} must be positive`);
    result[key] = options[key];
  }
  return result;
}

export function exportRoutedKiCad(project, witness, technology, options) {
  const p = normalizeProject(project), tech = normalizeTechnology(technology), spec = specification(options);
  for (const [name, value] of Object.entries(tech)) if (name !== 'units') nm(value, name);
  if (spec.viaDrill >= tech.viaDiameter) throw new Error('Via drill must be smaller than copper via diameter');
  if (witness?.config?.layers > 2) throw new Error('Native routed export supports one or two routing layers; blind/buried vias are not inferred');
  const grid = verifyRoutes(p, witness), copper = verifyCopper(p, witness, tech);
  if (!grid.ok || !copper.ok) throw new Error(`Current grid and continuous copper checks must both pass: ${JSON.stringify({grid: grid.issues, copper: copper.issues}).slice(0,1500)}`);
  const c = witness.config, ctx = effectiveSignals(p);
  const edges = p.connections.filter(e => ctx.ports.get(e.from).kind === c.fromKind && ctx.ports.get(e.to).kind === c.toKind);
  const byEdge = new Map(edges.map(e => [e.id, e])), active = new Set(edges.flatMap(e => [e.from, e.to]));
  const relevant = n => n.kind === c.fromKind || n.kind === c.toKind;
  const ports = p.ports.filter(n => relevant(n) && (active.has(n.id) || ['reserved', 'nc'].includes(n.role) || ctx.incoming.has(n.id) || ctx.outgoing.has(n.id)));
  const padMap = ports.map(n => {
    const xy = worldPoint(n, ctx), net = ctx.signals.get(n.id).net || '';
    identifier(n.id, 'pad identity'); identifier(net, 'net identity', true);
    if (net && !active.has(n.id)) throw new Error(`Unrouted named terminal ${n.id} in selected stage`);
    if (active.has(n.id) && !net) throw new Error(`Routed terminal ${n.id} has no net name`);
    if (['reserved', 'nc'].includes(n.role) && net) throw new Error(`Reserved/NC terminal ${n.id} has a net`);
    return {id: n.id, kind: n.kind, net, x: nm(xy.x, n.id + ' x'), y: nm(-xy.y, n.id + ' y'), layer: layer(n.kind === c.fromKind ? c.startLayer : c.endLayer)};
  }).sort((a, b) => order(a.id, b.id));
  // This router does not synthesize shared multi-terminal net trees. Prevent a
  // collection of disconnected pairs from being presented as a routed native net.
  const netEdges = new Map();
  for (const e of edges) {
    const net = ctx.signals.get(e.from).net;
    if (netEdges.has(net)) throw new Error(`Multiple routed branches share net ${net}; native multi-terminal tree routing is not supported`);
    netEdges.set(net, e.id);
  }
  const names = [...new Set(padMap.map(n => n.net).filter(Boolean))].sort(order), codes = new Map(names.map((n, i) => [n, i + 1]));
  const width = nm(tech.traceWidth, 'trace width'), viaDiameter = nm(tech.viaDiameter, 'via diameter'), padDiameter = nm(tech.padDiameter, 'pad diameter');
  const segments = [], vias = [];
  const point = v => [nm(c.originX + v[0] * c.pitch, 'route x'), nm(-c.originY - v[1] * c.pitch, 'route y')];
  for (const route of [...witness.routes].sort((a, b) => order(a.connectionId, b.connectionId))) {
    const net = ctx.signals.get(byEdge.get(route.connectionId).from).net;
    let run = null;
    const flush = () => { if (run) { segments.push(run); run = null; } };
    for (let i = 1; i < route.path.length; i++) {
      const a = route.path[i - 1], b = route.path[i], start = point(a), end = point(b);
      if (a[2] !== b[2]) { flush(); vias.push({at: start, net}); }
      else {
        const direction = [Math.sign(b[0] - a[0]), Math.sign(b[1] - a[1])].join(',');
        if (run && run.layer === layer(a[2]) && run.direction === direction) run.end = end;
        else { flush(); run = {start, end, layer: layer(a[2]), net, direction}; }
      }
    }
    flush();
  }
  const keepouts = p.keepouts.filter(k => k.kinds.includes(c.fromKind) || k.kinds.includes(c.toKind)).map(k => ({id:k.id, points:[[0,0],[k.width,0],[k.width,k.height],[0,k.height]].map(([x,y]) => {
    const q = transformPoint({x:k.x+x,y:k.y+y},ctx.dies.get(k.dieId));
    return [nm(q.x,'keepout x'),nm(-q.y,'keepout y')];
  })})).sort((a,b)=>order(a.id,b.id));
  const radii = [width, viaDiameter, padDiameter];
  const points = padMap.map(p => [p.x, p.y]).concat(segments.flatMap(s=>[s.start,s.end]),vias.map(v=>v.at),keepouts.flatMap(k=>k.points));
  const margin = nm(spec.edgeMargin, 'edge margin') + Math.ceil(Math.max(...radii) / 2);
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for (const [x,y] of points) {x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
  const outline = [[x0-margin,y0-margin],[x1+margin,y0-margin],[x1+margin,y1+margin],[x0-margin,y1+margin]];
  for (const xy of outline) for (const v of xy) nm(v/1000, 'outline coordinate');
  const lines = [`(kicad_pcb (version 20221018) (generator openbumpplan)`,
    `  (general (thickness ${mm(nm(spec.boardThickness,'thickness'))}))`, '  (paper "A4")',
    '  (layers (0 "F.Cu" signal) (31 "B.Cu" signal) (34 "B.Paste" user) (35 "F.Paste" user) (36 "B.SilkS" user) (37 "F.SilkS" user) (38 "B.Mask" user) (39 "F.Mask" user) (44 "Edge.Cuts" user) (48 "B.Fab" user) (49 "F.Fab" user))',
    '  (setup (pad_to_mask_clearance 0))', '  (net 0 "")',
    ...names.map(n => `  (net ${codes.get(n)} ${quote(n)})`)];
  for (const [kind, z, ref] of [[c.fromKind,c.startLayer,'FROM'],[c.toKind,c.endLayer,'TO']]) {
    const side = layer(z), letter = side[0];
    lines.push(`  (footprint "OpenBumpPlan:Routed_${kind}" (layer ${quote(side)}) (at 0 0) (attr smd)`,
      '    (descr "Verified planning-stage route handoff; not manufacturing approval")',
      `    (fp_text reference "${ref}" (at 0 0) (layer "${letter}.SilkS") hide (effects (font (size 1 1) (thickness 0.15))))`,
      `    (fp_text value "${kind}" (at 0 0) (layer "${letter}.Fab") hide (effects (font (size 1 1) (thickness 0.15))))`);
    for (const n of padMap.filter(n => n.kind === kind)) lines.push(`    (pad ${quote(n.id)} smd circle (at ${mm(n.x)} ${mm(n.y)}) (size ${mm(padDiameter)} ${mm(padDiameter)}) (layers "${letter}.Cu" "${letter}.Paste" "${letter}.Mask")${n.net ? ` (net ${codes.get(n.net)} ${quote(n.net)})` : ''})`);
    lines.push('  )');
  }
  for (const s of segments) lines.push(`  (segment (start ${s.start.map(mm).join(' ')}) (end ${s.end.map(mm).join(' ')}) (width ${mm(width)}) (layer ${quote(s.layer)}) (net ${codes.get(s.net)}))`);
  for (const v of vias) lines.push(`  (via (at ${v.at.map(mm).join(' ')}) (size ${mm(viaDiameter)}) (drill ${mm(nm(spec.viaDrill,'via drill'))}) (layers "F.Cu" "B.Cu") (net ${codes.get(v.net)}))`);
  for (const k of keepouts) lines.push(`  (zone (net 0) (net_name "") (layers "F.Cu" "B.Cu") (hatch edge 0.5) (keepout (tracks not_allowed) (vias not_allowed) (pads not_allowed) (copperpour not_allowed) (footprints allowed)) (polygon (pts ${k.points.map(q=>`(xy ${q.map(mm).join(' ')})`).join(' ')})))`);
  for (let i=0;i<4;i++) lines.push(`  (gr_line (start ${outline[i].map(mm).join(' ')}) (end ${outline[(i+1)%4].map(mm).join(' ')}) (stroke (width 0.05) (type default)) (layer "Edge.Cuts"))`);
  lines.push(')');
  const board = lines.join('\n') + '\n';
  // Enforce parser capacity before returning a file our own replay cannot read.
  parseSExpression(board);
  const receipt = {schema:ROUTED_KICAD_SCHEMA, projectSHA256:digest(p), witnessSHA256:digest(witness), technologySHA256:digest(tech), specification:spec,
    stage:[c.fromKind,c.toKind], nativeCopperLayers:['F.Cu','B.Cu'], boardSHA256:digest(board),
    counts:{pads:padMap.length,segments:segments.length,vias:vias.length,keepouts:keepouts.length},
    metrics:{wireLengthUm:witness.metrics.wireLength,viaTransitions:witness.metrics.vias},
    warnings:['One selected routing stage only; not a complete die/package/PCB manufacturing conversion.',
      'Uniform circular pads and trace/via dimensions come from the explicitly supplied simplified technology, not a foundry deck.',
      'Through vias connect F.Cu and B.Cu. Blind/buried vias and multilayer stackup are not inferred.',
      'Rectangular Edge.Cuts is an automatically generated clearance envelope, NOT the original package mechanical outline.',
      'Clearance, length and mapping rules are checked against the source; native manufacturing rules must be configured separately.',
      'Receipt replay binds this generated board to source data; external native DRC and electrical/thermal/mechanical signoff remain necessary.']};
  return {board,receipt};
}

/** Source-bound structural replay, not a substitute for an independent native
 * parser. Recomputing a receipt hash cannot authorize changed tracks or nets. */
export function verifyRoutedKiCad(project,witness,technology,board,receipt,expectedOptions) {
  try {
    const expected=exportRoutedKiCad(project,witness,technology,expectedOptions),issues=[];
    if(!receipt || receipt.schema!==ROUTED_KICAD_SCHEMA)throw new Error('Unsupported routed handoff receipt');
    if(receipt.boardSHA256!==digest(board))issues.push('Board byte checksum differs from receipt');
    const {boardSHA256:unused,...identity}=receipt,{boardSHA256:ignored,...expectedIdentity}=expected.receipt;
    if(stableStringify(identity)!==stableStringify(expectedIdentity))issues.push('Receipt differs from independently supplied source, routes, technology or specification');
    if(stableStringify(parseSExpression(board))!==stableStringify(parseSExpression(expected.board)))issues.push('Native structure differs from current checked source geometry');
    return {ok:issues.length===0,complete:true,issues,counts:expected.receipt.counts};
  } catch(error) {return {ok:false,complete:false,issues:[error.message]};}
}
