import { KINDS, ROLES, normalizeProject } from './model.js';
export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
const UNIT_SCALE = {um:1, mm:1000, nm:0.001};
export function guardText(text) {
  if(typeof text!=='string' || new TextEncoder().encode(text).length>MAX_IMPORT_BYTES)throw new Error('Import must be text and no larger than 5 MiB.');
  if(text.includes('\0'))throw new Error('Binary/NUL data is not supported.');
  return text.replace(/^\uFEFF/,'');
}
/** Strict RFC-4180-style parser: quoted commas, quotes, and embedded newlines. */
export function parseCSV(raw) {
  const text=guardText(raw);const rows=[];let row=[],field='',inQuote=false,afterQuote=false,atStart=true;
  const endField=()=>{row.push(field);field='';afterQuote=false;atStart=true;};
  const endRow=()=>{endField();if(row.some(v=>v!==''))rows.push(row);row=[];};
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(inQuote) {if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{inQuote=false;afterQuote=true;}}else field+=c;continue;}
    if(c==='"'){if(!atStart)throw new Error(`Unexpected quote at CSV character ${i+1}.`);inQuote=true;atStart=false;continue;}
    if(c===','){endField();continue;}
    if(c==='\r'||c==='\n'){if(c==='\r'&&text[i+1]==='\n')i++;endRow();continue;}
    if(afterQuote)throw new Error(`Unexpected character after closing CSV quote at ${i+1}.`);
    field+=c;atStart=false;
  }
  if(inQuote)throw new Error('CSV contains an unterminated quoted field.');
  if(row.length||field||afterQuote)endRow();
  if(rows.length<1)throw new Error('CSV is empty.');
  const headers=rows.shift().map(h=>h.trim());
  if(headers.some(h=>!h)||new Set(headers).size!==headers.length)throw new Error('CSV has empty or duplicate column headers.');
  return rows.map((values,i)=>{if(values.length!==headers.length)throw new Error(`CSV row ${i+2}: expected ${headers.length} columns, received ${values.length}.`);return Object.fromEntries(headers.map((h,j)=>[h,values[j]]));});
}
const decodeSafeRow = row => {
  if(row._text_encoding && row._text_encoding!=='apostrophe-v1')throw new Error('Unknown CSV text encoding.');
  if(row._text_encoding==='apostrophe-v1')for(const key of Object.keys(row))if(row[key].startsWith("'"))row[key]=row[key].slice(1);
  return row;
};
const parseBool = (value,fallback=false) => {
  if(value===undefined||value==='')return fallback;
  const v=value.trim().toLowerCase();if(['true','1'].includes(v))return true;if(['false','0'].includes(v))return false;
  throw new Error(`Invalid boolean ${JSON.stringify(value)}; use true/false or 1/0.`);
};
const parseNumber = (value,name) => {
  if(value===undefined||!value.trim()||!Number.isFinite(Number(value)))throw new Error(`${name} must contain a finite numeric value.`);
  return Number(value);
};
export function importPortsCSV(text,{kind='pad',dieId='',units='um'}={}) {
  if(!UNIT_SCALE[units])throw new Error('CSV units must be um, mm, or nm.');
  const rows=parseCSV(text),allowed=new Set(['id','label','x','y','kind','dieId','net','domain','role','pair','polarity','locked','required','units','_text_encoding']);
  const seen=new Set();
  const ports=rows.map((r,i)=>{
    r=decodeSafeRow(r);
    for(const key of Object.keys(r))if(!allowed.has(key))throw new Error(`Unknown CSV column ${key}; use the documented headers.`);
    if(!r.id?.trim())throw new Error(`CSV row ${i+2}: id is required.`);
    const id=r.id.trim();if(seen.has(id))throw new Error(`Duplicate port id ${id}.`);seen.add(id);
    const scale=UNIT_SCALE[r.units?.trim()||units];if(!scale)throw new Error(`CSV row ${i+2}: unsupported units.`);
    const n={id,label:r.label?.trim()||id,kind:r.kind?.trim()||kind,dieId:r.dieId?.trim()||dieId,
      x:parseNumber(r.x,`row ${i+2} x`)*scale,y:parseNumber(r.y,`row ${i+2} y`)*scale,
      net:r.net?.trim()||'',domain:r.domain?.trim()||'',role:r.role?.trim()||'any',pair:r.pair?.trim()||'',polarity:r.polarity?.trim()||'',
      locked:parseBool(r.locked),required:parseBool(r.required)};
    if(!KINDS.includes(n.kind)||!ROLES.includes(n.role))throw new Error(`CSV row ${i+2}: invalid kind or role.`);
    if(!['','+','-'].includes(n.polarity)||Boolean(n.pair)!==Boolean(n.polarity))throw new Error(`CSV row ${i+2}: provide both pair and +/- polarity.`);
    return n;
  });
  if(!ports.length)throw new Error('CSV contains no port rows.');
  return {ports,warnings:ports.some(n=>!n.domain&&['signal','clock','power'].includes(n.role))?['Some ports have no voltage domain. Fill it in before electrical review.']:[]};
}
export function importConnectionsCSV(text) {
  const rows=parseCSV(text),allowed=new Set(['id','from','to','net','locked','signal','length_um','_text_encoding']),seen=new Set();
  return rows.map((r,i)=>{
    r=decodeSafeRow(r);
    for(const k of Object.keys(r))if(!allowed.has(k))throw new Error(`Unknown connection CSV column ${k}.`);
    if(!r.from?.trim()||!r.to?.trim())throw new Error(`Row ${i+2}: from and to are required.`);
    const id=r.id?.trim()||`link:${r.from.trim()}`;if(seen.has(id))throw new Error(`Duplicate connection id ${id}.`);seen.add(id);
    return {id,from:r.from.trim(),to:r.to.trim(),net:r.net?.trim()||'',locked:parseBool(r.locked)};
  });
}
export function importJSON(text) {return normalizeProject(JSON.parse(guardText(text)));}
/** Deliberately limited LEF geometry importer, NOT a complete LEF parser.
 * Coordinates in LEF geometry are micrometres, not DATABASE MICRONS integers.
 * Nonzero ORIGIN, polygons, paths, vias, masks, and iterated shapes are rejected.
 */
