import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { routingDemoProject } from '../src/core/demo.js';
import { routePhysical } from '../src/core/physical-routing.js';
import { createReviewBundle, verifyReviewBundle, sha256 } from '../src/core/evidence.js';
import { signReview, verifySignedReview } from '../scripts/signing.mjs';
const technology={units:'um',traceWidth:1,viaDiameter:2,padDiameter:2,clearance:1};
function physical(){const p=routingDemoProject(),routing=routePhysical(p,'pad','ball',{pitch:10,layers:2,viaCost:10,technology});return {p,routing};}
test('physical evidence binds and rechecks declared technology',async()=>{
 const {p,routing}=physical(),b=await createReviewBundle(p,{routing});assert.equal(b.manifest.copperPass,true);
 const checked=await verifyReviewBundle(b,{expectedTechnology:technology});assert.equal(checked.valid,true);assert.equal(checked.copperPass,true);
 assert.equal((await verifyReviewBundle(b,{expectedTechnology:{...technology,traceWidth:2}})).valid,false);
});
test('a rehashed bogus copper check cannot bypass recomputation',async()=>{
 const {p,routing}=physical(),b=await createReviewBundle(p,{routing});b.payload.copperVerification.metrics.wireLength=0;
 b.manifest.digests.copperVerification=await sha256(b.payload.copperVerification);b.manifestSHA256=await sha256(b.manifest);
 assert.equal((await verifyReviewBundle(b)).valid,false);
});
test('deleting technology cannot satisfy an independently expected physical contract',async()=>{
 const {p,routing}=physical();delete routing.technology;const b=await createReviewBundle(p,{routing});assert.equal(b.manifest.copperPass,null);
 assert.equal((await verifyReviewBundle(b,{expectedTechnology:technology})).valid,false);
});
test('grid-valid but oversized copper cannot receive a review bundle',async()=>{
 const {p,routing}=physical();routing.technology.viaDiameter=100;await assert.rejects(()=>createReviewBundle(p,{routing}),/copper/);
});
test('signed physical pass flags survive correct key and clear on wrong key',async()=>{
 const {p,routing}=physical(),key=generateKeyPairSync('ed25519'),other=generateKeyPairSync('ed25519');
 const b=await signReview(await createReviewBundle(p,{routing}),key.privateKey.export({type:'pkcs8',format:'pem'}));
 const good=await verifySignedReview(b,key.publicKey.export({type:'spki',format:'pem'}),{expectedTechnology:technology});assert.equal(good.copperPass,true);
 const bad=await verifySignedReview(b,other.publicKey.export({type:'spki',format:'pem'}));assert.equal(bad.copperPass,false);assert.equal(bad.valid,false);
});
function cli(args){return spawnSync(process.execPath,['scripts/cli.mjs',...args],{encoding:'utf8'});}
test('certified CLI and independent proof round trip; corrupt proof rejected',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'obp-v03-'));try{
  const output=path.join(tmp,'out.json'),proof=path.join(tmp,'proof.json');
  const result=cli(['solve-certified','examples/pair-bottleneck.json',output,'--proof',proof]);assert.equal(result.status,0,result.stderr);
  assert.equal(cli(['verify-coupled','examples/pair-bottleneck.json',proof]).status,0);
  const data=JSON.parse(fs.readFileSync(proof,'utf8'));data.records[0].certificate.objectiveTicks++;fs.writeFileSync(proof,JSON.stringify(data));
  assert.equal(cli(['verify-coupled','examples/pair-bottleneck.json',proof]).status,1);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('resource-limited CLI writes no misleading candidate file',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'obp-v03-'));try{
  const output=path.join(tmp,'out.json');const r=cli(['solve-certified','examples/pair-bottleneck.json',output,'--subproblems','1']);
  assert.equal(r.status,1);assert.equal(fs.existsSync(output),false);assert.equal(JSON.parse(r.stdout).status,'unknown');
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
test('physical route CLI requires external technology and verifies round trip',()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'obp-v03-'));try{
  const routes=path.join(tmp,'routes.json'),tech=path.join(tmp,'tech.json');fs.writeFileSync(tech,JSON.stringify(technology));
  const r=cli(['route-physical','examples/routing-laboratory.json',routes,'--pitch','10','--via-cost','10','--technology',tech]);assert.equal(r.status,0,r.stderr+r.stdout);
  assert.equal(cli(['verify-copper','examples/routing-laboratory.json',routes,'--technology',tech]).status,0);
  assert.equal(cli(['verify-copper','examples/routing-laboratory.json',routes]).status,2);
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
