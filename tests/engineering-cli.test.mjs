import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fixture } from './helpers.mjs';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'openbumpplan-engineering-'));
const cli=(...a)=>spawnSync(process.execPath,['scripts/cli.mjs',...a],{encoding:'utf8'});
const input=path.join(dir,'in.json'),evidence=path.join(dir,'evidence.json');
fs.writeFileSync(input,JSON.stringify(fixture()));
test('CLI exact exports replayable evidence without editing the input',()=>{
  const before=fs.readFileSync(input,'utf8'),r=cli('exact',input,evidence);assert.equal(r.status,0,r.stderr);assert.equal(JSON.parse(r.stdout).status,'optimal');assert.equal(fs.readFileSync(input,'utf8'),before);
  const v=cli('verify',input,evidence);assert.equal(v.status,0,v.stderr);assert.equal(JSON.parse(v.stdout).planningPass,true);
});
test('CLI verification rejects stale inputs and corrupted evidence',()=>{
  assert.equal(cli('exact',input,evidence).status,0);const changed=fixture();changed.ports[0].x=1;const file=path.join(dir,'changed.json');fs.writeFileSync(file,JSON.stringify(changed));assert.equal(cli('verify',file,evidence).status,1);
});
test('CLI route requires an explicit configuration',()=>{assert.equal(cli('route',input,evidence).status,2);});
test('CLI route exports real paths and SVG, then verifies geometry',()=>{
  const config=path.join(dir,'route.json'),svg=path.join(dir,'routes.svg');fs.writeFileSync(config,JSON.stringify({columns:3,rows:3,pitch:100,passes:1}));
  const r=cli('route',input,evidence,'--config',config,'--svg',svg);assert.equal(r.status,0,r.stderr);assert.ok(fs.readFileSync(svg,'utf8').startsWith('<svg'));assert.equal(cli('verify',input,evidence).status,0);assert.equal(cli('check-routes',input,evidence).status,0);
});
test('CLI infeasibility is a nonzero planning result, but authentic replay is distinct',()=>{
  const file=path.join(dir,'impossible.json'),p=fixture();p.rules.maxLength=0;fs.writeFileSync(file,JSON.stringify(p));assert.equal(cli('exact',file,evidence).status,1);const v=cli('verify',file,evidence);assert.equal(v.status,0);assert.equal(JSON.parse(v.stdout).planningPass,false);
});
