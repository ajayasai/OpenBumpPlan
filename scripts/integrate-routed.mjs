/** One-time, guarded maintainer migration for the unreleased v0.4 workbench.
 * Does not approve source or refresh a release manifest; run qualification next.
 */
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const appPath='src/interop-app.js';let app=fs.readFileSync(appPath,'utf8');
if(!app.includes("from './routed-export-ui.js'")){
 const hash=createHash('sha1').update(`blob ${Buffer.byteLength(app)}\0`).update(app).digest('hex');
 if(hash!=='f75ac0dac13d82d30de6275c8e6ae4c99c845e3d')throw new Error('Unexpected interop app base; inspect before migration');
 if(!app.includes('function invalidate(){')||!app.trimEnd().endsWith('render();'))throw new Error('Missing integration anchors');
 app="import { mountRoutedExport } from './routed-export-ui.js';\nlet routedPanel=null;\n"+app;
 app=app.replace('function invalidate(){','function invalidate(){routedPanel?.invalidate();');
 app=app.trimEnd().slice(0,-'render();'.length)+`routedPanel=mountRoutedExport({container:document.querySelector('.right'),getProject:()=>project,setProject:p=>{previous=project;contract=null;$('contractText').value='';setProject(p);notice('Synthetic routed project loaded; supply a separately reviewed intent contract.');}});\nrender();\n`;
 fs.writeFileSync(appPath,app);
}
// PAD is a multilayer object: GetLayerSet/IsOnLayer, not its inherited scalar
// GetLayer, describes its actual copper membership. Keep strict source equality.
const oraclePath='tests/routed_kicad_native_test.py';let oracle=fs.readFileSync(oraclePath,'utf8');
const old="        assert (pos.x, pos.y, pad.GetNetname(), int(pad.GetLayer())) == pad_expect[pad.GetNumber()]";
if(oracle.includes(old)){
 oracle=oracle.replace(old,`        expected = pad_expect[pad.GetNumber()]
        assert (pos.x, pos.y, pad.GetNetname()) == expected[:3], (case['project']['name'], pad.GetNumber(), pos.x, pos.y, pad.GetNetname(), expected)
        assert pad.IsOnLayer(expected[3]), ('Missing expected copper layer', pad.GetNumber(), expected)
        opposite = pcbnew.B_Cu if expected[3] == int(pcbnew.F_Cu) else pcbnew.F_Cu
        assert not pad.IsOnLayer(opposite), ('Unexpected opposite copper layer', pad.GetNumber())`);
 fs.writeFileSync(oraclePath,oracle);
}else if(!oracle.includes("'Missing expected copper layer'"))throw new Error('Unexpected native oracle base');
const packagePath='package.json',pkg=JSON.parse(fs.readFileSync(packagePath,'utf8'));
if(pkg.version!=='0.4.0')throw new Error('Migration is only for unreleased v0.4.0');
pkg.scripts['test:routed']='node --test tests/routed*.test.mjs';
fs.writeFileSync(packagePath,JSON.stringify(pkg,null,2)+'\n');
console.log('Integrated routed workbench and physical-layer oracle. Full qualification is still required.');
