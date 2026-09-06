#!/usr/bin/env node
/** Guarded publication of the prepared v0.3.1 overlay. Never force-pushes.
 * The archive manifest is an integrity record, not a digital publisher signature.
 * --verify-only checks local files without invoking GitHub or Git. */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/core/model.js';

export const UPDATE_REPOSITORY = 'ajayasai/OpenBumpPlan';
export const UPDATE_BASE = '7e87673bd63b601045c1d5a50e5448051ec759ef';
export const UPDATE_BRANCH = `release/v${VERSION}-indexed-copper`;
export const MANIFEST_PATH = `docs/release-manifest-v${VERSION}.json`;
export const REQUIRED_RELEASE_FILES = ['index.html','package.json','src/core/model.js','src/core/solver.js','src/core/routing.js','src/core/evidence.js','src/core/hash.js','dist/index.html','dist/openbumpplan.html','src/core/scalable.js','src/core/coupled-search.js','src/core/coupled-proof.js','src/core/copper.js','src/core/spatial-index.js','docs/release-validation.json'];
const MAX_BYTES = 10_000_000;
function checkSourceCoverage(root, seen) {
  function walk(relative) {
    const dir = path.join(root,relative);
    const stat = fs.lstatSync(dir,{throwIfNoEntry:false});
    if (!stat) return;
    if (stat.isSymbolicLink() || !stat.isDirectory()) throw new Error(`Non-regular source directory: ${relative}`);
    for (const name of fs.readdirSync(dir).sort()) {
      if (name === '__pycache__') continue;
      const p = `${relative}/${name}`, child = fs.lstatSync(path.join(root,p));
      if (child.isSymbolicLink()) throw new Error(`Non-regular source path: ${p}`);
      if (child.isDirectory()) walk(p);
      else if (!child.isFile() || !seen.has(p)) throw new Error(`Unmanifested source file: ${p}`);
    }
  }
  for (const dir of ['src','scripts','tests']) walk(dir);
}
export function verifyUpdateManifest(root, manifest) {
  if (!manifest || manifest.version !== VERSION || manifest.repository !== UPDATE_REPOSITORY || manifest.baseCommit !== UPDATE_BASE ||
      !Array.isArray(manifest.files) || !manifest.files.length || manifest.files.length > 500) throw new Error('Invalid update manifest or unexpected repository/base.');
  root = path.resolve(root);
  const seen = new Set();
  for (const entry of manifest.files) {
    const p = entry?.path;
    if (typeof p !== 'string' || !/^[A-Za-z0-9_.\/-]+$/.test(p) || path.posix.isAbsolute(p) ||
        p.split('/').some(part => !part || ['.','..','.git','.env','node_modules','.upgrade-baseline','.release'].includes(part)) ||
        /\.(pem|key)$/i.test(p) || p.split('/').some(part => /^\.env(?:\.|$)/.test(part)) || seen.has(p)) throw new Error('Unsafe or duplicate publication path.');
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0 || entry.bytes > MAX_BYTES || !/^[a-f0-9]{64}$/.test(entry.sha256 || '')) throw new Error(`Invalid file metadata: ${p}`);
    seen.add(p);
    let cursor = root;
    for (const [i, part] of p.split('/').entries()) {
      cursor = path.join(cursor,part);
      const stat = fs.lstatSync(cursor);
      if (stat.isSymbolicLink() || (i === p.split('/').length-1 ? !stat.isFile() : !stat.isDirectory())) throw new Error(`Non-regular publication path: ${p}`);
    }
    const data = fs.readFileSync(cursor);
    if (data.length !== entry.bytes || createHash('sha256').update(data).digest('hex') !== entry.sha256) throw new Error(`Release checksum mismatch: ${p}`);
  }
  if (REQUIRED_RELEASE_FILES.some(p => !seen.has(p))) throw new Error('Required release files are missing from the manifest.');
  checkSourceCoverage(root, seen);
  return {verified:true,files:manifest.files.length,repository:UPDATE_REPOSITORY,baseCommit:UPDATE_BASE};
}

