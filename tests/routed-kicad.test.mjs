import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { exportRoutedKiCad, verifyRoutedKiCad } from '../src/core/routed-kicad.js';
import { routedHandoffDemo } from '../src/core/routed-demo.js';
import { routeStage, routingDesignKey } from '../src/core/routing.js';
import { normalizeProject, clone } from '../src/core/model.js';
import { parseSExpression, children } from '../src/core/sexpr.js';
const sha=s=>createHash('sha256').update(s).digest('hex');
const build=d=>exportRoutedKiCad(d.project,d.witness,d.technology,d.specification);
const verify=(d,b,r)=>verifyRoutedKiCad(d.project,d.witness,d.technology,b,r,d.specification);

test('routed native handoff includes actual compact copper, pads, vias, keepout and closed outline',()=>{
 const d=routedHandoffDemo(),before=clone(d),r=build(d),tree=parseSExpression(r.board);
 assert.deepEqual(r.receipt.counts,{pads:5,segments:4,vias:2,keepouts:1});
 assert.equal(children(tree,'segment').length,4);assert.equal(children(tree,'via').length,2);
 assert.equal(children(tree,'zone').length,1);assert.equal(children(tree,'gr_line').length,4);
 assert.equal(r.receipt.metrics.wireLengthUm,16000);assert.equal(verify(d,r.board,r.receipt).ok,true);
 assert.deepEqual(d,before);assert.deepEqual(build(d),r);
});
for(const [name,change] of [
 ['track width',s=>s.replace('(width 0.250000)','(width 0.750000)')],
 ['via drill',s=>s.replace('(drill 0.300000)','(drill 0.500000)')],
 ['pad position',s=>s.replace('(at -6.000000 -2.000000)','(at -6.001000 -2.000000)')],
 ['net swap',s=>s.replace('(net 1 "HORIZONTAL")','(net 1 "WRONG")')],
 ['extra trace',s=>s.replace(/\)\s*$/, '(segment (start 0 0) (end 1 0) (width 1) (layer "F.Cu") (net 1)))')],
 ['removed via',s=>s.replace(/^.*\(via \(at.*\n/m,'')],
 ['removed keepout',s=>s.replace(/^.*\(zone \(net.*\n/m,'')],
 ['removed outline',s=>s.replace(/^.*\(gr_line \(start.*\n/m,'')],
 ['changed layer',s=>s.replace('(layer "B.Cu") (net 2)','(layer "F.Cu") (net 2)')],
]) test(`native structural replay rejects ${name} even after adversary rehashes the receipt`,()=>{
 const d=routedHandoffDemo(),r=build(d),board=change(r.board);assert.notEqual(board,r.board);
 r.receipt.boardSHA256=sha(board);assert.equal(verify(d,board,r.receipt).ok,false);
});
for(const [name,change] of [
 ['source',d=>d.project.name='Changed project'],
 ['route endpoint',d=>d.witness.routes[0].path.shift()],
 ['route omission',d=>d.witness.routes.pop()],
 ['false route metrics',d=>d.witness.metrics.vias=0],
 ['technology',d=>d.technology.traceWidth=251],
 ['specification',d=>d.specification.viaDrill=301],
]) test(`handoff cannot replay against changed ${name}`,()=>{
 const d=routedHandoffDemo(),r=build(d);change(d);assert.equal(verify(d,r.board,r.receipt).ok,false);
});
for(const value of [null,{},[],{viaDrill:300,boardThickness:1600,edgeMargin:1000,ignoreErrors:true}])test(`explicit specification required ${JSON.stringify(value)}`,()=>{
 const d=routedHandoffDemo();d.specification=value;assert.throws(()=>build(d));
});
for(const key of ['viaDrill','boardThickness','edgeMargin'])for(const value of [0,-1,NaN,Infinity,0.0001])test(`reject invalid/sub-nm ${key} ${value}`,()=>{
 const d=routedHandoffDemo();d.specification[key]=value;assert.throws(()=>build(d));
});
test('oversized drill and unsupported stack cannot become implicit safe defaults',()=>{
 const d=routedHandoffDemo();d.specification.viaDrill=600;assert.throws(()=>build(d),/smaller/);
 d.specification.viaDrill=300;d.witness.config.layers=3;assert.throws(()=>build(d),/one or two/);
});
test('fabricated passing flags do not override stale routes or failing copper',()=>{
 const d=routedHandoffDemo();d.witness.verified=true;d.witness.copperVerification={ok:true};d.technology.viaDiameter=8000;
 assert.throws(()=>build(d),/checks must both pass/);
});
test('receipt cannot replace identities, counts or source checks',()=>{
 const d=routedHandoffDemo(),r=build(d);r.receipt.counts.segments=0;assert.equal(verify(d,r.board,r.receipt).ok,false);
 r.receipt.counts.segments=4;r.receipt.approved=true;assert.equal(verify(d,r.board,r.receipt).ok,false);
});
test('format-only whitespace may be rehashed; native semantic changes may not',()=>{
 const d=routedHandoffDemo(),r=build(d),board='; external formatting only\n'+r.board.replaceAll('\n','\n\n');
 r.receipt.boardSHA256=sha(board);assert.equal(verify(d,board,r.receipt).ok,true);
});
test('unrepresentable technology and native coordinate overflow are rejected',()=>{
 const d=routedHandoffDemo();d.technology.traceWidth=250.0001;assert.throws(()=>build(d),/1 nm/);
 d.technology.traceWidth=250;d.specification.edgeMargin=1999999;assert.throws(()=>build(d),/outline/);
});
for(let seed=0;seed<12;seed++)test(`parallel native geometry fixture ${seed}: exact lengths, compact traces and front/back endpoints`,()=>{
 const d=routedHandoffDemo(),n=seed+1;d.project.keepouts=[];d.project.ports=[];d.project.connections=[];
 for(let i=0;i<n;i++){
  d.project.ports.push({id:'s'+i,kind:'pad',x:-5000,y:i*3000,net:'N'+i,role:'any'},{id:'t'+i,kind:'ball',x:5000,y:i*3000,role:'any'});
  d.project.connections.push({id:'e'+i,from:'s'+i,to:'t'+i});
 }
 d.project=normalizeProject(d.project);d.witness=routeStage(d.project,'pad','ball',{pitch:1000,layers:2,startLayer:seed%2,endLayer:seed%2});
 const r=build(d);assert.equal(r.receipt.counts.segments,n);assert.equal(r.receipt.counts.pads,2*n);
 assert.equal(r.receipt.counts.vias,0);assert.equal(r.receipt.metrics.wireLengthUm,n*10000);assert.equal(verify(d,r.board,r.receipt).ok,true);
});
test('disconnected source branches cannot masquerade as one complete native net',()=>{
 const d=routedHandoffDemo();d.project.ports[2].net='HORIZONTAL';d.witness.designKey=routingDesignKey(d.project);
 assert.throws(()=>build(d),/Multiple routed branches/);
});
test('Unicode/quoted native net identifiers round trip without structural injection',()=>{
 const d=routedHandoffDemo();d.project.ports[0].net='தமிழ் ") (segment';d.witness.designKey=routingDesignKey(d.project);
 const r=build(d);assert.equal(verify(d,r.board,r.receipt).ok,true);assert.equal(children(parseSExpression(r.board),'segment').length,4);
});
