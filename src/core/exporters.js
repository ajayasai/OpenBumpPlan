import { VERSION, KINDS, effectiveSignals, worldPoint, transformPoint, fingerprint } from './model.js';
import { analyze } from './rules.js';
export const escapeHTML = value => String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const LAYER_COLORS = {pad:'#f4b56a',bump:'#5fe1cc',interposer:'#b69af9',ball:'#76b6ff',pcb:'#ed9dcc'};
export const ROLE_COLORS = {any:'#8494a9',signal:'#76b6ff',clock:'#e6a4f9',power:'#f4b56a',ground:'#5fe1cc',reserved:'#f57883',nc:'#596a7e'};
const csvEncode = value => {
  let s=String(value??'');
  if(typeof value==='string' && /^[\s]*[=+\-@']/.test(s))s="'"+s;
  return /[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
};
export const csvTable = (headers,rows) => [headers.join(','),...rows.map(row=>row.map(csvEncode).join(','))].join('\r\n')+'\r\n';
export function exportPortsCSV(p) {
  const headers=['id','label','kind','dieId','x','y','net','domain','role','pair','polarity','locked','required','units','_text_encoding'];
  return csvTable(headers,p.ports.map(n=>headers.map(k=>k==='units'?'um':k==='_text_encoding'?'apostrophe-v1':n[k])));
}
export function exportConnectionsCSV(p) {
  const ctx=effectiveSignals(p),a=analyze(p);
  return csvTable(['id','from','to','net','locked','signal','length_um','_text_encoding'],p.connections.map(e=>[e.id,e.from,e.to,e.net,e.locked,ctx.signals.get(e.from).net,a.lengths[e.id],'apostrophe-v1']));
}
export const exportJSON = p => JSON.stringify(p,null,2)+'\n';
export function layoutProject(p,{view='physical',layers=KINDS}={}) {
  const ctx=effectiveSignals(p),physical=p.ports.map(n=>worldPoint(n,ctx));
  const xs=physical.map(n=>n.x),ys=physical.map(n=>n.y);
  const xmin=Math.min(0,...xs),xmax=Math.max(1000,...xs),ymin=Math.min(0,...ys),ymax=Math.max(1000,...ys),span=xmax-xmin+1200;
  const offsets=Object.fromEntries(KINDS.map((k,i)=>[k,view==='exploded'?i*span:0]));
  const nodes=p.ports.filter(n=>layers.includes(n.kind)).map(n=>{const q=worldPoint(n,ctx);return {...n,sx:q.x+offsets[n.kind],sy:-q.y,signal:ctx.signals.get(n.id)};});
  const corners=[];
  for(const d of p.dies)for(const q of [{x:0,y:0},{x:d.width,y:0},{x:d.width,y:d.height},{x:0,y:d.height}]){const w=transformPoint(q,d);corners.push({sx:w.x,sy:-w.y});}
  const all=[...nodes,...corners],bx=Math.min(xmin,...all.map(n=>n.sx))-350,by=Math.min(-ymax,...all.map(n=>n.sy))-400;
  const bw=Math.max(xmax,...all.map(n=>n.sx))-bx+450,bh=Math.max(-ymin,...all.map(n=>n.sy))-by+350;
  return {ctx,nodes,offsets,bounds:{x:bx,y:by,width:bw,height:bh},span};
}
export function diagram(p,{view='physical',layers=KINDS,selected='',showLabels=true,baseline=null}={}) {
  const layout=layoutProject(p,{view,layers}),{ctx,nodes,offsets,bounds}=layout;
  const ids=new Map(nodes.map(n=>[n.id,n])),selectedSignal=ctx.signals.get(selected)?.net;
  let body='';
  if(view==='exploded')for(const kind of layers) body+=`<text x="${bounds.x+offsets[kind]+500}" y="${bounds.y+160}" fill="${LAYER_COLORS[kind]}" font-size="140" font-family="sans-serif">${kind.toUpperCase()}</text>`;
  for(const d of p.dies)for(const layer of view==='exploded'?layers.filter(k=>['pad','bump'].includes(k)):['pad']) {
    const corners=[{x:0,y:0},{x:d.width,y:0},{x:d.width,y:d.height},{x:0,y:d.height}].map(q=>transformPoint(q,d));
    body+=`<polygon points="${corners.map(q=>`${q.x+offsets[layer]},${-q.y}`).join(' ')}" fill="#172233" fill-opacity="0.55" stroke="#52637b" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    const label=corners[0];body+=`<text x="${label.x+offsets[layer]+30}" y="${-label.y+140}" fill="#94a6bc" font-size="90" font-family="sans-serif">${escapeHTML(d.name)} / R${d.rotation}${d.mirrorX?' MX':''}</text>`;
  }
  for(const k of p.keepouts) {
    const d=ctx.dies.get(k.dieId),points=[{x:k.x,y:k.y},{x:k.x+k.width,y:k.y},{x:k.x+k.width,y:k.y+k.height},{x:k.x,y:k.y+k.height}].map(q=>transformPoint(q,d));
    for(const kind of view==='exploded'?k.kinds.filter(v=>layers.includes(v)):['pad'])body+=`<polygon points="${points.map(q=>`${q.x+offsets[kind]},${-q.y}`).join(' ')}" fill="#f57883" fill-opacity="0.2" stroke="#f57883" stroke-dasharray="5 4" stroke-width="1" vector-effect="non-scaling-stroke"><title>Keep-out: ${escapeHTML(k.id)}</title></polygon>`;
  }
  if(baseline) {
    const old=layoutProject(baseline,{view,layers}),oldIds=new Map(old.nodes.map(n=>[n.id,n]));
    for(const e of baseline.connections){const a=oldIds.get(e.from),b=oldIds.get(e.to);if(a&&b)body+=`<line x1="${a.sx}" y1="${a.sy}" x2="${b.sx}" y2="${b.sy}" stroke="#f57883" stroke-opacity="0.35" stroke-dasharray="4 5" stroke-width="1" vector-effect="non-scaling-stroke"/>`;}
  }
  for(const e of p.connections) {
    const a=ids.get(e.from),b=ids.get(e.to);if(!a||!b)continue;
    const hot=selected&&(e.from===selected||e.to===selected||selectedSignal&&a.signal.net===selectedSignal);
    body+=`<line data-edge="${escapeHTML(e.id)}" x1="${a.sx}" y1="${a.sy}" x2="${b.sx}" y2="${b.sy}" stroke="${ROLE_COLORS[a.signal.role]}" stroke-opacity="${hot?0.95:selected?0.12:0.36}" stroke-width="${hot?2:0.9}" vector-effect="non-scaling-stroke"><title>${escapeHTML(a.signal.net || '(unnamed)')}: ${escapeHTML(e.from)} to ${escapeHTML(e.to)}</title></line>`;
  }
  for(const n of nodes) {
    const hot=n.id===selected,fill=ROLE_COLORS[n.signal.role],radius=n.kind==='ball'?48:32;
    body+=`<g data-port="${escapeHTML(n.id)}" class="port" tabindex="0" role="button" aria-label="${escapeHTML(`${n.id}, ${n.signal.net||'unassigned'}, ${n.signal.role}`)}">`;
    if(hot)body+=`<circle cx="${n.sx}" cy="${n.sy}" r="${radius+35}" fill="none" stroke="#ffffff" stroke-width="2" vector-effect="non-scaling-stroke"/>`;
    body+=`<circle cx="${n.sx}" cy="${n.sy}" r="${radius}" fill="${fill}" fill-opacity="${n.role==='nc'?0.35:0.95}" stroke="${n.locked?'#ffffff':LAYER_COLORS[n.kind]}" stroke-width="${n.locked?2:0.7}" vector-effect="non-scaling-stroke"/><title>${escapeHTML(n.id)} | ${escapeHTML(n.signal.net || '(unassigned)')} | ${escapeHTML(n.signal.domain)}${n.locked?' | LOCKED':''}</title>`;
    if(['reserved','nc'].includes(n.role))body+=`<path d="M ${n.sx-radius} ${n.sy-radius} L ${n.sx+radius} ${n.sy+radius}" stroke="#ffffff" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
    if(showLabels&&(nodes.length<=350||hot))body+=`<text x="${n.sx+radius+20}" y="${n.sy-30}" fill="${hot?'#ffffff':'#acbad0'}" font-size="70" font-family="sans-serif" pointer-events="none">${escapeHTML(n.label)}</text>`;
    body+='</g>';
  }
  return {...layout,body};
}
export function exportSVG(p,options={}) {
  const d=diagram(p,options),b=d.bounds;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="${b.x} ${b.y} ${b.width} ${b.height}" role="img" aria-label="${escapeHTML(p.name)}"><title>${escapeHTML(p.name)} - OpenBumpPlan planning view</title><rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#0e1522"/>${d.body}</svg>`;
}
const fmt = n => Number(n).toLocaleString('en-US',{maximumFractionDigits:2});
const statusText = a => !a.complete?'NOT FULLY CHECKED':a.errors?'REVIEW REQUIRED':a.warnings?'PLANNING WARNINGS':'PLANNING CHECKS PASS - NOT SIGNOFF';
const markdownCell = s => String(s??'').replaceAll('|','\\|').replaceAll('\n',' ');
export function exportICDMarkdown(p) {
  const a=analyze(p),ctx=effectiveSignals(p);
  let text=`# ${p.name}\n\nInterface-control document | OpenBumpPlan ${VERSION}\n\nRevision: ${p.revision} | Review ID: ${fingerprint(p)} | Units: um\n\n**${statusText(a)}**\n\n${p.description}\n\n## Coordinate convention\n\nAll canonical coordinates are micrometres. Positive Y is up. Die ports use local coordinates; die transforms mirror local X first, rotate counter-clockwise about the local origin, then translate to package XY. Other ports use package XY. Screen exploded offsets are never used for scoring.\n\n## Planning metrics\n\n${a.metrics.ports} sites; ${a.metrics.connections} assignments; ${fmt(a.metrics.totalLength)} um total L1; ${a.metrics.crossings} straight-line crossings; ${a.errors} errors; ${a.warnings} warnings. Score: ${fmt(a.metrics.score)}${a.complete?'':' (lower bound: analysis incomplete)'}.\n\n## Mechanical interfaces\n\n| Die | Origin X | Origin Y | Width | Height | Rotation | Mirror X |\n|---|---:|---:|---:|---:|---:|---|\n`;
  for(const d of p.dies)text+=`| ${markdownCell(d.id)} | ${d.x} | ${d.y} | ${d.width} | ${d.height} | ${d.rotation} | ${d.mirrorX} |\n`;
  text+='\n## Interface assignments\n\n| Source | Destination | Effective net | Domain | Role | L1 (um) | Locked |\n|---|---|---|---|---|---:|---|\n';
  for(const e of p.connections){const s=ctx.signals.get(e.from);text+=`| ${[e.from,e.to,s.net,s.domain,s.role,fmt(a.lengths[e.id]),e.locked].map(markdownCell).join(' | ')} |\n`;}
  text+='\n## Constraints\n\n```json\n'+JSON.stringify({rules:p.rules,keepouts:p.keepouts,regions:p.regions},null,2)+'\n```\n\n## Findings\n\n';
  text+=a.issues.length?a.issues.map(i=>`- ${i.severity.toUpperCase()} / ${i.code}: ${i.message}`).join('\n'):'No configured-rule findings.';
  text+='\n\n## Review and limitations\n\nPlanning only. Crossings are same-stage straight-ratsnest crossings; overlaps are reported separately. L1 is not routed electrical length. Ground proximity and power quotas are geometric proxies, not SI/PI/EM/thermal results. No foundry/package signoff is implied. Unknown domains/nets and incomplete analysis block readiness. The review identifier and local audit are not cryptographic signatures.\n\nEngineering owner: __________  Reviewer: __________  Approval date: __________\n';
  return text;
}
export function exportICDHTML(p) {
  const a=analyze(p),ctx=effectiveSignals(p),table=(headers,rows)=>`<table><thead><tr>${headers.map(h=>`<th>${escapeHTML(h)}</th>`).join('')}</tr></thead><tbody>${rows.map(row=>`<tr>${row.map(c=>`<td>${escapeHTML(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>${escapeHTML(p.name)} - ICD</title><style>body{font:14px/1.6 system-ui,sans-serif;max-width:1120px;margin:40px auto;padding:0 28px;color:#142138}h1{font-size:32px;line-height:1.2}h2{margin-top:32px;border-bottom:1px solid #ccd5e3;padding-bottom:8px}table{border-collapse:collapse;width:100%;font-size:12px}td,th{padding:7px;text-align:left;border-bottom:1px solid #d9e0eb;overflow-wrap:anywhere}th{background:#eef3f9}.status{background:#eef3f9;padding:18px;font-weight:700}pre{background:#f3f6fa;white-space:pre-wrap;padding:16px;font:12px/1.5 monospace}svg{width:100%;height:auto;max-height:500px}footer{margin:40px 0;color:#5b6a7e}@media print{body{margin:0;font-size:10px}h2{break-after:avoid}tr{break-inside:avoid}thead{display:table-header-group}svg{max-height:360px}}</style></head><body><p>OPENBUMPPLAN / INTERFACE CONTROL</p><h1>${escapeHTML(p.name)}</h1><p>Revision ${p.revision} &middot; Review ID ${fingerprint(p)} &middot; Canonical units: micrometres</p><p>${escapeHTML(p.description)}</p><p class="status">${statusText(a)}</p><h2>Planning summary</h2>${table(['Sites','Assignments','Total L1 (um)','Crossings','Errors','Warnings'],[[a.metrics.ports,a.metrics.connections,fmt(a.metrics.totalLength),a.metrics.crossings,a.errors,a.warnings]])}${exportSVG(p).replace(/<\?xml[^>]*\?>/,'')}<h2>Coordinate convention</h2><p>Positive Y is up. Die-local X is mirrored first (when enabled), then rotated counter-clockwise about the die origin and translated into package coordinates. Bumps may be die-local; package/interposer/PCB sites can use package XY. Exploded display offsets never change physical scores.</p><h2>Mechanical interfaces</h2>${table(['Die','X','Y','Width','Height','Rotation','Mirror X'],p.dies.map(d=>[d.id,d.x,d.y,d.width,d.height,d.rotation,d.mirrorX]))}<h2>Assignments</h2>${table(['Source','Destination','Effective net','Domain','Role','L1 (um)','Locked'],p.connections.map(e=>{const s=ctx.signals.get(e.from);return[e.from,e.to,s.net,s.domain,s.role,fmt(a.lengths[e.id]),e.locked];}))}<h2>Configured constraints</h2><pre>${escapeHTML(JSON.stringify({rules:p.rules,keepouts:p.keepouts,regions:p.regions},null,2))}</pre><h2>Findings</h2>${a.issues.length?table(['Severity','Rule','Explanation'],a.issues.map(i=>[i.severity,i.code,i.message])):'<p>No configured-rule findings.</p>'}<h2>Review boundaries</h2><p>This is a planning document, not fabrication approval. Straight-line crossings do not establish a routed-layer short. L1 length is not routed electrical length. Ground proximity and power quotas are geometric proxies; no signal-integrity, power-integrity, electromigration, thermal, or manufacturing signoff has been performed. Local audit/review IDs are not tamper-proof signatures.</p><p>Engineering owner: __________________ Reviewer: __________________ Approval date: __________________</p><footer>Generated by OpenBumpPlan ${VERSION}. Data remains local unless you explicitly export or share it.</footer></body></html>`;
}
/** Small, vector/text PDF writer. Base14 Helvetica, printable ASCII transliteration.
 * HTML/JSON/CSV/SVG retain full Unicode; PDF text outside ASCII is transliterated.
 */
export function exportPDF(p) {
  const a=analyze(p),ctx=effectiveSignals(p),pages=[];let commands=[],y=0;
  const ascii = s => String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7E]/g,'?');
  const pdfText = s => ascii(s).replace(/[\\()]/g,c=>'\\'+c);
  const drawText=(text,x,yy,size=10,bold=false)=>commands.push(`BT /${bold?'F2':'F1'} ${size} Tf 0.10 0.16 0.24 rg 1 0 0 1 ${x} ${yy} Tm (${pdfText(text)}) Tj ET`);
  const newPage=()=>{if(commands.length)pages.push(commands.join('\n'));commands=[];drawText('OPENBUMPPLAN / INTERFACE CONTROL',44,806,9,true);commands.push('0.78 0.83 0.88 RG 44 796 m 551 796 l S');drawText(`Revision ${p.revision} | ${fingerprint(p)} | planning only`,44,28,8);drawText(`Page ${pages.length+1}`,510,28,8);y=773;};
  const line=(text,size=10,bold=false)=>{
    const max=Math.floor(505/(size*0.59)),words=ascii(text).split(/\s+/);let current='';const lines=[];
    for(const word of words){if(word.length>max){if(current){lines.push(current);current='';}for(let i=0;i<word.length;i+=max)lines.push(word.slice(i,i+max));}else if((current+' '+word).trim().length>max){lines.push(current);current=word;}else current=(current+' '+word).trim();}
    if(current||!lines.length)lines.push(current);
    for(const textLine of lines){if(y<55)newPage();drawText(textLine,44,y,size,bold);y-=size*1.55;}
  };
  const heading=text=>{if(y<100)newPage();y-=12;line(text,14,true);y-=3;};
  newPage();line(p.name,21,true);line(`Status: ${statusText(a)}`,10,true);line(`${a.metrics.ports} sites | ${a.metrics.connections} assignments | ${fmt(a.metrics.totalLength)} um total L1 | ${a.metrics.crossings} crossings`,9);
  line(`${a.errors} errors | ${a.warnings} warnings | Score ${fmt(a.metrics.score)}${a.complete?'':' (INCOMPLETE / lower bound)'}`,9);
  y-=12;
  const layout=layoutProject(p),b=layout.bounds,mapHeight=240,scale=Math.min(505/b.width,mapHeight/b.height),mapBottom=y-mapHeight;
  commands.push(`0.96 0.97 0.99 rg 44 ${mapBottom} 507 ${mapHeight} re f`);
  const xy=n=>({x:44+(n.x-b.x)*scale,y:mapBottom+mapHeight-(-n.y-b.y)*scale});
  for(const e of p.connections){const s=xy(worldPoint(ctx.ports.get(e.from),ctx)),t=xy(worldPoint(ctx.ports.get(e.to),ctx));commands.push(`0.55 0.63 0.72 RG 0.4 w ${s.x.toFixed(3)} ${s.y.toFixed(3)} m ${t.x.toFixed(3)} ${t.y.toFixed(3)} l S`);}
  for(const n of p.ports){const q=xy(worldPoint(n,ctx));const role=ctx.signals.get(n.id).role;const rgb=role==='ground'?'0.08 0.55 0.42':role==='power'?'0.75 0.38 0.12':'0.19 0.40 0.68';commands.push(`${rgb} rg ${(q.x-1.5).toFixed(3)} ${(q.y-1.5).toFixed(3)} 3 3 re f`);}
  y=mapBottom-20;line('Physical XY projection; assignments are planning lines, not routed conductors.',8);
  heading('Coordinate convention');line('Canonical unit: micrometre (um). Positive Y is up. Die ports use local coordinates: mirror local X, rotate counter-clockwise around the local origin, then translate to package XY. Display separation never affects scoring.',9);
  heading('Review boundary');line('Not signoff. Manhattan length and straight-line crossings are proxies, not physical routing or electrical simulation. Ground proximity and power quotas do not certify SI, PI, EM, thermal, or manufacturability. The local review ID is not a cryptographic signature.',9);
  newPage();heading('Mechanical interfaces');
  for(const d of p.dies)line(`${d.id}: origin (${d.x}, ${d.y}) um; size ${d.width} x ${d.height} um; R${d.rotation}; mirror X ${d.mirrorX}`,9);
  heading('Interface assignments');
  for(const e of p.connections){if(y<95)newPage();const s=ctx.signals.get(e.from);line(`${e.from} -> ${e.to}`,9,true);line(`Net ${s.net||'(unnamed)'} | ${s.domain||'(no domain)'} | ${s.role} | L1 ${fmt(a.lengths[e.id])} um${e.locked?' | LOCKED':''}`,8);y-=4;}
  heading('Configured rules');for(const [k,v]of Object.entries(p.rules))line(`${k}: ${typeof v==='object'?JSON.stringify(v):v}`,9);
  heading('Keep-outs and P/G regions');for(const k of [...p.keepouts,...p.regions])line(JSON.stringify(k),8);if(!p.keepouts.length&&!p.regions.length)line('None configured.',9);
  heading('Findings');if(!a.issues.length)line('No configured-rule findings.',9);for(const issue of a.issues)line(`${issue.severity.toUpperCase()} / ${issue.code}: ${issue.message}`,9);
  if(a.detailsTruncated)line('Finding detail limit reached. Consult JSON validation output and split the design.',9,true);
  heading('Review and approval');line('Engineering owner: ____________________',10);line('Reviewer: ____________________   Approval date: ____________________',10);line('PDF text uses printable ASCII transliteration. Use HTML or JSON for full Unicode labels.',8);
  pages.push(commands.join('\n'));
  const objects=['','<< /Type /Catalog /Pages 2 0 R >>','', '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>'];
  const kids=[];
  for(const content of pages){const pageId=objects.length,streamId=pageId+1;kids.push(`${pageId} 0 R`);objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${streamId} 0 R >>`);objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);}
  objects[2]=`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pages.length} >>`;
  let output='%PDF-1.4\n%OpenBumpPlan\n';const offsets=[0];
  for(let i=1;i<objects.length;i++){offsets.push(output.length);output+=`${i} 0 obj\n${objects[i]}\nendobj\n`;}
  const xref=output.length;output+=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)output+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  output+=`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(output);
}
