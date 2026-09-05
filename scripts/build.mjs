import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
function bundle(entry) {
  const seen=new Set(),ordered=[];
  function visit(relative) {
    if(seen.has(relative))return;seen.add(relative);
    const absolute=path.resolve(root,relative);if(!absolute.startsWith(root+path.sep))throw new Error('Module outside project root.');
    let code=fs.readFileSync(absolute,'utf8');
    const imports=[...code.matchAll(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm)];
    for(const match of imports)visit(path.posix.normalize(path.posix.join(path.posix.dirname(relative),match[2])));
    const exports=[...code.matchAll(/^export\s+(?:async\s+)?(?:function|class|const|let)\s+(\w+)/gm)].map(m=>m[1]);
    code=code.replace(/^import\s+\{([^}]+)\}\s+from\s+['"]([^'"]+)['"];?\s*$/gm,(_,names,target)=>`const {${names}} = __mods[${JSON.stringify(path.posix.normalize(path.posix.join(path.posix.dirname(relative),target)))}];`);
    code=code.replace(/^export\s+/gm,'');
    ordered.push(`__mods[${JSON.stringify(relative)}] = (()=>{\n${code}\nreturn {${exports.join(',')}};\n})();`);
  }
  visit(entry);return '"use strict";\nconst __mods=Object.create(null);\n'+ordered.join('\n');
}
const worker=bundle('src/worker.js'),app=bundle('src/app.js'),css=fs.readFileSync(path.join(root,'src/styles.css'),'utf8');
const script=`globalThis.OPENBUMPPLAN_WORKER_SOURCE=${JSON.stringify(worker)};\n${app}`;
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace('<link rel="stylesheet" href="./src/styles.css">',`<style>\n${css}\n</style>`).replace('<script type="module" src="./src/app.js"></script>',`<script type="module">\n${script.replace(/<\/script/gi,'<\\/script')}\n</script>`);
fs.mkdirSync(path.join(root,'dist'),{recursive:true});
fs.writeFileSync(path.join(root,'dist/openbumpplan.html'),html);
fs.writeFileSync(path.join(root,'dist/index.html'),html);
const sha=createHash('sha256').update(html).digest('hex');
fs.writeFileSync(path.join(root,'dist/SHA256SUMS'),`${sha}  openbumpplan.html\n${sha}  index.html\n`);
console.log(`Built offline application: ${Buffer.byteLength(html).toLocaleString()} bytes; SHA-256 ${sha}`);
