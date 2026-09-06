import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {verifyUpdateManifest,UPDATE_BASE,UPDATE_REPOSITORY,REQUIRED_RELEASE_FILES} from '../scripts/publish-update.mjs';
function fixture(fn) {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'openbumpplan-manifest-test-'));
  const names=REQUIRED_RELEASE_FILES;
  const files=names.map(p=>{fs.mkdirSync(path.dirname(path.join(root,p)),{recursive:true});fs.writeFileSync(path.join(root,p),p);return {path:p,bytes:Buffer.byteLength(p),sha256:createHash('sha256').update(p).digest('hex')};});
  try {return fn(root,{version:'0.3.1',repository:UPDATE_REPOSITORY,baseCommit:UPDATE_BASE,files});}
  finally {fs.rmSync(root,{recursive:true,force:true});}
}
test('publication manifest verifies exact prepared bytes without network or writes',()=>fixture((root,m)=>assert.equal(verifyUpdateManifest(root,m).files,REQUIRED_RELEASE_FILES.length)));
for (const [name,mutate] of [
  ['wrong repository',m=>m.repository='someone/else'],['wrong base',m=>m.baseCommit='a'.repeat(40)],['wrong version',m=>m.version='9.0'],
  ['duplicate',m=>m.files.push(m.files[0])],['missing required file',m=>m.files.shift()],['wrong bytes',m=>m.files[0].bytes++],
  ['missing HTML build entry',m=>m.files=m.files.filter(e=>e.path!=='index.html')],
  ['wrong digest',m=>m.files[0].sha256='0'.repeat(64)],['bad digest',m=>m.files[0].sha256='garbage'],
  ['traversal',m=>m.files[0].path='../outside'],['absolute path',m=>m.files[0].path='/tmp/file'],
  ['windows separator',m=>m.files[0].path='..\\outside'],['git internals',m=>m.files[0].path='.git/config'],
  ['private key',m=>m.files[0].path='secret.pem'],['environment file',m=>m.files[0].path='.env'],['option-like path',m=>m.files[0].path='--force'],
]) test(`publication manifest refuses ${name}`,()=>fixture((root,m)=>{mutate(m);assert.throws(()=>verifyUpdateManifest(root,m));}));
test('publication manifest refuses changed source bytes',()=>fixture((root,m)=>{fs.writeFileSync(path.join(root,'package.json'),'tampered');assert.throws(()=>verifyUpdateManifest(root,m));}));
test('publication manifest refuses file symlinks',()=>fixture((root,m)=>{const p=path.join(root,'package.json');fs.renameSync(p,p+'.real');fs.symlinkSync(p+'.real',p);assert.throws(()=>verifyUpdateManifest(root,m),/Non-regular/);}));
test('publication manifest refuses parent-directory symlinks',()=>fixture((root,m)=>{fs.renameSync(path.join(root,'src'),path.join(root,'hidden'));fs.symlinkSync(path.join(root,'hidden'),path.join(root,'src'));assert.throws(()=>verifyUpdateManifest(root,m),/Non-regular/);}));

for (const name of ['src/core/forgotten.js','scripts/forgotten.mjs','tests/oracles/forgotten.mjs']) {
  test(`release rejects omitted source dependency ${name}`,()=>fixture((root,m)=>{
    const file=path.join(root,name);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,'export const important = true;');
    assert.throws(()=>verifyUpdateManifest(root,m),/Unmanifested source/);
  }));
}
test('release refuses omitted-directory symlinks',()=>fixture((root,m)=>{
  fs.symlinkSync(path.join(root,'src'),path.join(root,'scripts'));
  assert.throws(()=>verifyUpdateManifest(root,m),/Non-regular source/);
}));
