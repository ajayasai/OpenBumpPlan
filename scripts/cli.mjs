#!/usr/bin/env node
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
  } else if(command==='export') {
    const p=load(args[1]),file=args[2],format=flag('--format',path.extname(file||'').slice(1));
    const exporters={json:exportJSON,csv:exportPortsCSV,connections:exportConnectionsCSV,svg:exportSVG,pdf:exportPDF,html:exportICDHTML,md:exportICDMarkdown};
    if(!exporters[format])throw new Error('Export format must be json/csv/connections/svg/pdf/html/md.');save(file,exporters[format](p));console.log(`Wrote ${file}`);
  } else if(command==='demo') {save(args[1],exportJSON(demoProject()));console.log(`Wrote ${args[1]}`);}
  else {console.log('OpenBumpPlan CLI\n\n  node scripts/cli.mjs check project.json [--json] [--fail-on warning]\n  node scripts/cli.mjs diff before.json after.json [--json] [--gate]\n  node scripts/cli.mjs optimize in.json out.json --from interposer --to ball [--trials 1500]\n  node scripts/cli.mjs export project.json output.pdf [--format connections]\n  node scripts/cli.mjs demo demo.json\n\nExit status: 0 completed/passed; 1 check/gate failure; 2 input/usage error.');if(command)process.exitCode=2;}
} catch(error) {console.error(`OpenBumpPlan: ${error.message}`);process.exitCode=2;}