export function importLEF(raw,{macroName='',dieId='DIE',x=0,y=0}={}) {
  const text=guardText(raw),tokens=(text.match(/#[^\n]*|"(?:\\.|[^"\\])*"|;|[^\s;]+/g)||[]).filter(t=>!t.startsWith('#'));
  const macros=[];
  for(let i=0;i<tokens.length;i++)if(tokens[i].toUpperCase()==='MACRO') {
    const name=tokens[++i],start=i+1;let end=-1;
    for(let j=start;j<tokens.length-1;j++)if(tokens[j].toUpperCase()==='END'&&tokens[j+1]===name){end=j;break;}
    if(end<0)throw new Error(`LEF MACRO ${name} has no matching END.`);
    macros.push({name,tokens:tokens.slice(start,end)});i=end+1;
  }
  if(!macros.length)throw new Error('No LEF MACRO found.');
  if(macros.length>1&&!macroName)throw new Error(`Multiple macros found (${macros.map(m=>m.name).join(', ')}). Select a macro explicitly.`);
  const macro=macroName?macros.find(m=>m.name===macroName):macros[0];if(!macro)throw new Error(`LEF macro ${macroName} not found.`);
  const t=macro.tokens,upper=t.map(v=>v.toUpperCase()),size=upper.indexOf('SIZE'),origin=upper.indexOf('ORIGIN');
  if(size<0||upper[size+2]!=='BY')throw new Error('LEF macro must declare SIZE width BY height.');
  const width=Number(t[size+1]),height=Number(t[size+3]);if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw new Error('Invalid LEF macro dimensions.');
  if(origin>=0&&(Number(t[origin+1])!==0||Number(t[origin+2])!==0))throw new Error('Nonzero LEF ORIGIN is not supported. Export normalized coordinates to CSV instead.');
  const ports=[],warnings=[];
  for(let i=0;i<t.length;i++)if(upper[i]==='PIN') {
    const name=t[++i],start=i+1;let end=-1;
    for(let j=start;j<t.length-1;j++)if(upper[j]==='END'&&t[j+1]===name){end=j;break;}
    if(end<0)throw new Error(`LEF PIN ${name} has no matching END.`);
    const body=t.slice(start,end),u=body.map(v=>v.toUpperCase());
    if(['POLYGON','PATH','VIA','ITERATE','MASK'].some(word=>u.includes(word)))throw new Error(`PIN ${name} contains unsupported geometry. Only non-iterated, unmasked RECT pin shapes are supported.`);
    const rects=[];
    for(let j=0;j<body.length;j++)if(u[j]==='RECT') {
      const r=body.slice(j+1,j+5).map(Number);if(r.length!==4||r.some(v=>!Number.isFinite(v))||body[j+5]!==';'||r[2]<=r[0]||r[3]<=r[1])throw new Error(`PIN ${name} has an invalid RECT.`);rects.push(r);
    }
    if(!rects.length)throw new Error(`PIN ${name} has no supported RECT. No pin will be silently dropped.`);
    const use=u.indexOf('USE'),role=use<0?'signal':({POWER:'power',GROUND:'ground',CLOCK:'clock'}[u[use+1]]||'signal');
    const left=Math.min(...rects.map(r=>r[0])),bottom=Math.min(...rects.map(r=>r[1])),right=Math.max(...rects.map(r=>r[2])),top=Math.max(...rects.map(r=>r[3]));
    ports.push({id:`${dieId}:${name}`,label:name,kind:'pad',dieId,x:(left+right)/2,y:(bottom+top)/2,net:name,domain:'',role,pair:'',polarity:'',locked:false,required:true});
    if(rects.length>1)warnings.push(`${name}: using the bounding-box centre of ${rects.length} rectangles; review the representative point.`);
    i=end+1;
  }
  if(!ports.length)throw new Error('LEF macro contains no supported PINs.');
  return {die:{id:dieId,name:macro.name,x,y,width,height,rotation:0,mirrorX:false,edgeKeepout:0,cornerKeepout:0},ports,
    warnings:[...warnings,'LEF import is a rectangular-pin planning subset. Assign voltage domains and review electrical metadata.']};
}
export function rowLabel(index) {
  const alphabet='ABCDEFGHJKLMNPRTUVWY';let label='';
  do {label=alphabet[index%alphabet.length]+label;index=Math.floor(index/alphabet.length)-1;}while(index>=0);
  return label;
}
export function generateArray({rows=8,columns=8,pitch=500,x=0,y=0,kind='ball',prefix='BGA',dieId='',role='any',domain='',reserved=[]}={}) {
  if(!Number.isInteger(rows)||!Number.isInteger(columns)||rows<1||columns<1||rows*columns>10000)throw new Error('Array dimensions must be positive integers with at most 10000 sites.');
  if(!Number.isFinite(pitch)||pitch<=0||![x,y].every(Number.isFinite)||!KINDS.includes(kind)||!ROLES.includes(role))throw new Error('Invalid array geometry, kind, or role.');
  const ports=[];
  for(let row=0;row<rows;row++)for(let col=0;col<columns;col++) {
    const label=`${rowLabel(row)}${col+1}`;
    ports.push({id:`${prefix}:${label}`,label,kind,dieId,x:x+col*pitch,y:y+row*pitch,role:reserved.includes(label)?'reserved':role,domain,net:'',pair:'',polarity:'',locked:false,required:false});
  }
  return ports;
}
