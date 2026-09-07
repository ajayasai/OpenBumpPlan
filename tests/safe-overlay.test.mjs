import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
test('bounded archive importer passes its Python security regression suite',()=>{
 const result=spawnSync(process.env.PYTHON||'python3',['-B','-m','unittest','discover','-s','tests','-p','safe_overlay_test.py','-v'],
  {cwd:fileURLToPath(new URL('..',import.meta.url)),encoding:'utf8',timeout:30000,maxBuffer:1024*1024});
 assert.equal(result.error,undefined,result.error?.message);assert.equal(result.status,0,result.stdout+result.stderr);
});
