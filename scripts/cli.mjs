#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { importJSON } from '../src/core/importers.js';
import { analyze } from '../src/core/rules.js';
import { optimizeStage } from '../src/core/optimizer.js';
import { compareProjects, ProjectStore } from '../src/core/revisions.js';
import { demoProject } from '../src/core/demo.js';
import { exportJSON,exportPortsCSV,exportConnectionsCSV,exportSVG,exportPDF,exportICDHTML,exportICDMarkdown } from '../src/core/exporters.js';
import { optimizeExact } from '../src/core/solver.js';
import { optimizeScalable } from '../src/core/scalable.js';
import { optimizeCoupledScalable } from '../src/core/coupled-search.js';
import { verifyAssignmentCertificate } from '../src/core/assignment-certificate.js';
import { verifyCoupledProof } from '../src/core/coupled-proof.js';
import { verifyCopper } from '../src/core/copper.js';
import { routePhysical } from '../src/core/physical-routing.js';
import { routeStage, routeNegotiated, verifyRoutes, exportRoutesSVG } from '../src/core/routing.js';
import { createReviewBundle, verifyReviewBundle, projectSHA256 } from '../src/core/evidence.js';
import { signReview, verifySignedReview } from './signing.mjs';
const args=process.argv.slice(2),command=args[0];
const flag=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const load=file=>{if(!file)throw new Error('An input JSON path is required.');return importJSON(fs.readFileSync(file,'utf8'));};
const save=(file,data)=>{if(!file||file.startsWith('--'))throw new Error('An output path is required.');fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,data);};
const record=file=>{if(!file||fs.statSync(file).size>20*1024*1024)throw new Error('Evidence input must be an existing JSON file under 20 MB.');return JSON.parse(fs.readFileSync(file,'utf8'));};
try {
  if(command==='solve-certified'||command==='solve-linear') {
    const p=load(args[1]),options={quantum:Number(flag('--quantum','0.001')),changePenalty:Number(flag('--change-penalty','0')),timeLimitMs:Number(flag('--time-ms','15000')),
      ...(flag('--sources','')?{sourceIds:flag('--sources').split(',').map(s=>s.trim())}:{}),...(command==='solve-certified'?{maxSubproblems:Number(flag('--subproblems','64'))}:{})};
    const result=(command==='solve-certified'?optimizeCoupledScalable:optimizeScalable)(p,flag('--from','pad'),flag('--to','ball'),options);
    const store=new ProjectStore(p);if(result.feasible&&result.changed)store.transact('CLI certified stage optimization',d=>{d.connections=result.project.connections;});
    if(result.feasible)save(args[2],exportJSON(store.project));
    const {project,before,after,...summary}=result;
    if(flag('--report',null))save(flag('--report'),JSON.stringify(summary,null,2));
    if(flag('--proof',null))save(flag('--proof'),JSON.stringify(result.proof||result.certificate,null,2));
    console.log(JSON.stringify({status:result.status,feasible:result.feasible,objectiveTicks:result.objectiveTicks,scope:result.scope,statistics:result.stats,verified:result.verification?.ok,message:result.message},null,2));
    if(!result.feasible)process.exitCode=1;
  } else if(command==='verify-assignment'||command==='verify-coupled') {
    const p=load(args[1]),proof=record(args[2]),r=command==='verify-coupled'?verifyCoupledProof(p,proof.proof||proof):verifyAssignmentCertificate(p,proof.certificate||proof);
    console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
  } else if(command==='verify-copper') {
    if(!flag('--technology',null))throw new Error('Supply --technology for the independently expected dimensions/clearance.');
    const r=verifyCopper(load(args[1]),record(args[2]),record(flag('--technology')));console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
  } else if(command==='solve') {
    const p=load(args[1]),options={maxNodes:Number(flag('--max-nodes','50000')),timeLimitMs:Number(flag('--time-ms','5000')),changePenalty:Number(flag('--change-penalty','0')),maxChanges:Number(flag('--max-changes','Infinity')),...(flag('--sources','')?{sourceIds:flag('--sources','').split(',').map(s=>s.trim())}:{})};
    const result=optimizeExact(p,flag('--from','pad'),flag('--to','ball'),options);
    const store=new ProjectStore(p);if(result.feasible&&result.changed)store.transact('CLI coupled exact-stage optimization',d=>{d.connections=result.project.connections;});
    if(result.feasible)save(args[2],exportJSON(store.project));
    const {project,before,after,...summary}=result;const report={inputSHA256:await projectSHA256(p),outputSHA256:result.feasible?await projectSHA256(store.project):null,...summary};
    if(flag('--report',null))save(flag('--report'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));if(!result.feasible)process.exitCode=1;
  } else if((command==='route'||command==='route-physical')) {
    const p=load(args[1]),options={};for(const [arg,key]of [['--pitch','pitch'],['--layers','layers'],['--clearance','clearance'],['--via-cost','viaCost'],['--start-layer','startLayer'],['--end-layer','endLayer'],['--origin-x','originX'],['--origin-y','originY'],['--columns','columns'],['--rows','rows'],['--max-expansions','maxExpansions'],['--time-ms','timeLimitMs'],['--order-trials','orderTrials']])if(args.includes(arg))options[key]=Number(flag(arg));
    if(command==='route-physical'){if(!flag('--technology',null))throw new Error('Supply --technology with explicit copper dimensions/clearance.');options.technology=record(flag('--technology'));}
    const r=(command==='route-physical'?routePhysical:args.includes('--negotiate')?routeNegotiated:routeStage)(p,flag('--from','pad'),flag('--to','ball'),options);save(args[2],JSON.stringify(r,null,2));if(flag('--svg',null))save(flag('--svg'),exportRoutesSVG(p,r));
    console.log(JSON.stringify({status:r.status,verified:r.verified,metrics:r.metrics,failures:r.failures,message:r.message},null,2));if(!r.verified)process.exitCode=1;
  } else if(command==='verify-routes') {
    const r=verifyRoutes(load(args[1]),record(args[2]));console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;
  } else if(command==='bundle') {
    const p=load(args[1]),b=await createReviewBundle(p,{routing:flag('--routes',null)?record(flag('--routes')):null});save(args[2],JSON.stringify(b,null,2));console.log(JSON.stringify(b.manifest,null,2));if(!b.manifest.planningPass)process.exitCode=1;
  } else if(command==='verify-bundle') {
    const b=record(args[1]),options={expectedProjectSHA256:flag('--project',null)?await projectSHA256(load(flag('--project'))):null,expectedTechnology:flag('--technology',null)?record(flag('--technology')):null};
    const r=flag('--public-key',null)?await verifySignedReview(b,fs.readFileSync(flag('--public-key'),'utf8'),options):await verifyReviewBundle(b,options);
    console.log(JSON.stringify(r,null,2));if(!r.valid||!r.planningPass)process.exitCode=1;
  } else if(command==='sign-bundle') {
    if(!flag('--key',null))throw new Error('--key path to an Ed25519 private key is required. Keys remain local.');
    const signed=await signReview(record(args[1]),fs.readFileSync(flag('--key'),'utf8'));save(args[2],JSON.stringify(signed,null,2));console.log('Signed review manifest. Verification requires the independently trusted public key.');
  } else if(command==='check') {
    const p=load(args[1]),result=analyze(p),failOn=flag('--fail-on','error');if(!['error','warning'].includes(failOn))throw new Error('--fail-on must be error or warning.');
    if(args.includes('--json'))console.log(JSON.stringify(result,null,2));else{console.log(`${p.name}: ${result.errors} errors, ${result.warnings} warnings, ${result.complete?'fully evaluated':'INCOMPLETE'}`);console.log(`L1=${result.metrics.totalLength} um, crossings=${result.metrics.crossings}, score=${result.metrics.score}`);for(const issue of result.issues)console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);}
    process.exitCode=!result.complete||result.errors>0||failOn==='warning'&&result.warnings>0?1:0;
  } else if(command==='diff') {
    const result=compareProjects(load(args[1]),load(args[2]));console.log(JSON.stringify(args.includes('--json')?result:{summary:result.summary,gate:result.gate},null,2));if(args.includes('--gate')&&!result.gate.ok)process.exitCode=1;
  } else if(command==='optimize') {
    const p=load(args[1]),result=optimizeStage(p,flag('--from','interposer'),flag('--to','ball'),{maxTrials:Number(flag('--trials','1500'))});
    const store=new ProjectStore(p);if(result.changed)store.transact('CLI stage optimization',d=>{d.connections=result.project.connections;});save(args[2],exportJSON(store.project));
    console.log(JSON.stringify({status:result.status,message:result.message,changed:result.changed,trials:result.trials,before:result.before.metrics,after:result.after.metrics},null,2));
  } else if(command==='export') {
    const p=load(args[1]),file=args[2],format=flag('--format',path.extname(file||'').slice(1));
    const exporters={json:exportJSON,csv:exportPortsCSV,connections:exportConnectionsCSV,svg:exportSVG,pdf:exportPDF,html:exportICDHTML,md:exportICDMarkdown};
    if(!exporters[format])throw new Error('Export format must be json/csv/connections/svg/pdf/html/md.');save(file,exporters[format](p));console.log(`Wrote ${file}`);
  } else if(command==='demo') {save(args[1],exportJSON(demoProject()));console.log(`Wrote ${args[1]}`);}
  else {console.log('OpenBumpPlan CLI\n\n  node scripts/cli.mjs solve-certified in.json out.json --from pad --to ball [--subproblems 64] [--quantum 0.001] [--proof proof.json]\n  node scripts/cli.mjs solve-linear in.json out.json [--proof certificate.json]\n  node scripts/cli.mjs verify-coupled ORIGINAL.json proof.json\n  node scripts/cli.mjs verify-assignment ORIGINAL.json certificate.json\n  node scripts/cli.mjs route-physical project.json routes.json --technology technology.json --pitch 10\n  node scripts/cli.mjs verify-copper project.json routes.json --technology trusted-technology.json\n  node scripts/cli.mjs solve in.json out.json --from pad --to ball [--sources id1,id2] [--max-changes 2] [--change-penalty 100] [--report solve.json]\n  node scripts/cli.mjs route project.json routes.json --pitch 10 --layers 2 [--svg routes.svg]\n  node scripts/cli.mjs verify-routes project.json routes.json\n  node scripts/cli.mjs bundle project.json bundle.json [--routes routes.json]\n  node scripts/cli.mjs verify-bundle bundle.json [--project current.json] [--public-key trusted.pem]\n  node scripts/cli.mjs sign-bundle bundle.json signed.json --key private.pem\n  node scripts/cli.mjs check project.json [--json] [--fail-on warning]\n  node scripts/cli.mjs diff before.json after.json [--json] [--gate]\n  node scripts/cli.mjs optimize in.json out.json --from interposer --to ball [--trials 1500]\n  node scripts/cli.mjs export project.json output.pdf [--format connections]\n  node scripts/cli.mjs demo demo.json\n\nExit status: 0 completed/passed; 1 check/gate failure; 2 input/usage error.');if(command)process.exitCode=2;}
} catch(error) {console.error(`OpenBumpPlan: ${error.message}`);process.exitCode=2;}
