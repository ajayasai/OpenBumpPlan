#!/usr/bin/env node
/** Separate interoperability CLI; existing planning/signature CLI is unchanged.
 * Output files are exclusive-create. No shell execution and no network access. */
import fs from 'node:fs';
import { importKiCad, exportKiCad, verifyKiCadExport } from '../src/core/terminal-interop.js';
import { verifyConnectivityContract, verifyIntentReview, previewMappingECO } from '../src/core/connectivity-contract.js';
const argv=process.argv.slice(2),command=argv.shift(),params=[],opts={};
function text(file){if(!file)throw new Error('Missing input file');const stat=fs.statSync(file);if(!stat.isFile()||stat.size>5*1024*1024)throw new Error('Input must be a regular file up to 5 MiB');return fs.readFileSync(file,'utf8');}
function json(file){return JSON.parse(text(file));}
function write(file,data){if(!file)throw new Error('Missing output file');fs.writeFileSync(file,typeof data==='string'?data:JSON.stringify(data,null,2)+'\n',{flag:'wx'});}
try{
  for(let i=0;i<argv.length;i++){if(argv[i].startsWith('--')){if(!['--kind','--diameter','--side','--reference','--prefix'].includes(argv[i])||Object.hasOwn(opts,argv[i])||!argv[i+1]||argv[i+1].startsWith('--'))throw new Error('Unknown, repeated or missing CLI option');opts[argv[i]]=argv[++i];}else params.push(argv[i]);}
  const arity={import:2,export:2,check:3,replay:3,'verify-export':3,eco:4};
  if(!Object.hasOwn(arity,command)||params.length!==arity[command])throw new Error('Usage:\n node scripts/interop.mjs import in.kicad_pcb out.json [--reference U1] [--kind pcb]\n node scripts/interop.mjs export project.json out-prefix --diameter 250 [--kind ball] [--side F.Cu]\n node scripts/interop.mjs check project.json contract.json report.json\n node scripts/interop.mjs replay project.json contract.json report.json\n node scripts/interop.mjs verify-export project.json board.kicad_pcb receipt.json --diameter 250\n node scripts/interop.mjs eco project.json patch.json contract.json out.json\nExit 0=pass/completed; 1=failed verification; 2=invalid input/usage. Existing output files are never overwritten.');
  const allowed=command==='import'?['--kind','--reference','--prefix']:['export','verify-export'].includes(command)?['--kind','--diameter','--side']:[];
  if(Object.keys(opts).some(k=>!allowed.includes(k)))throw new Error('Option is not valid for this command');
  if(command==='import'){const r=importKiCad(text(params[0]),{kind:opts['--kind']||'pcb',prefix:opts['--prefix']||'',references:opts['--reference']?[opts['--reference']]:null});write(params[1],r.project);console.log(JSON.stringify(r.report,null,2));}
  if(command==='export'){
    const r=exportKiCad(json(params[0]),{kind:opts['--kind']||'ball',diameter:Number(opts['--diameter']),side:opts['--side']||'F.Cu'});
    const outputs=[[params[1]+'.kicad_pcb',r.board],[params[1]+'.kicad_mod',r.footprint],[params[1]+'.receipt.json',r.receipt]];
    // Check all names first; exclusive-create still handles races. Do not clean
    // up arbitrary user paths on failure; report any partial export explicitly.
    if(outputs.some(([f])=>fs.existsSync(f)))throw new Error('An output file already exists');
    for(const[f,d]of outputs)write(f,d);console.log(JSON.stringify({files:outputs.map(v=>v[0]),terminals:r.receipt.terminalCount},null,2));
  }
  if(command==='check'){const r=verifyConnectivityContract(json(params[0]),json(params[1]));write(params[2],r);console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;}
  if(command==='replay'||command==='verify-export'){const r=command==='replay'?verifyIntentReview(json(params[0]),json(params[1]),json(params[2])):verifyKiCadExport(json(params[0]),text(params[1]),json(params[2]),{kind:opts['--kind']||'ball',diameter:Number(opts['--diameter']),side:opts['--side']||'F.Cu'});console.log(JSON.stringify(r,null,2));if(!r.ok)process.exitCode=1;}
  if(command==='eco'){const r=previewMappingECO(json(params[0]),json(params[1]),json(params[2]));if(r.accepted)write(params[3],r.project);console.log(JSON.stringify({...r,project:undefined},null,2));if(!r.accepted)process.exitCode=1;}
}catch(error){console.error('OpenBumpPlan interchange: '+error.message);process.exitCode=2;}
