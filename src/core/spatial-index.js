/** Deterministic, conservative broad phase for continuous copper geometry.
 * This module never declares clearance to be satisfied. It only removes pairs
 * whose enclosing boxes are too far apart even at the largest enclosed radius.
 * The independent capsule/disc distance calculation remains the authority.
 *
 * A caller-supplied work meter bounds both construction and traversal. Results
 * are original input indices, sorted to make diagnostic ordering reproducible.
 */
const LEAF_SIZE = 8;
const MAX_OBJECTS = 1_000_000;

function checkedBox(value) {
  if (!value || !['minX', 'maxX', 'minY', 'maxY', 'radius'].every(k => Number.isFinite(value[k])) ||
      value.minX > value.maxX || value.minY > value.maxY || value.radius < 0) {
    throw new Error('Invalid continuous-geometry spatial box.');
  }
  return {minX:value.minX, maxX:value.maxX, minY:value.minY, maxY:value.maxY, radius:value.radius};
}

export function buildSpatialIndex(objects, spend = () => {}) {
  if (!Array.isArray(objects) || objects.length > MAX_OBJECTS || typeof spend !== 'function') {
    throw new Error('Invalid or oversized continuous-geometry spatial index.');
  }
  const entries = objects.map((object, index) => {
    spend();
    return {...checkedBox(object), index};
  });
  function build(items) {
    if (!items.length) return null;
    const bounds = {minX:Infinity, maxX:-Infinity, minY:Infinity, maxY:-Infinity, radius:0};
    for (const item of items) {
      spend();
      bounds.minX = Math.min(bounds.minX, item.minX);
      bounds.maxX = Math.max(bounds.maxX, item.maxX);
      bounds.minY = Math.min(bounds.minY, item.minY);
      bounds.maxY = Math.max(bounds.maxY, item.maxY);
      bounds.radius = Math.max(bounds.radius, item.radius);
    }
    if (items.length <= LEAF_SIZE) return {...bounds, items};
    const axis = bounds.maxX - bounds.minX >= bounds.maxY - bounds.minY ? 'X' : 'Y';
    const center = a => a['min' + axis] / 2 + a['max' + axis] / 2;
    items.sort((a, b) => center(a) - center(b) || a.index - b.index);
    const middle = Math.floor(items.length / 2);
    return {...bounds, left:build(items.slice(0, middle)), right:build(items.slice(middle))};
  }
  return build(entries);
}

function possible(a, b, padding) {
  // Compare coordinate gaps instead of rounding inflated box boundaries. Each
  // gap is a lower bound on centerline distance; b.radius is an upper bound for
  // every descendant. Inclusive tests deliberately retain boundary contact.
  const sum = a.radius + b.radius + padding;
  // Outward allowance also covers the different floating-point grouping of
  // (rA + rB + clearance) + tolerance in the narrow phase.
  const radius = sum + 8 * Number.EPSILON * Math.max(1, a.radius, b.radius, padding);
  const dx = Math.max(0, a.minX - b.maxX, b.minX - a.maxX);
  const dy = Math.max(0, a.minY - b.maxY, b.minY - a.maxY);
  return dx <= radius && dy <= radius;
}

export function nearbyIndices(index, object, padding = 0, spend = () => {}) {
  const query = checkedBox(object);
  if (!Number.isFinite(padding) || padding < 0 || typeof spend !== 'function') {
    throw new Error('Invalid continuous-geometry spatial query.');
  }
  const result = [], stack = index ? [index] : [];
  while (stack.length) {
    spend();
    const node = stack.pop();
    if (!possible(query, node, padding)) continue;
    if (node.items) {
      for (const item of node.items) {
        spend();
        if (possible(query, item, padding)) result.push(item.index);
      }
    } else {
      stack.push(node.right, node.left);
    }
  }
  return result.sort((a, b) => a - b);
}
