#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { exportRoutedKiCad, verifyRoutedKiCad } from '../src/core/routed-kicad.js';
const help=`OpenBumpPlan source-bound routed KiCad handoff
  node scripts/routed-kicad.mjs export PROJECT ROUTES TECHNOLOGY SPEC NEW_DIRECTORY
  node scripts/routed-kicad.mjs verify PROJECT ROUTES TECHNOLOGY SPEC BOARD RECEIPT
SPEC must explicitly contain viaDrill, boardThickness and edgeMargin (um).
Exports one checked stage with F.Cu/B.Cu tracks, through vias, circular pads,
keepouts and a GENERATED outline. Never overwrites an existing directory.
Not manufacturing or electrical signoff. Exit codes: 0 pass, 1 verification failure, 2 usage/input error.
`;
function text(file){const stat=fs.statSync(file);if(!stat.isFile()||stat.size>16*1024*1024)throw new Error('Input must be a regular file at most 16 MiB');return fs.readFileSync(file,'utf8');}
const json=file=>JSON.parse(text(file));
try {
 const [command,...args]=process.argv.slice(2);
 if(command==='--help'||command==='help'){console.log(help);}
 else if(command==='export'&&args.length===5){
  const [pf,wf,tf,sf,directory]=args,[p,w,t,s]=[pf,wf,tf,sf].map(json),r=exportRoutedKiCad(p,w,t,s);
  const replay=verifyRoutedKiCad(p,w,t,r.board,r.receipt,s);if(!replay.ok)throw new Error(replay.issues.join('; '));
  const files={'routed.kicad_pcb':r.board,'receipt.json':JSON.stringify(r.receipt,null,2)+'\n',
   'project.json':JSON.stringify(p,null,2)+'\n','routes.json':JSON.stringify(w,null,2)+'\n',
   'technology.json':JSON.stringify(t,null,2)+'\n','specification.json':JSON.stringify(s,null,2)+'\n',
   'README.txt':r.receipt.warnings.join('\n')+'\n\nReverify using separately reviewed original project, route, technology and specification files.\n'};
  fs.mkdirSync(directory); // Exclusive creation; a pre-existing path is a hard error.
  try{for(const [name,data]of Object.entries(files))fs.writeFileSync(path.join(directory,name),data,{flag:'wx'});}
  catch(error){fs.rmSync(directory,{recursive:true});throw error;}
  console.log(JSON.stringify({ok:true,directory:path.resolve(directory),counts:r.receipt.counts},null,2));
 } else if(command==='verify'&&args.length===6){
  const [pf,wf,tf,sf,bf,rf]=args,[p,w,t,s]=[pf,wf,tf,sf].map(json),r=verifyRoutedKiCad(p,w,t,text(bf),json(rf),s);
  console.log(JSON.stringify(r,null,2));process.exitCode=r.ok?0:1;
 } else {console.error(help);process.exitCode=2;}
}catch(error){console.error(`Routed KiCad handoff: ${error.message}`);process.exitCode=2;}
