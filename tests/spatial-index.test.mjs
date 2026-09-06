import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSpatialIndex, nearbyIndices } from '../src/core/spatial-index.js';
import { boxDistance } from '../src/core/copper.js';
import { seeded } from './helpers.mjs';

const point = (x,y,radius=0) => ({minX:x,maxX:x,minY:y,maxY:y,radius});

test('spatial index is deterministic, non-mutating, and handles empty input', () => {
  const boxes = [point(4,0,1),point(0,0,1),point(2,0,1)], saved = structuredClone(boxes);
  const index=buildSpatialIndex(boxes);
  assert.deepEqual(boxes,saved);
  assert.deepEqual(nearbyIndices(index,point(2,0,1)),[0,1,2]);
  assert.deepEqual(buildSpatialIndex(boxes),index);
  assert.deepEqual(nearbyIndices(buildSpatialIndex([]),point(0,0)),[]);
});

test('inclusive broad phase retains exact contact and tolerance-near pairs', () => {
  const boxes=[point(2,0,1),point(2+0.5e-8,0,1),point(2+2e-8,0,1)];
  assert.deepEqual(nearbyIndices(buildSpatialIndex(boxes),point(0,0,1),1e-8),[0,1]);
});

for(let seed=1;seed<=40;seed++) test(`spatial candidates include every brute-force collision, seed ${seed}`,()=>{
  const rand=seeded(seed), boxes=[];
  for(let i=0;i<120;i++){
    const x=(rand()-.5)*500,y=(rand()-.5)*500,l=rand()*90;
    boxes.push({minX:x,maxX:x+(i%3===0?l:0),minY:y,maxY:y+(i%3===1?l:0),radius:rand()*15});
  }
  const index=buildSpatialIndex(boxes);
  for(const q of boxes){
    const padding=rand()*20, candidates=new Set(nearbyIndices(index,q,padding+1e-8));
    boxes.forEach((b,i)=>{if(boxDistance(q,b)<=q.radius+b.radius+padding+1e-8)assert.ok(candidates.has(i),`missing pair ${i}`);});
  }
});

for(const scale of [1e-5,1,1e7,1e12]) test(`outward rounding never drops a boundary pair at scale ${scale}`,()=>{
  const rand=seeded(431),boxes=[];
  for(let i=0;i<100;i++)boxes.push(point(rand()*scale,rand()*scale,rand()*scale));
  const index=buildSpatialIndex(boxes);
  for(const q of boxes)for(const b of boxes){
    const padding=Math.max(0,boxDistance(q,b)-q.radius-b.radius);
    const ids=nearbyIndices(index,q,padding+1e-8);
    if(boxDistance(q,b)<=q.radius+b.radius+padding+1e-8)assert.ok(ids.includes(boxes.indexOf(b)));
  }
});

test('construction and traversal both honor the caller work budget',()=>{
  let work=0;const spend=()=>{if(++work>3)throw new Error('work limit');};
  assert.throws(()=>buildSpatialIndex(Array.from({length:16},(_,i)=>point(i,0)),spend),/work limit/);
  const index=buildSpatialIndex(Array.from({length:16},(_,i)=>point(i,0)));
  work=0;assert.throws(()=>nearbyIndices(index,point(5,0,100),0,spend),/work limit/);
});
for(const bad of [null,{},point(NaN,0),point(0,Infinity),point(0,0,-1),{...point(0,0),minX:1}])
 test(`invalid spatial boxes are rejected: ${JSON.stringify(bad)}`,()=>assert.throws(()=>buildSpatialIndex([bad])));
for(const padding of [-1,NaN,Infinity])test(`invalid spatial padding ${padding}`,()=>assert.throws(()=>nearbyIndices(null,point(0,0),padding)));
