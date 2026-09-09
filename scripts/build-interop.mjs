import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),seen=new Set(),ordered=[];
function visit(relative) {
  if(seen.has(relative))return;seen.add(relative);
  const absolute=path.resolve(root,relative);
  if(!absolute.startsWith(root+path.sep))throw new Error('Module outside project root');
  let code=fs.readFileSync(absolute,'utf8');
  const imports=[...code.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm)];
  for(const match of imports)visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[2])));
  const exports=[...code.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)].map(m=>m[1]);
  code=code.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,(_,names,target)=>`const {${names}}=__mods[${JSON.stringify(path.posix.normalize(path.posix.join(path.posix.dirname(relative),target)))}];`).replace(/^export\s+/gm,'');
  ordered.push(`__mods[${JSON.stringify(relative)}]=(()=>{\n${code}\nreturn {${exports.join(',')}};})();`);
}
visit('src/interop-app.js');
const script='"use strict";\nconst __mods=Object.create(null);\n'+ordered.join('\n'),css=fs.readFileSync(path.join(root,'src/interop.css'),'utf8');
const template=fs.readFileSync(path.join(root,'interop.html'),'utf8');
const html=template.replace('<link rel="stylesheet" href="./src/interop.css">',()=>`<style>${css}</style>`).replace('<script type="module" src="./src/interop-app.js"></script>',()=>`<script type="module">${script.replace(/<\/script/gi,'<\\/script')}</script>`);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});fs.writeFileSync(path.join(root,'dist/interop.html'),html);
const sha=createHash('sha256').update(html).digest('hex');fs.writeFileSync(path.join(root,'dist/INTEROP-SHA256SUMS'),`${sha}  interop.html\n`);console.log(JSON.stringify({file:'dist/interop.html',bytes:Buffer.byteLength(html),sha256:sha}));
