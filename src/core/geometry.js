export const EPS = 1e-8;
export const manhattan = (a,b) => Math.abs(a.x-b.x) + Math.abs(a.y-b.y);
export const euclidean = (a,b) => Math.hypot(a.x-b.x, a.y-b.y);
export const insideRect = (p,r) => p.x >= r.x-EPS && p.x <= r.x+r.width+EPS && p.y >= r.y-EPS && p.y <= r.y+r.height+EPS;
const orient = (a,b,c) => (b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x);
/** Proper straight-ratsnest crossings; endpoint contacts are not crossings. */
export function segmentRelation(a,b,c,d) {
  if (manhattan(a,b) < EPS || manhattan(c,d) < EPS) return null;
  const o1 = orient(a,b,c), o2 = orient(a,b,d), o3 = orient(c,d,a), o4 = orient(c,d,b);
  const tol = EPS * Math.max(1, manhattan(a,b), manhattan(c,d));
  if ((o1 > tol && o2 < -tol || o1 < -tol && o2 > tol) && (o3 > tol && o4 < -tol || o3 < -tol && o4 > tol)) return 'cross';
  if ([o1,o2,o3,o4].every(v => Math.abs(v) <= tol)) {
    const k = Math.abs(a.x-b.x) >= Math.abs(a.y-b.y) ? 'x' : 'y';
    const overlap = Math.min(Math.max(a[k],b[k]), Math.max(c[k],d[k])) - Math.max(Math.min(a[k],b[k]), Math.min(c[k],d[k]));
    return overlap > EPS ? 'overlap' : null;
  }
  return null;
}
/** Bounding-box sweep. Budget exhaustion is explicit: no false "all clear". */
export function crossingAnalysis(segments, budget = 1000000) {
  const sorted = segments.map(s => ({...s, minX:Math.min(s.a.x,s.b.x), maxX:Math.max(s.a.x,s.b.x), minY:Math.min(s.a.y,s.b.y), maxY:Math.max(s.a.y,s.b.y)}))
    .sort((a,b) => a.minX-b.minX || a.id.localeCompare(b.id));
  let active = [], comparisons = 0, crossings = 0, overlaps = 0; const examples = [];
  for (const s of sorted) {
    active = active.filter(t => t.maxX >= s.minX-EPS);
    for (const t of active) {
      if (++comparisons > budget) return {crossings, overlaps, comparisons:budget, complete:false, examples};
      if (s.stage !== t.stage || s.minY > t.maxY+EPS || t.minY > s.maxY+EPS || s.net && s.net === t.net || s.from === t.from || s.from === t.to || s.to === t.from || s.to === t.to) continue;
      const relation = segmentRelation(s.a,s.b,t.a,t.b);
      if (relation === 'cross') crossings++;
      if (relation === 'overlap') overlaps++;
      if (relation && examples.length < 100) examples.push({a:s.id,b:t.id,type:relation});
    }
    active.push(s);
  }
  return {crossings, overlaps, comparisons, complete:true, examples};
}
export class SpatialIndex {
  constructor(items, radius) {
    this.cell = Math.max(radius, 1); this.cells = new Map();
    for (const item of items) {
      const k = this.key(Math.floor(item.x/this.cell),Math.floor(item.y/this.cell));
      if (!this.cells.has(k)) this.cells.set(k,[]); this.cells.get(k).push(item);
    }
  }
  key(x,y) { return `${x},${y}`; }
  near(point, radius) {
    const found = [], loX=Math.floor((point.x-radius)/this.cell), hiX=Math.floor((point.x+radius)/this.cell), loY=Math.floor((point.y-radius)/this.cell), hiY=Math.floor((point.y+radius)/this.cell);
    for (let x=loX;x<=hiX;x++) for(let y=loY;y<=hiY;y++) for(const item of this.cells.get(this.key(x,y)) || []) if(euclidean(point,item) <= radius+EPS) found.push(item);
    return found;
  }
}
