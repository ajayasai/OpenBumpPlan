/** One-time, exact-base migration for the reviewed native-interoperability
 * overlay. Does not publish, fetch, execute a shell, or alter Git history. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8'),write=(p,s)=>fs.writeFileSync(path.join(root,p),s);
const pkg=JSON.parse(read('package.json'));
if(pkg.version==='0.4.0') {console.log('Migration already applied; build/test/manifest verification are still required.');process.exit(0);}
if(pkg.version!=='0.3.1')throw new Error('Migration requires the inspected v0.3.1 base');
const expected={
 'src/core/model.js':'4589e762715dbee000130870db1aca5ab89dd40a',
 'src/core/copper.js':'68155c8d1a1d1578e013fe4bc5c8e66979420aa5',
 'src/app.js':'a87a75f7810fb05d411d8448049eec629482d865',
 'scripts/publish-update.mjs':'6759baa94a754773f8635406a12cdf86b67aee03'
};
for(const [p,sha]of Object.entries(expected)){
 const b=fs.readFileSync(path.join(root,p)),actual=createHash('sha1').update(Buffer.concat([Buffer.from(`blob ${b.length}\0`),b])).digest('hex');
 if(actual!==sha)throw new Error('Inspected source changed; review before migration: '+p);
}
function replace(p,old,value){const s=read(p);if(s.split(old).length!==2)throw new Error('Patch context must occur exactly once: '+p);write(p,s.replace(old,()=>value));}
replace('src/core/model.js',"export const VERSION = '0.3.1';","export const VERSION = '0.4.0';");
replace('src/core/copper.js','return tech.clearance===0?distance<=required+TOL:distance<required-TOL;',
 '// Contact is forbidden independently of clearance tolerance. A tiny\n      // positive clearance must never turn touching/overlapping copper into a pass.\n      return distance<=a.radius+b.radius+TOL || distance<required-TOL;');
replace('src/app.js','function controls(){return `','function controls(){return `<a href="interop.html" class="quiet" style="color:inherit;padding:8px;text-decoration:none">Interoperability ↗</a>');
replace('scripts/publish-update.mjs','-indexed-copper`','-native-interoperability`');
replace('scripts/publish-update.mjs',"['index.html','package.json'","['interop.html','dist/interop.html','index.html','package.json'");
replace('scripts/publish-update.mjs',"run(process.execPath,['scripts/build.mjs'],{cwd:root});","run(process.execPath,['scripts/build.mjs'],{cwd:root});\n  run(process.execPath,['scripts/build-interop.mjs'],{cwd:root});");
pkg.version='0.4.0';pkg.scripts.build='node scripts/build.mjs && node scripts/build-interop.mjs';pkg.scripts.interop='node scripts/interop.mjs';pkg.scripts['build:interop']='node scripts/build-interop.mjs';write('package.json',JSON.stringify(pkg,null,2)+'\n');
// Version changes require NEW evidence, not relabeling old manifests/signatures.
const {createReviewBundle}=await import('../src/core/evidence.js');
for(const filename of fs.readdirSync(path.join(root,'examples')).filter(n=>n.endsWith('.json'))){
 const rel='examples/'+filename,old=JSON.parse(read(rel));
 if(old.manifest?.type==='openbumpplan-review')write(rel,JSON.stringify(await createReviewBundle(old.payload.project,{routing:old.payload.routing}),null,2)+'\n');
}
const {interoperabilityDemo,swappedInterfaceDemo}=await import('../src/core/interop-demo.js');
const d=interoperabilityDemo(),s=swappedInterfaceDemo();
for(const [name,value]of Object.entries({'interop-project':d.project,'interop-contract':d.contract,'interop-swapped':s.project,'interop-repair':s.patch}))write('examples/'+name+'.json',JSON.stringify(value,null,2)+'\n');
write('README.md',read('README.md').replace('**v0.3.1 · MIT license · engineering alpha.**','**v0.4.0 · MIT license · engineering alpha.**').replace('## New in v0.3.1:',`## New in v0.4.0: native interchange and independent connectivity intent\n\nOpen **[the Interoperability Workbench](interop.html)** after \`npm start\`, or use the planner toolbar link. Import native KiCad terminal maps, export an unrouted native board and library footprint, verify actual exported terminals against an independent source/specification, detect opens/shorts against a separate logical contract, and preview/apply hash-bound mapping ECOs atomically. The release also fixes the tiny-positive-clearance contact acceptance issue.\n\n[Exact native-format scope, CLI commands and verification protocol](docs/NATIVE-INTEROPERABILITY.md). Native parser and browser evidence is available in the GitHub Actions artifacts; read actual run status rather than assuming a pass. No commercial superiority or manufacturing-signoff claim is made.\n\n## Retained v0.3.1 capability:`));
write('CHANGELOG.md',read('CHANGELOG.md').replace('# Changelog','# Changelog\n\n## 0.4.0\n\nNative KiCad terminal-map interchange, independent logical intent review/replay, atomic mapping ECO and a dedicated offline workbench. Correct continuous-copper contact handling for tiny positive clearances; preserve indexed geometry checks. Fresh version-bound example evidence and bounded delivery. See docs/NATIVE-INTEROPERABILITY.md.'));
console.log('Applied exact-base v0.4.0 migration, contact fix, workbench link and fresh example evidence.');
