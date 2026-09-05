import { emptyProject,normalizeProject,KINDS,stableStringify } from './core/model.js';
import { escapeHTML } from './core/exporters.js';
const esc=escapeHTML;
export function engineeringDemo(kind='exact') {
  const p=emptyProject(kind==='exact'?'Synthetic coupled-pair challenge':'Synthetic two-net routing obstacle');
  Object.assign(p.rules,{maxLength:2000,groundRadius:0,powerRadius:0,minGroundRatio:0,clockGroundMin:0,maxCrossings:100,requirePowerForSignals:false,pairMaxDistance:180,pairMaxSkew:200,crossingWeight:500});
  if(kind==='exact') {
    const targets=[[250,250],[300,350],[350,600],[250,500],[250,650],[250,350]];
    for(let i=0;i<6;i++){p.ports.push({id:`s${i}`,kind:'pad',x:0,y:i*100,net:`N${i}`,domain:'V1',role:'signal',pair:`P${Math.floor(i/2)}`,polarity:i%2?'-':'+',required:true},{id:`t${i}`,kind:'ball',x:targets[i][0],y:targets[i][1],role:'any'});p.connections.push({id:`e${i}`,from:`s${i}`,to:`t${i}`});}
  } else {
    for(let i=0;i<2;i++){p.ports.push({id:`s${i}`,kind:'pad',x:0,y:100+i*400,net:`N${i}`,domain:'V1',role:'signal',required:true},{id:`t${i}`,kind:'ball',x:600,y:100+i*400,role:'any'});p.connections.push({id:`e${i}`,from:`s${i}`,to:`t${i}`});}
  }
  return normalizeProject(p);
}
export function demoRoutingConfig() {return {x:0,y:0,pitch:100,columns:7,rows:7,layers:2,startLayer:0,endLayer:0,traceWidth:10,clearance:10,viaCost:10,passes:2,maxExpanded:200000,geometryBudget:2000000,obstacles:[{id:'L0-wall',x:250,y:-100,width:100,height:800,layers:[0]}]};}
export function routeSVG(result) {
  const c=result.config,width=(c.columns-1)*c.pitch,height=(c.rows-1)*c.pitch,pad=c.pitch*1.5,gap=pad*3,cols=Math.min(c.layers,2),rows=Math.ceil(c.layers/cols),colors=['#38bdf8','#a78bfa','#34d399','#fbbf24','#f472b6','#fb923c','#94a3b8','#e879f9'];
  let body='';
  for(let z=0;z<c.layers;z++) {
    const tx=pad+(z%cols)*(width+gap)-c.x,ty=pad+Math.floor(z/cols)*(height+gap)-c.y;
    body+=`<g transform="translate(${tx} ${ty})"><rect x="${c.x}" y="${c.y}" width="${width}" height="${height}" fill="#0b1424" stroke="#334155" stroke-width="${c.pitch/40}"/><text x="${c.x}" y="${c.y-c.pitch/2}" fill="#cbd5e1" font-size="${c.pitch/3}">Routing layer ${z}</text>`;
    for(const o of c.obstacles)if(o.layers.includes(z))body+=`<rect x="${Math.max(c.x,o.x)}" y="${Math.max(c.y,o.y)}" width="${Math.max(0,Math.min(c.x+width,o.x+o.width)-Math.max(c.x,o.x))}" height="${Math.max(0,Math.min(c.y+height,o.y+o.height)-Math.max(c.y,o.y))}" fill="#f87171" opacity="0.24"/>`;
    for(let i=0;i<result.routes.length;i++) {
      const route=result.routes[i],color=colors[i%colors.length];
      for(let j=1;j<route.points.length;j++) {
        const a=route.points[j-1],b=route.points[j];
        if(a.layer===z&&b.layer===z)body+=`<path d="M${a.x} ${a.y}L${b.x} ${b.y}" fill="none" stroke="${color}" stroke-width="${Math.max(c.traceWidth,c.pitch/16)}"><title>${esc(route.connectionId)}</title></path>`;
        if(a.layer!==b.layer&&(a.layer===z||b.layer===z))body+=`<circle cx="${a.x}" cy="${a.y}" r="${c.pitch/10}" fill="#0b1424" stroke="${color}" stroke-width="${c.pitch/30}"/>`;
      }
      for(const p of [route.points[0],route.points.at(-1)])if(p.layer===z)body+=`<circle cx="${p.x}" cy="${p.y}" r="${c.pitch/12}" fill="${color}"/>`;
    }
    body+='</g>';
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Checked routing layers, obstacles and vias" viewBox="0 0 ${cols*(width+gap)} ${rows*(height+gap)}" style="width:100%;max-height:500px;background:#0b1424">${body}</svg>`;
}
export function engineeringPage(project,{from,to,nodeLimit,maxChanges,changePenalty,configText,record,busy}) {
  const selection=(name,current)=>`<select name="${name}" aria-label="${name}">${KINDS.map(k=>`<option ${k===current?'selected':''}>${k}</option>`).join('')}</select>`;
  const fresh=record&&stableStringify(project)===stableStringify(record.input),r=record?.result,num=x=>x===null||x===undefined?'—':Number(x).toLocaleString('en-US',{maximumFractionDigits:6});
  let content='<p>No engineering result yet. Load a small challenge or use your current project. Solving never silently applies a mapping.</p>';
  if(r) {
    content=`<div class="notice ${fresh?'':'warn'}"><strong>${fresh?'Current input':'STALE — project changed'}</strong> · ${esc(record.kind)} · ${esc(r.status)}. ${esc(r.reason||r.limitation)}</div>`;
    if(record.kind==='exact')content+=`<div class="labstats"><div>Best feasible score<strong>${num(r.upperBound)}</strong></div><div>Lower bound<strong>${num(r.lowerBound)}</strong></div><div>Absolute gap<strong>${num(r.absoluteGap)}</strong></div><div>Search nodes<strong>${num(r.nodes)}</strong></div></div><p>${esc(r.scope.constraints)}. Optimality applies only to ${r.scope.sourceIds.length} movable sources and ${r.scope.targetIds.length} candidate targets in this stage, within ${r.tolerance} score tolerance.</p>${r.witness?`<div class="notice warn">Capacity conflict: ${r.witness.sources.length} sources compete for ${r.witness.targets.length} compatible targets (deficit ${r.witness.deficit}).<br>Sources: ${esc(r.witness.sources.join(', '))}<br>Targets: ${esc(r.witness.targets.join(', '))}</div>`:''}<p>Rejected complete candidates by rule: ${esc(JSON.stringify(r.rejectedByRule))}</p><button data-action="lab-apply" class="primary" ${!fresh||!r.project||busy?'disabled':''}>Apply checked candidate</button>`;
    else content+=`<div class="labstats"><div>Routed links<strong>${r.routes.length} / ${r.check.metrics.required}</strong></div><div>Wire length (um)<strong>${num(r.check.metrics.wireLength)}</strong></div><div>Vias<strong>${r.check.metrics.vias}</strong></div><div>Grid DRC errors<strong>${r.check.errors}</strong></div></div>${routeSVG(r)}<p>Independent path check: ${r.check.valid?'passes configured grid geometry':'NOT passed'}. Expanded ${r.expanded} nodes. Site keep-outs are not routing obstacles unless explicitly configured below.</p>${r.unrouted.map(u=>`<p class="warn">${esc(u.connectionId)}: ${esc(u.reason)}</p>`).join('')}${r.check.issues.slice(0,10).map(i=>`<p class="warn">${esc(i.code)}: ${esc(i.message)}</p>`).join('')}`;
    content+=`<div class="labactions"><button data-action="lab-result">Result JSON</button><button data-action="lab-input">Original input JSON</button><button data-action="lab-evidence">SHA-256 evidence</button>${record.kind==='routing'?'<button data-action="lab-svg">Route SVG</button>':''}</div><p class="hint">Evidence contains the recorded result and binds it to the original input, including revision/audit. Hashes are not signatures. The CLI verifies checksums and replays the declared computation.</p>`;
  }
  return `<section class="lab"><div class="labheading"><div><div class="eyebrow">Engineering workbench</div><h2>Measure. Check. Reproduce.</h2><p>Bounded exact assignment and obstacle-aware route feasibility. Not manufacturing signoff.</p></div><div class="labactions"><button data-action="lab-demo-exact">Solver challenge</button><button data-action="lab-demo-routing">Routing challenge</button></div></div><div class="labgrid"><aside class="card"><h3>Selected stage</h3><div class="formgrid"><label>From ${selection('fromStage',from)}</label><label>To ${selection('toStage',to)}</label></div><label>Exact search node budget<input id="labNodes" type="number" min="1" max="200000" value="${nodeLimit}"></label><div class="formgrid"><label>Max changed links<input id="labMaxChanges" type="number" min="0" max="16" value="${maxChanges}"></label><label>Cost per changed link<input id="labChangePenalty" type="number" min="0" value="${changePenalty}"></label></div><button data-action="lab-exact" class="primary" ${busy?'disabled':''}>Solve exact stage</button><p class="hint">ECO cost = planning score + cost per changed link × changed links. Default scope: up to 12 movable sources and 24 targets. Locks reduce the scope. Full coupled hard rules are checked at leaves. Unknown is never reported as infeasible.</p><h3>Routing configuration</h3><textarea id="labConfig" spellcheck="false" aria-label="Routing configuration JSON">${esc(configText)}</textarea><button data-action="lab-route" ${busy?'disabled':''}>Plan multilayer routes</button><p class="hint">Explicit grid, routing layers and rectangular obstacles. Off-grid endpoints are rejected, not moved. Layer numbers are routing layers, not pad/bump/ball categories.</p>${busy?'<div class="busy"><span class="spinner"></span>Bounded computation in worker…</div><button data-action="cancel-optimize">Cancel</button>':''}</aside><article class="card" id="engineeringResult" aria-live="polite">${content}</article></div></section>`;
}
