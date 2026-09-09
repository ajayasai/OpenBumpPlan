import { children, singleton, identifier } from './sexpr.js';

/** KiCad stopped serializing internal net codes at format revision 20251028.
 * Later footprint affine transforms are not supported by this point adapter.
 * Revision history: KiCad pcb_io_kicad_sexpr.h, stable 10.0 format family.
 */
export function readKiCadNetContext(root, board) {
  const version = singleton(root, 'version');
  let revision = 0;
  if (version) {
    if (version.length !== 2 || !/^\d{8}$/.test(version[1])) throw new Error('Invalid KiCad format revision');
    revision = Number(version[1]);
    if (revision < 20170101 || revision > 20260206) throw new Error('Unsupported KiCad format revision; newer transforms must not be silently ignored');
  }
  const nameOnly = revision >= 20251028, nets = new Map(), names = new Set();
  if (board) for (const net of children(root, 'net')) {
    if (nameOnly) throw new Error('Unexpected legacy net table in name-only KiCad format');
    if (net.length !== 3 || !/^(0|[1-9]\d*)$/.test(net[1]) || !Number.isSafeInteger(Number(net[1]))) throw new Error('Invalid net declaration');
    identifier(net[2], 'net name', true);
    if (nets.has(net[1]) || names.has(net[2])) throw new Error('Duplicate net code/name');
    if ((net[1] === '0') !== (net[2] === '')) throw new Error('Net zero must be the empty net');
    nets.set(net[1], net[2]); names.add(net[2]);
  }
  return {revision, nameOnly, board, nets};
}

export function readKiCadPadNet(pad, context) {
  const net = singleton(pad, 'net');
  if (!net) return '';
  if (context.nameOnly) {
    if (net.length !== 2) throw new Error('Expected name-only pad net for this KiCad format revision');
    return identifier(net[1], 'pad net name', true);
  }
  if (net.length !== 3 || !/^(0|[1-9]\d*)$/.test(net[1]) || !Number.isSafeInteger(Number(net[1]))) throw new Error('Invalid pad net reference');
  const name = identifier(net[2], 'pad net name', true);
  if (context.board && !(net[1] === '0' && name === '' && !context.nets.has('0')) && context.nets.get(net[1]) !== name) throw new Error('Unresolved/mismatched pad net');
  return name;
}
