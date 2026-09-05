import test from 'node:test';import assert from 'node:assert/strict';
import { normalizeProject,assertProject,clone,effectiveSignals,transformPoint,inversePoint,worldPoint,indexProject,connect,disconnect,fingerprint,tracePath } from '../src/core/model.js';
import { fixture } from './helpers.mjs';
test('canonical project validates',()=>assert.equal(assertProject(fixture()).units,'um'));
for(const [label,mutate] of [
 ['unknown version',p=>p.schemaVersion=2],['noncanonical units',p=>p.units='mm'],['duplicate port IDs',p=>p.ports.push(clone(p.ports[0]))],['dangling endpoints',p=>p.connections[0].to='missing'],['nonfinite coordinates',p=>p.ports[0].x=NaN],['unknown roles',p=>p.ports[0].role='supply'],['unknown die',p=>p.ports[0].dieId='missing'],['incomplete pair metadata',p=>p.ports[0].pair='P'],['negative spacing',p=>p.rules.minDomainSpacing=-1],['unknown rule typo',p=>p.rules.maxLenght=10],['invalid stage rule',p=>p.rules.allowedStagePairs=[['ball','pad']]],['noninteger clock quota',p=>p.rules.clockGroundMin=1.5],['invalid ground ratio',p=>p.rules.minGroundRatio=2],['unbounded geometry budget',p=>p.rules.geometryBudget=10000001],['unsafe control character',p=>p.ports[0].id='x\0y']])test(`rejects ${label}`,()=>{const p=fixture();mutate(p);assert.throws(()=>assertProject(p));});
for(const rotation of [0,90,180,270])for(const mirrorX of [false,true])test(`transform inverse R${rotation} mirror=${mirrorX}`,()=>{const d={x:17,y:-22,width:500,height:800,rotation,mirrorX},q={x:123.25,y:45.75};assert.deepEqual(inversePoint(transformPoint(q,d),d),q);});
test('signal metadata propagates through all stages',()=>{const p=fixture();p.ports.push({...p.ports[1],id:'pcb',kind:'pcb'});p.connections.push({id:'e2',from:'t',to:'pcb',net:'',locked:false});assert.equal(effectiveSignals(p).signals.get('pcb').net,'DATA');assert.deepEqual(tracePath(p,'s'),['s','t','pcb']);});
test('declared target metadata does not silently disappear',()=>{const p=fixture();p.ports[1].net='OTHER';assert.equal(effectiveSignals(p).signals.get('t').net,'OTHER');});
test('connect refuses occupied target without explicit replacement',()=>assert.throws(()=>connect(fixture(),'s','t'),/occupied/));
test('connect replaces mappings atomically in the mutable candidate',()=>{const p=fixture();connect(p,'s','t',{replace:true});assert.equal(p.connections.length,1);});
test('locked edge cannot be replaced',()=>{const p=fixture();p.connections[0].locked=true;assert.throws(()=>connect(p,'s','t',{replace:true}),/locked/);});
test('locked target cannot be disconnected',()=>{const p=fixture();p.ports[1].locked=true;assert.throws(()=>disconnect(p,'s'),/Unlock/);});
test('backward connections are refused',()=>assert.throws(()=>connect(fixture(),'t','s',{replace:true}),/forward/));
test('review fingerprint ignores revision/audit and array order',()=>{const p=fixture(),q=clone(p);q.ports.reverse();q.revision=10;q.audit=[{time:'now',action:'review'}];assert.equal(fingerprint(p),fingerprint(q));});
test('fingerprint changes with geometry',()=>{const p=fixture(),q=clone(p);q.ports[0].x++;assert.notEqual(fingerprint(p),fingerprint(q));});
test('normalizer does not modify input',()=>{const p=fixture(),text=JSON.stringify(p);normalizeProject(p);assert.equal(JSON.stringify(p),text);});