function run(command,args,{cwd,capture=false}={}) {
  const result = spawnSync(command,args,{cwd,encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'},stdio:capture?'pipe':'inherit'});
  if (result.error) throw new Error(`${command} could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with ${result.status}.${capture?' '+(result.stderr||'').trim():''}`);
  return capture?result.stdout.trim():'';
}
function metadata() {return JSON.parse(run('gh',['api',`repos/${UPDATE_REPOSITORY}`],{capture:true}));}
function validateRemote(meta) {
  if (meta.full_name !== UPDATE_REPOSITORY || meta.private !== false || meta.default_branch !== 'main' || meta.archived) throw new Error('Expected the existing, public, unarchived repository on main. No visibility is changed.');
}
function localChecks(root) {
  const files = fs.readdirSync(path.join(root,'tests')).filter(f=>f.endsWith('.test.mjs')).sort().map(f=>`tests/${f}`);
  run(process.execPath,['--test',...files],{cwd:root});
  run(process.execPath,['scripts/build.mjs'],{cwd:root});
}

export function main(args=process.argv.slice(2)) {
  if (args.some(a=>a!=='--verify-only') || args.length>1) throw new Error('Usage: node scripts/publish-update.mjs [--verify-only]');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
  const manifest = JSON.parse(fs.readFileSync(path.join(root,MANIFEST_PATH),'utf8'));
  const checked = verifyUpdateManifest(root,manifest);
  if (args.includes('--verify-only')) {console.log(JSON.stringify(checked,null,2));return;}
  const login=JSON.parse(run('gh',['api','user'],{capture:true})).login;
  if (login !== 'ajayasai') throw new Error('Authenticate as ajayasai using gh auth login before publishing.');
  validateRemote(metadata());
  console.log(`Verified ${checked.files} prepared files. Preparing ${UPDATE_REPOSITORY}:${UPDATE_BRANCH}; main is not changed.`);
  const temp = fs.mkdtempSync(path.join(os.tmpdir(),'openbumpplan-update-'));
  const checkout=path.join(temp,'checkout');
  let pushed=false;
  try {
    run('gh',['repo','clone',UPDATE_REPOSITORY,checkout,'--','--single-branch','--branch','main','--no-tags']);
    const head=run('git',['rev-parse','HEAD'],{cwd:checkout,capture:true});
    if (head!==UPDATE_BASE) throw new Error(`Repository changed: expected ${UPDATE_BASE}, found ${head}. Refusing to overwrite newer work. Rebase/review this update first.`);
    run('git',['switch','-c',UPDATE_BRANCH],{cwd:checkout});
    const publishFiles = [...manifest.files, {path:MANIFEST_PATH}];
    // Defend against symlinks in the checked-out destination, not just the source.
    for (const entry of publishFiles) {
      let cursor=checkout;
      for (const part of entry.path.split('/')) {
        cursor=path.join(cursor,part);
        if (fs.lstatSync(cursor,{throwIfNoEntry:false})?.isSymbolicLink()) throw new Error(`Destination symlink rejected: ${entry.path}`);
      }
    }
    for (const entry of publishFiles) {
      const target=path.join(checkout,entry.path);fs.mkdirSync(path.dirname(target),{recursive:true});
      fs.copyFileSync(path.join(root,entry.path),target);
    }
    localChecks(checkout);
    verifyUpdateManifest(checkout,manifest); // The rebuilt HTML must also match the prepared release.
    run('git',['diff','--check'],{cwd:checkout});
    run('git',['config','user.name','ajayasai'],{cwd:checkout});
    run('git',['config','user.email','11918904+ajayasai@users.noreply.github.com'],{cwd:checkout});
    run('git',['add','--',...publishFiles.map(e=>e.path)],{cwd:checkout});
    run('git',['commit','-m',`Add OpenBumpPlan v${VERSION} indexed copper checks and reproducible release evidence`],{cwd:checkout});
    const commit=run('git',['rev-parse','HEAD'],{cwd:checkout,capture:true});
    run('git',['push','origin',`HEAD:${UPDATE_BRANCH}`],{cwd:checkout});pushed=true;
    const remote=run('git',['ls-remote','origin',`refs/heads/${UPDATE_BRANCH}`],{cwd:checkout,capture:true}).split(/\s/)[0];
    validateRemote(metadata());
    if (remote!==commit) throw new Error(`Push returned success but readback differs: ${remote}. Inspect the remote; do not assume rollback.`);
    console.log(JSON.stringify({published:true,repository:UPDATE_REPOSITORY,visibility:'public',branch:UPDATE_BRANCH,mainChanged:false,commit,url:`https://github.com/${UPDATE_REPOSITORY}`},null,2));
    console.log('Open a pull request from the published branch to run review CI. No merge or CI result is implied by this script.');
  } catch(error) {
    console.error(pushed?'A push completed before a later verification failed. Inspect GitHub before retrying.':'No successful push was recorded; the prepared source is unchanged.');
    throw error;
  } finally {fs.rmSync(temp,{recursive:true,force:true});}
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {main();} catch(error) {console.error(error.message);process.exitCode=1;}
}
