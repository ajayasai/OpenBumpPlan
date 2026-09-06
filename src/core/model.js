/** Canonical, dependency-free model. All geometry is micrometres, right-handed XY. */
export const VERSION = '0.3.1';
export const KINDS = ['pad', 'bump', 'interposer', 'ball', 'pcb'];
export const ROLES = ['any', 'signal', 'clock', 'power', 'ground', 'reserved', 'nc'];
export const DEFAULT_RULES = Object.freeze({
  maxLength: 4000, minDomainSpacing: 0, pairMaxDistance: 650, pairMaxSkew: 150,
  clockShieldRadius: 750, clockGroundMin: 1, groundRadius: 1000,
  powerRadius: 1400, requirePowerForSignals: false, minGroundRatio: 0.15,
  crossingWeight: 150, maxCrossings: 0, geometryBudget: 1000000,
  terminalKind: 'ball', requireCompletePaths: false,
  allowedStagePairs: [['pad','bump'], ['pad','ball'], ['bump','interposer'],
    ['bump','ball'], ['interposer','ball'], ['ball','pcb']]
});
export const clone = value => structuredClone(value);
export const rank = kind => KINDS.indexOf(kind);
export const emptyProject = (name = 'Untitled package') => ({
  schemaVersion: 1, name, revision: 0, units: 'um', description: '',
  dies: [], ports: [], connections: [], keepouts: [], regions: [],
  rules: clone(DEFAULT_RULES), audit: []
});
export function stableStringify(value) {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
  return JSON.stringify(value);
}
/** Review identifier, NOT a cryptographic signature or tamper-proof audit. */
export function fingerprint(p) {
  const copy = clone(p); delete copy.audit; delete copy.revision;
  for (const key of ['dies','ports','connections','keepouts','regions']) copy[key]?.sort((a,b) => a.id.localeCompare(b.id));
  let h = 2166136261;
  for (const c of stableStringify(copy)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16).padStart(8, '0');
}
export function normalizeProject(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Project must be a JSON object.');
  if (raw.schemaVersion !== 1) throw new Error('Unsupported schemaVersion; expected 1.');
  const p = clone(raw);
  p.description ??= ''; p.revision ??= 0; p.audit ??= [];
  for (const key of ['dies','ports','connections','keepouts','regions']) p[key] ??= [];
  p.rules = { ...clone(DEFAULT_RULES), ...p.rules };
  p.dies = p.dies.map(d => ({name: d.id, rotation: 0, mirrorX: false, edgeKeepout: 0, cornerKeepout: 0, ...d}));
  p.ports = p.ports.map(n => ({label: n.id, dieId: '', net: '', domain: '', role: 'any', pair: '', polarity: '', locked: false, required: false, ...n}));
  p.connections = p.connections.map(e => ({net: '', locked: false, ...e}));
  p.keepouts = p.keepouts.map(k => ({dieId: '', kinds: clone(KINDS), ...k}));
  p.regions = p.regions.map(r => ({kind: 'ball', domain: '', minGround: 0, minPower: 0, ...r}));
  assertProject(p);
  return p;
}
export function assertProject(p) {
  const errors = [];
  const need = (yes, text) => { if (!yes) errors.push(text); };
  const number = n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= 1e9;
  const string = s => typeof s === 'string' && s.length <= 512 && !/[\u0000-\u001f\u007f]/.test(s);
  const array = (a, name, cap) => { need(Array.isArray(a), `${name} must be an array`); if (Array.isArray(a)) need(a.length <= cap, `${name} exceeds the ${cap} item safety limit`); return Array.isArray(a) ? a : []; };
  need(p.schemaVersion === 1, 'schemaVersion must be 1');
  need(p.units === 'um', 'Canonical units must be um; use import conversion for mm/nm.');
  need(string(p.name) && p.name.length > 0, 'name must be a nonempty string of at most 512 characters');
  need(typeof p.description === 'string' && p.description.length <= 10000, 'description must be text, at most 10000 characters');
  need(Number.isSafeInteger(p.revision) && p.revision >= 0, 'revision must be a nonnegative integer');
  const dies = array(p.dies, 'dies', 1000), ports = array(p.ports, 'ports', 10000), edges = array(p.connections, 'connections', 20000);
  const keepouts = array(p.keepouts, 'keepouts', 1000), regions = array(p.regions, 'regions', 1000);
  const audit = array(p.audit, 'audit', 200);
  for (const a of audit) need(a && typeof a === 'object' && typeof a.action === 'string' && typeof a.time === 'string', 'Audit entries need action and time strings');
  const ids = (items, label) => { const set = new Set(); for (const item of items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) { errors.push(`${label} item must be an object`); continue; }
    need(string(item.id) && item.id.length > 0, `${label} id must be nonempty text`);
    need(!set.has(item.id), `Duplicate ${label} id: ${item.id}`); set.add(item.id);
  } return set; };
  const dieIds = ids(dies, 'die'), portIds = ids(ports, 'port'); ids(edges, 'connection'); ids(keepouts, 'keepout'); ids(regions, 'region');
  for (const d of dies.filter(Boolean)) {
    for (const key of ['x','y','width','height','edgeKeepout','cornerKeepout']) need(number(d[key]), `Die ${d.id}: invalid ${key}`);
    need(d.width > 0 && d.height > 0, `Die ${d.id}: width and height must be positive`);
    need(d.edgeKeepout >= 0 && d.cornerKeepout >= 0, `Die ${d.id}: keep-outs cannot be negative`);
    need([0,90,180,270].includes(d.rotation), `Die ${d.id}: rotation must be 0/90/180/270`);
    need(typeof d.mirrorX === 'boolean', `Die ${d.id}: mirrorX must be boolean`);
    need(string(d.name), `Die ${d.id}: invalid name`);
  }
  for (const n of ports.filter(Boolean)) {
    need(KINDS.includes(n.kind), `Port ${n.id}: unknown kind ${n.kind}`);
    need(ROLES.includes(n.role), `Port ${n.id}: unknown role ${n.role}`);
    need(number(n.x) && number(n.y), `Port ${n.id}: coordinates must be finite numbers`);
    need(!n.dieId || dieIds.has(n.dieId), `Port ${n.id}: unknown die ${n.dieId}`);
    for (const key of ['label','dieId','net','domain','pair','polarity']) need(string(n[key]), `Port ${n.id}: invalid ${key}`);
    need(['','+','-'].includes(n.polarity), `Port ${n.id}: polarity must be +, -, or empty`);
    need(Boolean(n.pair) === Boolean(n.polarity), `Port ${n.id}: pair and polarity must be supplied together`);
    need(typeof n.locked === 'boolean' && typeof n.required === 'boolean', `Port ${n.id}: locked/required must be boolean`);
  }
  for (const e of edges.filter(Boolean)) {
    need(portIds.has(e.from) && portIds.has(e.to), `Connection ${e.id}: dangling endpoint`);
    need(e.from !== e.to, `Connection ${e.id}: cannot connect a port to itself`);
    need(typeof e.locked === 'boolean' && string(e.net), `Connection ${e.id}: invalid net or locked value`);
  }
  for (const k of [...keepouts, ...regions].filter(Boolean)) {
    for (const key of ['x','y','width','height']) need(number(k[key]), `Region ${k.id}: invalid ${key}`);
    need(k.width > 0 && k.height > 0, `Region ${k.id}: size must be positive`);
  }
  for (const k of keepouts.filter(Boolean)) {
    need(!k.dieId || dieIds.has(k.dieId), `Keep-out ${k.id}: unknown die`);
    need(Array.isArray(k.kinds) && k.kinds.every(v => KINDS.includes(v)), `Keep-out ${k.id}: invalid kinds`);
  }
  for (const r of regions.filter(Boolean)) {
    need(KINDS.includes(r.kind) && string(r.domain), `Region ${r.id}: invalid kind/domain`);
    need(Number.isInteger(r.minGround) && r.minGround >= 0 && Number.isInteger(r.minPower) && r.minPower >= 0, `Region ${r.id}: quotas must be nonnegative integers`);
  }
  const rules = p.rules || {};
  for (const key of Object.keys(rules)) need(Object.hasOwn(DEFAULT_RULES,key), `Unknown rule ${key}; check the spelling/schema.`);
  for (const key of ['maxLength','minDomainSpacing','pairMaxDistance','pairMaxSkew','clockShieldRadius','clockGroundMin','groundRadius','powerRadius','minGroundRatio','crossingWeight','maxCrossings','geometryBudget']) need(number(rules[key]) && rules[key] >= 0, `Rule ${key} must be a finite nonnegative number`);
  need(rules.minGroundRatio <= 1, 'minGroundRatio must be <= 1');
  need(Number.isInteger(rules.geometryBudget) && rules.geometryBudget >= 100 && rules.geometryBudget <= 10000000, 'geometryBudget must be an integer from 100 to 10000000');
  need(Number.isInteger(rules.clockGroundMin) && Number.isInteger(rules.maxCrossings), 'clockGroundMin/maxCrossings must be integers');
  need(KINDS.includes(rules.terminalKind), 'Unknown terminalKind');
  need(typeof rules.requirePowerForSignals === 'boolean' && typeof rules.requireCompletePaths === 'boolean', 'Boolean rules must be true/false');
  need(Array.isArray(rules.allowedStagePairs) && rules.allowedStagePairs.every(v => Array.isArray(v) && v.length === 2 && KINDS.includes(v[0]) && KINDS.includes(v[1]) && rank(v[0]) < rank(v[1])), 'allowedStagePairs must contain strictly forward layer pairs');
  if (errors.length) throw new Error(errors.slice(0, 30).join('\n') + (errors.length > 30 ? `\n... ${errors.length - 30} additional errors` : ''));
  return p;
}
export function indexProject(p) {
  return {ports: new Map(p.ports.map(n => [n.id,n])), dies: new Map(p.dies.map(d => [d.id,d])), connections: new Map(p.connections.map(e => [e.id,e]))};
}
export function transformPoint(point, die) {
  if (!die) return {x:point.x, y:point.y};
  const x = die.mirrorX ? die.width - point.x : point.x, y = point.y;
  const [rx, ry] = die.rotation === 90 ? [-y,x] : die.rotation === 180 ? [-x,-y] : die.rotation === 270 ? [y,-x] : [x,y];
  return {x: die.x + rx, y: die.y + ry};
}
export function inversePoint(point, die) {
  if (!die) return {x: point.x, y: point.y};
  const dx = point.x - die.x, dy = point.y - die.y;
  const [x,y] = die.rotation === 90 ? [dy,-dx] : die.rotation === 180 ? [-dx,-dy] : die.rotation === 270 ? [-dy,dx] : [dx,dy];
  return {x: die.mirrorX ? die.width - x : x, y};
}
export function worldPoint(n, index) { return transformPoint(n, index.dies.get(n.dieId)); }
export function effectiveSignals(p) {
  const index = indexProject(p), incoming = new Map(), outgoing = new Map();
  for (const e of p.connections) {
    if (!incoming.has(e.to)) incoming.set(e.to, []); incoming.get(e.to).push(e);
    if (!outgoing.has(e.from)) outgoing.set(e.from, []); outgoing.get(e.from).push(e);
  }
  const signals = new Map();
  for (const n of [...p.ports].sort((a,b) => rank(a.kind)-rank(b.kind) || a.id.localeCompare(b.id))) {
    const e = incoming.get(n.id)?.[0], parent = e && signals.get(e.from);
    signals.set(n.id, {net: n.net || parent?.net || e?.net || '', domain: n.domain || parent?.domain || '',
      role: n.role === 'any' ? (parent?.role || 'any') : n.role,
      pair: n.pair || parent?.pair || '', polarity: n.polarity || parent?.polarity || ''});
  }
  return {...index, incoming, outgoing, signals};
}
export function tracePath(p, start) {
  const ctx = effectiveSignals(p), seen = new Set(), path = []; let id = start;
  while (id && !seen.has(id)) { seen.add(id); path.push(id); id = ctx.outgoing.get(id)?.[0]?.to; }
  return path;
}
export function portAt(p, id) {
  const port = p.ports.find(n => n.id === id); if (!port) throw new Error(`Unknown port ${id}`); return port;
}
export function connect(p, from, to, {replace = false} = {}) {
  const a = portAt(p,from), b = portAt(p,to);
  if (a.locked || b.locked) throw new Error('Unlock the affected ports before changing their mappings.');
  const previous = p.connections.filter(e => e.from === from || e.to === to);
  if (previous.some(e => e.locked || portAt(p,e.from).locked || portAt(p,e.to).locked)) throw new Error('A locked mapping cannot be replaced.');
  if (previous.length && !replace) throw new Error('Source or target is occupied. Enable Replace mapping to reassign.');
  if (rank(a.kind) >= rank(b.kind)) throw new Error('Connections must point forward through the stack.');
  if (!p.rules.allowedStagePairs.some(([s,t]) => s === a.kind && t === b.kind)) throw new Error(`Stage ${a.kind} -> ${b.kind} is not allowed by the rules.`);
  p.connections = p.connections.filter(e => !previous.includes(e));
  let id = `link:${from}`, serial = 1;
  while (p.connections.some(e => e.id === id)) id = `link:${from}:${serial++}`;
  p.connections.push({id, from, to, net:'', locked:false});
}
export function disconnect(p, id) {
  const n = portAt(p,id), linked = p.connections.filter(e => e.from === id || e.to === id);
  if (n.locked || linked.some(e => e.locked || portAt(p,e.from).locked || portAt(p,e.to).locked)) throw new Error('Unlock the affected ports/mappings first.');
  p.connections = p.connections.filter(e => e.from !== id && e.to !== id);
}
