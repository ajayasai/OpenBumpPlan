import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { generateKeyPairSync } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const run=(...args)=>spawnSync(process.execPath,['scripts/cli.mjs',...args],{cwd:root,encoding:'utf8',timeout:15000});
function work(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'openbumpplan-test-'));try{return fn(dir);}finally{fs.rmSync(dir,{recursive:true,force:true});}}
test('CLI solve materializes a checked coupled solution and scoped report',()=>work(dir=>{
 const output=path.join(dir,'solved.json'),report=path.join(dir,'report.json');const r=run('solve','examples/pair-bottleneck.json',output,'--report',report);
 assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'optimal');assert.equal(run('check',output).status,0);assert.equal(JSON.parse(fs.readFileSync(report)).objective,300);
}));
test('CLI unknown/infeasible search does not create a pretend solution file',()=>work(dir=>{
 const output=path.join(dir,'no-solution.json'),r=run('solve','examples/pair-bottleneck.json',output,'--max-nodes','1');assert.equal(r.status,1);assert.equal(JSON.parse(r.stdout).status,'unknown');assert.equal(fs.existsSync(output),false);
}));
test('CLI route/verify/SVG pipeline returns independently checked witnesses',()=>work(dir=>{
 const file=path.join(dir,'routes.json'),svg=path.join(dir,'routes.svg');const r=run('route','examples/routing-laboratory.json',file,'--pitch','10','--layers','2','--via-cost','10','--svg',svg);
 assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(run('verify-routes','examples/routing-laboratory.json',file).status,0);assert.ok(fs.readFileSync(svg,'utf8').startsWith('<svg'));
}));
test('CLI route failure writes diagnostic evidence but exits nonzero',()=>work(dir=>{
 const file=path.join(dir,'partial.json'),r=run('route','examples/routing-laboratory.json',file,'--pitch','10','--max-expansions','1');assert.equal(r.status,1);assert.equal(JSON.parse(fs.readFileSync(file)).verified,false);assert.equal(run('verify-routes','examples/routing-laboratory.json',file).status,1);
}));
test('CLI bundle supports pinned-current-design validation',()=>work(dir=>{
 const file=path.join(dir,'bundle.json');assert.equal(run('bundle','examples/routing-laboratory.json',file).status,0);
 assert.equal(run('verify-bundle',file,'--project','examples/routing-laboratory.json').status,0);
 assert.equal(run('verify-bundle',file,'--project','examples/chiplet-demo.json').status,1);
}));
test('CLI signed bundle accepts only the externally supplied trusted key',()=>work(dir=>{
 const keys=generateKeyPairSync('ed25519'),privateFile=path.join(dir,'private.pem'),publicFile=path.join(dir,'trusted.pem'),bundle=path.join(dir,'bundle.json'),signed=path.join(dir,'signed.json');
 fs.writeFileSync(privateFile,keys.privateKey.export({type:'pkcs8',format:'pem'}),{mode:0o600});fs.writeFileSync(publicFile,keys.publicKey.export({type:'spki',format:'pem'}));
 assert.equal(run('bundle','examples/routing-laboratory.json',bundle).status,0);assert.equal(run('sign-bundle',bundle,signed,'--key',privateFile).status,0);
 const r=run('verify-bundle',signed,'--public-key',publicFile,'--project','examples/routing-laboratory.json');assert.equal(r.status,0,r.stdout+r.stderr);assert.equal(JSON.parse(r.stdout).authenticated,true);
}));
test('CLI signer rejects omitted private key',()=>assert.equal(run('sign-bundle','examples/verified-review-bundle.json','unused.json').status,2));
test('CLI invalid numerical options return a usage error',()=>assert.equal(run('solve','examples/pair-bottleneck.json','unused.json','--change-penalty','NaN').status,2));
test('CLI rejects invalid route configuration before writing output',()=>work(dir=>{
 const file=path.join(dir,'invalid.json'),r=run('route','examples/routing-laboratory.json',file,'--pitch','0');assert.equal(r.status,2);assert.equal(fs.existsSync(file),false);
}));
test('CLI bundle tampering returns check failure rather than a green exit',()=>work(dir=>{
 const b=JSON.parse(fs.readFileSync(path.join(root,'examples/verified-review-bundle.json'),'utf8'));b.manifest.planningPass=false;const file=path.join(dir,'bad.json');fs.writeFileSync(file,JSON.stringify(b));assert.equal(run('verify-bundle',file).status,1);
}));
test('CLI corrupt JSON returns a usage error without a stack dump',()=>work(dir=>{
 const file=path.join(dir,'bad.json');fs.writeFileSync(file,'not JSON');const r=run('verify-bundle',file);assert.equal(r.status,2);assert.ok(r.stderr.startsWith('OpenBumpPlan:'));
}));
test('CLI help documents the actual new commands',()=>{const r=run();for(const command of ['solve','route','verify-routes','bundle','sign-bundle','verify-bundle'])assert.ok(r.stdout.includes(command));assert.equal(r.status,0);});
