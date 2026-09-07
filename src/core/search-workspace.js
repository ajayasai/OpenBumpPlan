/** Reusable A* arrays. Generation stamps make untouched cells logically empty
 * without allocating/filling a complete grid for every routed net. Search order,
 * costs and heap tie-breaking are deliberately unchanged. This is scratch state,
 * never evidence: final paths still go through independent grid/copper checks. */
export class SearchWorkspace {
  constructor(count) {
    if (!Number.isInteger(count) || count < 1 || count > 262144) {
      throw new Error('Search workspace requires 1 to 262144 grid cells.');
    }
    this.distance = new Float64Array(count);
    this.previous = new Int32Array(count);
    this.seen = new Uint32Array(count);
    this.closed = new Uint32Array(count);
    this.epoch = 0;
    this.searches = 0;
    this.fullResets = 0;
    this.initializedNodes = 0;
  }
  begin() {
    // A wrap must not resurrect state from an old search, including closed nodes.
    this.epoch = (this.epoch + 1) >>> 0;
    if (this.epoch === 0) {
      this.seen.fill(0);
      this.closed.fill(0);
      this.epoch = 1;
      this.fullResets++;
    }
    this.searches++;
    return this.epoch;
  }
  touch(node, distance, previous) {
    if (this.seen[node] !== this.epoch) this.initializedNodes++;
    this.seen[node] = this.epoch;
    this.distance[node] = distance;
    this.previous[node] = previous;
  }
  stats() {
    return {algorithm:'generation-stamped-astar-v1', workspaces:1,
      searches:this.searches, initializedNodes:this.initializedNodes,
      fullResets:this.fullResets, scratchBytes:this.distance.byteLength+
        this.previous.byteLength+this.seen.byteLength+this.closed.byteLength};
  }
}
