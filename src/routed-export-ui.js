import { exportRoutedKiCad, verifyRoutedKiCad } from './core/routed-kicad.js';
import { routedHandoffDemo } from './core/routed-demo.js';
import { exportRoutesSVG } from './core/routing.js';

/** Mounted inside the existing workbench, sharing its current project. */
export function mountRoutedExport({container,getProject,setProject}) {
  const panel=document.createElement('section');panel.className='panel';panel.id='routedHandoff';
  panel.innerHTML=`<h3>05 / ROUTED HANDOFF</h3><h2>Send checked copper to KiCad</h2>
  <p class="hint">Export one routing stage with actual traces, through vias and circular SMD pads. Source grid and continuous copper checks must pass first.</p>
  <label>Route witness JSON<input id="routedWitnessFile" type="file" accept=".json"></label>
  <p id="routedWitnessInfo" class="hint">No route witness loaded.</p>
  <label>Explicit technology (µm)<textarea id="routedTechnology" spellcheck="false" aria-label="Routed handoff technology" style="min-height:150px"></textarea></label>
  <label>Native via / board specification (µm)<textarea id="routedSpecification" spellcheck="false" aria-label="Routed handoff specification" style="min-height:110px"></textarea></label>
  <details><summary>Try a synthetic routed example</summary><p class="hint">Replaces only the current workbench project and clears its previous intent contract. The sample settings are not manufacturing recommendations.</p><button id="routedSample">Load routed sample</button></details>
  <div class="row"><button id="routedBuild" class="primary">Build checked routed board</button></div>
  <pre id="routedResult" role="status" aria-live="polite">No routed output generated.</pre>
  <div id="routedPreview" aria-label="Checked route preview"></div>
  <div class="row"><button id="routedSaveBoard" disabled>Routed .kicad_pcb</button><button id="routedSaveReceipt" disabled>Routed receipt</button><button id="routedSaveInputs" disabled>Handoff inputs</button></div>
  <p class="hint">Two copper layers only. The generated outline is a clearance envelope, not your mechanical package outline. Verify the exported board in KiCad with your native rules. No electrical, thermal or manufacturing signoff is implied.</p>`;
  container.append(panel);
  const $=id=>panel.querySelector('#'+id),json=v=>JSON.stringify(v,null,2);
  let witness=null,generated=null,fileEpoch=0;
  const buttons=['routedSaveBoard','routedSaveReceipt','routedSaveInputs'];
  function invalidate(message='Source or settings changed. Rebuild and verify.') {
    fileEpoch++;generated=null;buttons.forEach(id=>$(id).disabled=true);
    $('routedResult').textContent=message;$('routedPreview').replaceChildren();
  }
  function fail(error){invalidate('Rejected: '+error.message);}
  function download(name,value){const blob=new Blob([typeof value==='string'?value:json(value)],{type:'text/plain;charset=utf-8'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function inputs(){if(!witness)throw new Error('Load a route witness for the current project');return {project:getProject(),witness,technology:JSON.parse($('routedTechnology').value),specification:JSON.parse($('routedSpecification').value)};}
  function replay(){const d=inputs();if(!generated)throw new Error('Build and verify current routed output first');const r=verifyRoutedKiCad(d.project,d.witness,d.technology,generated.board,generated.receipt,d.specification);if(!r.ok)throw new Error(r.issues.join('; '));return d;}
  $('routedTechnology').value=json({units:'um',traceWidth:null,viaDiameter:null,padDiameter:null,clearance:null});
  $('routedSpecification').value=json({viaDrill:null,boardThickness:null,edgeMargin:null});
  $('routedWitnessFile').onchange=async()=>{
    invalidate();witness=null;$('routedWitnessInfo').textContent='Reading route witness…';const epoch=fileEpoch;
    try{const file=$('routedWitnessFile').files[0];if(!file||file.size>16*1024*1024)throw new Error('Choose route JSON at most 16 MiB');const text=await file.text();if(epoch!==fileEpoch)return;const value=JSON.parse(text);
      if(value?.type!=='openbumpplan-route-witness'||value.schemaVersion!==1||!Array.isArray(value.routes))throw new Error('Expected a route witness, not an export receipt or project');
      witness=value;$('routedWitnessInfo').textContent=`${value.routes.length} supplied routes; not yet verified against current project.`;
    }catch(error){if(epoch===fileEpoch){$('routedWitnessInfo').textContent='No valid route witness.';fail(error);}}
  };
  for(const id of ['routedTechnology','routedSpecification'])$(id).oninput=()=>invalidate();
  $('routedSample').onclick=()=>{try{invalidate();const d=routedHandoffDemo();setProject(d.project);witness=d.witness;$('routedTechnology').value=json(d.technology);$('routedSpecification').value=json(d.specification);$('routedWitnessInfo').textContent='Synthetic two-layer example: 2 supplied routes.';$('routedResult').textContent='Synthetic example loaded. Build to check and export.';}catch(error){fail(error);}};
  $('routedBuild').onclick=()=>{
    invalidate('Checking source routes and continuous copper…');
    try{const d=inputs(),r=exportRoutedKiCad(d.project,d.witness,d.technology,d.specification);
      const checked=verifyRoutedKiCad(d.project,d.witness,d.technology,r.board,r.receipt,d.specification);
      if(!checked.ok)throw new Error(checked.issues.join('; '));generated=r;
      const c=r.receipt.counts;$('routedResult').textContent=`Source checks pass · native structure replay passes\n${c.pads} pads · ${c.segments} traces · ${c.vias} vias · ${c.keepouts} keepouts\n${r.receipt.metrics.wireLengthUm} µm routed length\nKiCad native DRC has NOT been run in this browser.\nBoard SHA-256: ${r.receipt.boardSHA256}`;
      // SVG is produced by the escaping source renderer, never from file markup.
      $('routedPreview').innerHTML=exportRoutesSVG(d.project,d.witness);buttons.forEach(id=>$(id).disabled=false);
    }catch(error){fail(error);}
  };
  $('routedSaveBoard').onclick=()=>{try{replay();download('OpenBumpPlan_Routed.kicad_pcb',generated.board);}catch(error){fail(error);}};
  $('routedSaveReceipt').onclick=()=>{try{replay();download('OpenBumpPlan_Routed.receipt.json',generated.receipt);}catch(error){fail(error);}};
  $('routedSaveInputs').onclick=()=>{try{download('OpenBumpPlan_Routed.inputs.json',replay());}catch(error){fail(error);}};
  return {invalidate};
}
