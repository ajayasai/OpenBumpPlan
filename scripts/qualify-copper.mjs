#!/usr/bin/env node
/** Fixed, reproducible synthetic protocol; no commercial comparison or routing-generation claim. */
import fs from 'node:fs';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import assert from 'node:assert/strict';
import { VERSION, stableStringify } from '../src/core/model.js';
import { verifyCopper } from '../src/core/copper.js';
import { verifyCopper as previousCopper } from '../tests/oracles/copper-v030.mjs';
import { verifyRoutes } from '../src/core/routing.js';
import { createReviewBundle, verifyReviewBundle } from '../src/core/evidence.js';
import { copperArray } from '../tests/copper-fixtures.mjs';

const digest = value => createHash('sha256').update(typeof value === 'string' ? value : stableStringify(value)).digest('hex');
const fileDigest = name => createHash('sha256').update(fs.readFileSync(name)).digest('hex');
const median = values => [...values].sort((a,b) => a-b)[Math.floor(values.length / 2)];
const semantic = ({comparisons, spatialVisits, algorithm, ...rest}) => rest;
const budgets = {maxComparisons:2_000_000, maxSpatialVisits:10_000_000};
const cases = [];
for (const [routeCount, cellCount] of [[64,64],[256,256],[512,512],[512,4096],[1024,1024],[4096,4096]]) {
  const input = copperArray(routeCount, cellCount), {project,witness,technology} = input;
  const oldRun = () => previousCopper(project,witness,technology,{maxComparisons:budgets.maxComparisons});
  const newRun = () => verifyCopper(project,witness,technology,budgets);
  const previous = oldRun(), current = newRun(); // One unmeasured warm-up each.
  assert.equal(current.complete,true); assert.equal(current.ok,true);
  if (previous.complete) assert.deepEqual(semantic(current),semantic(previous));
  const samples = {previous:[],current:[]};
  for (let repetition=0; repetition<5; repetition++) {
    const order = repetition % 2 ? [['current',newRun],['previous',oldRun]] : [['previous',oldRun],['current',newRun]];
    for (const [name,run] of order) {
      const start = performance.now(), value = run(), elapsed = performance.now()-start;
      assert.deepEqual(value,name==='previous'?previous:current);
      samples[name].push(elapsed);
    }
  }
  let endToEnd = null;
  if (routeCount <= 512) {
    assert.equal(verifyRoutes(project,witness).ok,true);
    const routing = {...witness,technology};
    const bundle = await createReviewBundle(project,{routing});
    const verified = await verifyReviewBundle(bundle,{expectedTechnology:technology});
    assert.equal(verified.valid,true); assert.equal(verified.copperPass,true);
    endToEnd = {gridPass:true,reviewReplayPass:true};
  } else {
    // The copper checker is not the route generator or its bounded grid verifier.
    assert.equal(verifyRoutes(project,witness).ok,false);
  }
  const row = {
    routes:routeCount,sites:project.ports.length,inputSHA256:digest(input),
    scope:routeCount<=512?'supported-grid-and-review':'supplied-witness-copper-only; exceeds the 512-route grid/router limit',
    budgets,previous:{ok:previous.ok,complete:previous.complete,comparisons:previous.comparisons,rawMilliseconds:samples.previous,medianMilliseconds:median(samples.previous)},
    current:{ok:current.ok,complete:current.complete,comparisons:current.comparisons,spatialVisits:current.spatialVisits,rawMilliseconds:samples.current,medianMilliseconds:median(samples.current)},
    semanticAgreement:previous.complete?true:null,
    speedupWhenBothComplete:previous.complete?median(samples.previous)/median(samples.current):null,endToEnd
  };
  cases.push(row);
  console.log(JSON.stringify({routes:row.routes,sites:row.sites,oldComplete:previous.complete,newComplete:current.complete,oldMedianMs:row.previous.medianMilliseconds,newMedianMs:row.current.medianMilliseconds,speedup:row.speedupWhenBothComplete}));
}
const {project,witness,technology} = copperArray(64);
const denseTechnology = {...technology,traceWidth:12,padDiameter:16};
const densePrevious = previousCopper(project,witness,denseTechnology), denseCurrent = verifyCopper(project,witness,denseTechnology);
assert.equal(densePrevious.complete,true); assert.deepEqual(semantic(denseCurrent),semantic(densePrevious)); assert.equal(denseCurrent.ok,false);
const spatialLimited = verifyCopper(project,witness,technology,{maxSpatialVisits:1});
const narrowLimited = verifyCopper(project,witness,denseTechnology,{maxComparisons:1});
for (const result of [spatialLimited,narrowLimited]) {assert.equal(result.ok,false);assert.equal(result.complete,false);}
const report = {
  type:'openbumpplan-copper-qualification',version:VERSION,algorithm:'aabb-bvh-v1',
  environment:{node:process.version,platform:process.platform,architecture:process.arch,cpu:os.cpus()[0]?.model},
  sourceSHA256:Object.fromEntries(['src/core/copper.js','src/core/spatial-index.js','tests/oracles/copper-v030.mjs','tests/copper-fixtures.mjs','scripts/qualify-copper.mjs'].map(p=>[p,fileDigest(p)])),
  protocol:{samples:5,warmups:1,clock:'performance.now; shared single process; alternating execution order',
    measuredOperation:'verifyCopper, including project validation and geometry construction; fixture generation and full review replay excluded from timers',
    workload:'Explicit, non-crossing L-shaped supplied witnesses on separated 8x8 cells; additional reserved pads in the 8192-site case. Not router-generated completions.',
    limits:'Same 2,000,000 narrow-phase cap for both versions; new checker additionally caps spatial work. Timings for incomplete old runs are not speedups or equivalent work.',
    interpretation:'Synthetic evidence against the frozen preceding OpenBumpPlan verifier, not commercial EDA, manufacturing signoff, worst-case complexity or browser-latency evidence.'},
  cases,adversarial:{dense:{semanticAgreement:true,issues:denseCurrent.totalIssues,accepted:false},spatialBudgetFailsClosed:!spatialLimited.complete,narrowBudgetFailsClosed:!narrowLimited.complete}
};
const destination = process.argv[2] || `docs/qualification-copper-v${VERSION}.json`;
fs.writeFileSync(destination,JSON.stringify(report,null,2)+'\n');
console.log(`Saved ${destination}`);
