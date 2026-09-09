import test from 'node:test';
import assert from 'node:assert/strict';
import { importKiCad } from '../src/core/terminal-interop.js';
const board=(version,net,table='')=>`(kicad_pcb ${version?`(version ${version})`:''} ${table}
 (footprint "Fixture" (layer "F.Cu") (at 0 0) (property "Reference" "U1")
 (pad "A1" smd circle (at 1 2) (size .25 .25) (layers "F.Cu" "F.Mask") ${net})))`;
for(const revision of ['20251028','20251101','20260101','20260206'])test(`version ${revision} imports exact named net without internal net code`,()=>{
 const r=importKiCad(board(revision,'(net "SIG(1) தமிழில்")'));
 assert.equal(r.project.ports[0].net,'SIG(1) தமிழில்');assert.equal(r.project.ports[0].x,1000);assert.equal(r.project.ports[0].y,-2000);
});
for(const revision of ['20221018','20240108','20251027',null])test(`legacy ${revision} still resolves net code and checks its name`,()=>{
 assert.equal(importKiCad(board(revision,'(net 2 "SIG")','(net 2 "SIG")')).project.ports[0].net,'SIG');
 assert.throws(()=>importKiCad(board(revision,'(net 2 "WRONG")','(net 2 "SIG")')),/mismatched/);
 assert.throws(()=>importKiCad(board(revision,'(net "SIG")')),/Invalid pad net/);
});
for(const name of ['','0','001','SIG ") (pad','🧪'])test(`name-only net string identity ${JSON.stringify(name)} is not interpreted as a code`,()=>{
 const r=importKiCad(board('20260206',`(net ${JSON.stringify(name)})`));assert.equal(r.project.ports[0].net,name);
});
for(const value of ['20260616','20270101','not-a-version','2026','202602060'])test(`unsupported/malformed version ${value} fails instead of guessing transforms`,()=>{
 assert.throws(()=>importKiCad(board(value,'(net "SIG")')),/format revision/);
});
test('mixed legacy declarations are rejected in modern named-net files',()=>{
 assert.throws(()=>importKiCad(board('20260206','(net "SIG")','(net 2 "SIG")')),/legacy net table/);
 assert.throws(()=>importKiCad(board('20260206','(net 2 "SIG")')),/name-only/);
});
test('duplicate version and duplicate pad net fields are not silently selected',()=>{
 assert.throws(()=>importKiCad(board('20260206) (version 20221018','(net "SIG")')));
 assert.throws(()=>importKiCad(board('20260206','(net "SIG") (net "OTHER")')));
});
