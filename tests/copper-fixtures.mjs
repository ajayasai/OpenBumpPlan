import { fixture } from './helpers.mjs';
import { normalizeProject } from '../src/core/model.js';
import { routingDesignKey } from '../src/core/routing.js';

export const fineTechnology = {units:'um', traceWidth:0.2, viaDiameter:0.3, padDiameter:0.4, clearance:0.2};

/** Analytically constructed L routes, not optimizer-generated success cases.
 * Every site has its own 8x8 cell; reserved sites exercise obstacle indexing.
 * More than 512 routes are COPPER-ONLY tests, outside the router's declared cap.
 */
export function copperArray(routeCount, cellCount = routeCount) {
  if (!Number.isInteger(routeCount) || routeCount < 1 || !Number.isInteger(cellCount) ||
      cellCount < routeCount || cellCount > 4096) throw new Error('Invalid copper array dimensions.');
  const side = Math.ceil(Math.sqrt(cellCount)), p = fixture();
  p.name = `Synthetic ${routeCount}-route ${cellCount * 2}-site copper array`;
  p.ports = []; p.connections = [];
  const routes = [];
  for (let i = 0; i < cellCount; i++) {
    const x = (i % side) * 8 + 1, y = Math.floor(i / side) * 8 + 1;
    if (i < routeCount) {
      p.ports.push({id:`s${i}`, kind:'pad', x, y, net:`N${i}`, domain:'V1', role:'signal', required:true},
        {id:`t${i}`, kind:'ball', x:x+3, y:y+3, role:'any'});
      p.connections.push({id:`e${i}`, from:`s${i}`, to:`t${i}`});
      routes.push({connectionId:`e${i}`, path:[[x,y,0],[x+1,y,0],[x+2,y,0],[x+3,y,0],
        [x+3,y+1,0],[x+3,y+2,0],[x+3,y+3,0]]});
    } else {
      p.ports.push({id:`r${i}a`, kind:'pad', x, y, role:'reserved'},
        {id:`r${i}b`, kind:'ball', x:x+3, y:y+3, role:'reserved'});
    }
  }
  const project = normalizeProject(p);
  const config = {fromKind:'pad', toKind:'ball', pitch:1, layers:1, clearance:0, viaCost:4,
    startLayer:0, endLayer:0, originX:0, originY:0, columns:side*8, rows:side*8};
  const witness = {type:'openbumpplan-route-witness', schemaVersion:1, designKey:routingDesignKey(project),
    config, routes, metrics:{routed:routeCount, wireLength:routeCount*6, vias:0}};
  return {project, witness, technology:{...fineTechnology}};
}
