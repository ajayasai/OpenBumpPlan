import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {routedHandoffDemo} from '../src/core/routed-demo.js';
const cli=(...args)=>spawnSync(process.execPath,['scripts/routed-kicad.mjs',...args],{encoding:'utf8',timeout:30000});
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'bump-native-cli-')),d=routedHandoffDemo();const files=['project','witness','technology','specification'].map(k=>{const f=path.join(root,k+'.json');fs.writeFileSync(f,JSON.stringify(d[k]));return f;});try{fn({root,d,files,out:path.join(root,'export')});}finally{fs.rmSync(root,{recursive:true,force:true});}}
test('CLI exports complete source-bound handoff and independently replays with original inputs',()=>fixture(({files,out})=>{const r=cli('export',...files,out);assert.equal(r.status,0,r.stderr);assert.equal(fs.readdirSync(out).length,7);const v=cli('verify',...files,path.join(out,'routed.kicad_pcb'),path.join(out,'receipt.json'));assert.equal(v.status,0,v.stderr);assert.equal(JSON.parse(v.stdout).ok,true);}));
test('CLI never overwrites an existing directory or its user data',()=>fixture(({files,out})=>{fs.mkdirSync(out);fs.writeFileSync(path.join(out,'important'),'retain');const r=cli('export',...files,out);assert.equal(r.status,2);assert.equal(fs.readFileSync(path.join(out,'important'),'utf8'),'retain');assert.deepEqual(fs.readdirSync(out),['important']);}));
test('CLI rejects corrupt JSON before creating output',()=>fixture(({files,out})=>{fs.writeFileSync(files[0],'{');assert.equal(cli('export',...files,out).status,2);assert.equal(fs.existsSync(out),false);}));
test('CLI partial witness cannot produce a native board',()=>fixture(({files,out,d})=>{d.witness.routes.pop();fs.writeFileSync(files[1],JSON.stringify(d.witness));assert.equal(cli('export',...files,out).status,2);assert.equal(fs.existsSync(out),false);}));
test('CLI native board tampering is a verification failure',()=>fixture(({files,out})=>{assert.equal(cli('export',...files,out).status,0);const board=path.join(out,'routed.kicad_pcb');fs.appendFileSync(board,'(segment)');assert.equal(cli('verify',...files,board,path.join(out,'receipt.json')).status,1);}));
test('CLI explicit missing specification and unknown commands report usage error',()=>{assert.equal(cli('export').status,2);assert.equal(cli('unknown').status,2);assert.equal(cli('--help').status,0);});
