#!/usr/bin/env node
import { solveExactStage } from '../src/core/exact.js';
import { routeStage, checkRoutes } from '../src/core/routing.js';
import { createEvidence,verifyEvidence } from '../src/core/evidence.js';
import { routeSVG } from '../src/lab.js';
import fs from 'node:fs';
import path from 'node:path';
import { importJSON } from '../src/core/importers.js';
import { analyze } from '../src/core/rules.js';
import { optimizeStage } from '../src/core/optimizer.js';
import { compareProjects, ProjectStore } from '../src/core/revisions.js';
import { demoProject } from '../src/core/demo.js';
import { exportJSON,exportPortsCSV,exportConnectionsCSV,exportSVG,exportPDF,exportICDHTML,exportICDMarkdown } from '../src/core/exporters.js';
const args=process.argv.slice(2),command=args[0];
const flag=(name,fallback)=>{const i=args.indexOf(name);return i>=0?args[i+1]:fallback;};
const load=file=>{if(!file)throw new Error('An input JSON path is required.');return importJSON(fs.readFileSync(file,'utf8'));};
const save=(file,data)=>{if(!file||file.startsWith('--'))throw new Error('An output path is required.');fs.mkdirSync(path.dirname(path.resolve(file)),{recursive:true});fs.writeFileSync(file,data);};
try {
  if(command==='check') {
    const p=load(args[1]),result=analyze(p),failOn=flag('--fail-on','error');if(!['error','warning'].includes(failOn))throw new Error('--fail-on must be error or warning.');
    if(args.includes('--json'))console.log(JSON.stringify(result,null,2));else{console.log(`${p.name}: ${result.errors} errors, ${result.warnings} warnings, ${result.complete?'fully evaluated':'INCOMPLETE'}`);console.log(`L1=${result.metrics.totalLength} um, crossings=${result.metrics.crossings}, score=${result.metrics.score}`);for(const issue of result.issues)console.log(`${issue.severity.toUpperCase()} ${issue.code}: ${issue.message}`);}
    process.exitCode=!result.complete||result.errors>0||failOn==='warning'&&result.warnings>0?1:0;
  } else if(command==='diff') {
    const result=compareProjects(load(args[1]),load(args[2]));console.log(JSON.stringify(args.includes('--json')?result:{summary:result.summary,gate:result.gate},null,2));if(args.includes('--gate')&&!result.gate.ok)process.exitCode=1;
  } else if(command==='optimize') {
    const p=load(args[1]),result=optimizeStage(p,flag('--from','interposer'),flag('--to','ball'),{maxTrials:Number(flag('--trials','1500'))});
    const store=new ProjectStore(p);if(result.changed)store.transact('CLI stage optimization',d=>{d.connections=result.project.connections;});save(args[2],exportJSON(store.project));
    console.log(JSON.stringify({status:result.status,message:result.message,changed:result.changed,trials:result.trials,before:result.before.metrics,after:result.after.metrics},null,2));
  } else if(command==='exact') {
    const p=load(args[1]),options={nodeLimit:Number(flag('--nodes','20000'))};
    if(args.includes('--max-changes'))options.maxChanges=Number(flag('--max-changes'));
    if(args.includes('--change-penalty'))options.changePenalty=Number(flag('--change-penalty'));
    const r=solveExactStage(p,flag('--from','pad'),flag('--to','ball'),options);
    save(args[2],JSON.stringify(await createEvidence(p,'exact',r),null,2)+'\n');
    console.log(JSON.stringify({status:r.status,lowerBound:r.lowerBound,upperBound:r.upperBound,absoluteGap:r.absoluteGap,changedAssignments:r.changedAssignments,nodes:r.nodes,reason:r.reason},null,2));
    process.exitCode=['optimal','feasible'].includes(r.status)?0:1;
  } else if(command==='route') {
    const p=load(args[1]),configPath=flag('--config');if(!configPath)throw new Error('Routing requires --config routing-config.json.');
    const r=routeStage(p,flag('--from','pad'),flag('--to','ball'),JSON.parse(fs.readFileSync(configPath,'utf8')));
    save(args[2],JSON.stringify(await createEvidence(p,'routing',r),null,2)+'\n');
    if(args.includes('--svg'))save(flag('--svg'),routeSVG(r));
    console.log(JSON.stringify({status:r.status,metrics:r.check.metrics,unrouted:r.unrouted,errors:r.check.errors},null,2));process.exitCode=r.status==='routed'?0:1;
  } else if(command==='verify') {
    const e=JSON.parse(fs.readFileSync(args[2],'utf8')),r=await verifyEvidence(load(args[1]),e,{maxReplayNodes:Number(flag('--nodes','20000')),maxReplayExpanded:Number(flag('--expanded','200000'))});
    console.log(JSON.stringify(r,null,2));process.exitCode=r.valid?0:1;
  } else if(command==='check-routes') {
    const e=JSON.parse(fs.readFileSync(args[2],'utf8')),r=e.result||e,c=checkRoutes(load(args[1]),r.from,r.to,r.config,r.routes);console.log(JSON.stringify(c,null,2));process.exitCode=c.valid?0:1;
  } else if(command==='export') {
    const p=load(args[1]),file=args[2],format=flag('--format',path.extname(file||'').slice(1));
    const exporters={json:exportJSON,csv:exportPortsCSV,connections:exportConnectionsCSV,svg:exportSVG,pdf:exportPDF,html:exportICDHTML,md:exportICDMarkdown};
    if(!exporters[format])throw new Error('Export format must be json/csv/connections/svg/pdf/html/md.');save(file,exporters[format](p));console.log(`Wrote ${file}`);
  } else if(command==='demo') {save(args[1],exportJSON(demoProject()));console.log(`Wrote ${args[1]}`);}
  else {console.log('OpenBumpPlan CLI\n\n  node scripts/cli.mjs check project.json [--json] [--fail-on warning]\n  node scripts/cli.mjs diff before.json after.json [--json] [--gate]\n  node scripts/cli.mjs optimize in.json out.json --from interposer --to ball [--trials 1500]\n  node scripts/cli.mjs export project.json output.pdf [--format connections]\n  node scripts/cli.mjs exact in.json evidence.json --from pad --to ball [--nodes 20000] [--max-changes 4] [--change-penalty 100]\n  node scripts/cli.mjs route in.json evidence.json --config routing.json [--svg routes.svg]\n  node scripts/cli.mjs verify in.json evidence.json\n  node scripts/cli.mjs check-routes in.json evidence.json\n  node scripts/cli.mjs demo demo.json\n\nExit status: 0 completed/passed; 1 failed check, infeasible/unknown exact result, or partial routes; 2 input/usage error. Verify exits 0 on authentic replay even for an infeasible or partial result: inspect planningPass and status.');if(command)process.exitCode=2;}
} catch(error) {console.error(`OpenBumpPlan: ${error.message}`);process.exitCode=2;}
