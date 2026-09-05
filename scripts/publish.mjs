#!/usr/bin/env node
/** Explicit, local publishing step. Requires Git, gh, and your own authenticated account.
 * Creates a NEW public repository. Never changes another repository's visibility or force-pushes.
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),repo='ajayasai/OpenBumpPlan';
function run(program,args,{capture=false,allowFailure=false}={}) {
  const result=spawnSync(program,args,{cwd:root,encoding:'utf8',stdio:capture?'pipe':'inherit',shell:false});
  if(result.error)throw new Error(`${program} is unavailable. Install it before publishing.`);
  if(result.status!==0&&!allowFailure)throw new Error(`${program} ${args.join(' ')} failed. No force operation was attempted.`);
  return result;
}
try {
  run('git',['--version'],{capture:true});run('gh',['auth','status']);
  const login=run('gh',['api','user','--jq','.login'],{capture:true}).stdout.trim();
  if(login!=='ajayasai')throw new Error(`Expected the connected owner ajayasai, but gh is authenticated as ${login}. Switch accounts before publishing.`);
  const existing=run('gh',['repo','view',repo,'--json','name'],{capture:true,allowFailure:true});if(existing.status===0)throw new Error(`${repo} already exists. This script will not overwrite it or change its visibility.`);
  const top=run('git',['rev-parse','--show-toplevel'],{capture:true,allowFailure:true});
  if(top.status===0&&path.resolve(top.stdout.trim())!==root)throw new Error('The project is nested inside another Git repository. Move it out before publishing.');
  console.log(`Preparing a NEW PUBLIC repository: ${repo}. Only the files in this project directory will be committed.`);
  run('npm',['test']);run('npm',['run','build']);
  if(!fs.existsSync(path.join(root,'.git')))run('git',['init','-b','main']);
  const remote=run('git',['remote','get-url','origin'],{capture:true,allowFailure:true});if(remote.status===0)throw new Error('An origin remote already exists. Inspect it and publish deliberately with Git/gh; this script will not replace it.');
  for(const [key,value] of [['user.name','ajayasai'],['user.email','11918904+ajayasai@users.noreply.github.com']])if(run('git',['config','--get',key],{capture:true,allowFailure:true}).status!==0)run('git',['config','--local',key,value]);
  run('git',['add','.']);
  const diff=run('git',['diff','--cached','--quiet'],{capture:true,allowFailure:true});if(diff.status===1)run('git',['commit','-m','Build OpenBumpPlan: offline planning studio, checks, optimizer, exports, and tests']);
  run('gh',['repo','create',repo,'--public','--description','Local-first die/package bump and ball-map planning with checked optimization and interface-control exports','--source',root,'--remote','origin','--push']);
  run('gh',['repo','view',repo,'--json','url,visibility']);
  console.log('Public repository created and source pushed. GitHub Pages deployment is optional; see docs/PUBLISHING.md.');
} catch(error){console.error(`Publishing stopped: ${error.message}`);process.exitCode=1;}
