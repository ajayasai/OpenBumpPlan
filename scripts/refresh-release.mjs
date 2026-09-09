/** Maintainer packaging command, NOT verification or publisher authentication.
 * Run only after inspecting changes and testing. Verification uses the separate
 * verify:release command and the resulting frozen manifest. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { VERSION } from '../src/core/model.js';
import { UPDATE_REPOSITORY, UPDATE_BASE, MANIFEST_PATH, verifyUpdateManifest } from './publish-update.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),files=[];
const excluded=new Set(['.git','.interop-transfer','.release','node_modules','__pycache__']);
function walk(rel=''){
 for(const name of fs.readdirSync(path.join(root,rel)).sort()){
  if(excluded.has(name))continue;
  const p=rel?rel+'/'+name:name;
  if(p===MANIFEST_PATH||p==='.github/workflows/stage-interop.yml')continue;
  const stat=fs.lstatSync(path.join(root,p));if(stat.isSymbolicLink())throw new Error('Symlink rejected: '+p);
  if(stat.isDirectory())walk(p);else if(stat.isFile()){
   const data=fs.readFileSync(path.join(root,p));files.push({path:p,bytes:data.length,sha256:createHash('sha256').update(data).digest('hex')});
  }else throw new Error('Non-regular release member: '+p);
 }
}
walk();
const manifest={version:VERSION,repository:UPDATE_REPOSITORY,baseCommit:UPDATE_BASE,scope:'Frozen inspected source/runtime/tests/examples/evidence bytes. Excludes Git, transfer/bootstrap staging workflow and this self-manifest. Integrity only; not a signature.',files};
verifyUpdateManifest(root,manifest);
fs.writeFileSync(path.join(root,MANIFEST_PATH),JSON.stringify(manifest,null,2)+'\n');console.log(JSON.stringify({manifest:MANIFEST_PATH,files:files.length}));
