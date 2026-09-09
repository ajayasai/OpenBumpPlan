"""Independent KiCad parser oracle. Requires the system pcbnew Python module.
Validates terminal interchange, not design-rule or manufacturing acceptance.
"""
import os, json, hashlib, pathlib, subprocess, tempfile, time
import pcbnew
ROOT = pathlib.Path(__file__).resolve().parents[1]
EVIDENCE=pathlib.Path(os.environ.get('OPENBUMPPLAN_EVIDENCE_DIR',str(ROOT/'docs')));EVIDENCE.mkdir(parents=True,exist_ok=True)

def node(source, *args):
    return subprocess.check_output(['node', '--input-type=module', '-e', source, *map(str,args)], cwd=ROOT, text=True, timeout=60)

with tempfile.TemporaryDirectory(prefix='bump-kicad-') as work:
    work=pathlib.Path(work)
    cases=[]
    for side in ['F.Cu','B.Cu']:
        for angle in [0,90,180,270,33.5]:
            raw=node("""
import {emptyProject,normalizeProject} from './src/core/model.js';
import {exportKiCad} from './src/core/terminal-interop.js';
const p=emptyProject('Native parser oracle');
p.ports=Array.from({length:4},(_,i)=>({id:'P'+i,label:'A'+i,kind:'ball',x:1000+i*700,y:2000-i*300,net:'SIG'+i,role:'any'}));
console.log(JSON.stringify(exportKiCad(normalizeProject(p),{diameter:125.125,side:process.argv[1]})));
""",side)
            exported=json.loads(raw)
            native_text=exported['board'].replace('(at 0 0)',f'(at 10 20 {angle})',1)
            file=work/f'{side}-{angle}.kicad_pcb';file.write_text(native_text)
            started=time.perf_counter();board=pcbnew.LoadBoard(str(file))
            assert board is not None, 'Native board parse failed'
            pads=list(board.GetPads());assert len(pads)==4
            imported=json.loads(node("""
import fs from 'node:fs';import {importKiCad} from './src/core/terminal-interop.js';
console.log(JSON.stringify(importKiCad(fs.readFileSync(process.argv[1],'utf8'))));
""",file))
            by_number={p['label']:p for p in imported['project']['ports']}
            for pad in pads:
                our=by_number[pad.GetNumber()];pos=pad.GetPosition()
                assert abs(our['x']-pos.x/1000)<.003, (side,angle,our,pos.x/1000)
                assert abs(our['y']+pos.y/1000)<.003, (side,angle,our,pos.y/1000)
                assert our['net']==pad.GetNetname()
                assert abs(our['interchange']['width']-pad.GetSize().x/1000)<.001
            # KiCad writes its own native representation; our reader must cope.
            saved=work/f'saved-{side}-{angle}.kicad_pcb';pcbnew.SaveBoard(str(saved),board)
            saved_map=json.loads(node("""
import fs from 'node:fs';import {importKiCad} from './src/core/terminal-interop.js';
console.log(JSON.stringify(importKiCad(fs.readFileSync(process.argv[1],'utf8'))));
""",saved))
            assert len(saved_map['project']['ports'])==4
            for p in saved_map['project']['ports']:
                expect=by_number[p['label']]
                assert abs(p['x']-expect['x'])<.003 and abs(p['y']-expect['y'])<.003
                assert p['net']==expect['net']
            cases.append({'side':side,'rotation':angle,'pads':4,'nativeParserAndResave':True,'inputSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'seconds':round(time.perf_counter()-started,4)})
        library=work/'package.pretty';library.mkdir(exist_ok=True)
        (library/'PinMap.kicad_mod').write_text(exported['footprint'])
        footprint=pcbnew.FootprintLoad(str(library),'PinMap')
        assert footprint is not None and len(list(footprint.Pads()))==4
        cases.append({'side':side,'libraryFootprintLoaded':True,'pads':4})
    # External parser checks the complete capacity fixture, not just our parser.
    large=work/'large.kicad_pcb'
    node("""
import fs from 'node:fs';import {emptyProject,normalizeProject} from './src/core/model.js';import {exportKiCad} from './src/core/terminal-interop.js';
const p=emptyProject('10k terminal oracle');p.ports=Array.from({length:10000},(_,i)=>({id:'T'+i,label:String(i),kind:'ball',x:(i%100)*500,y:Math.floor(i/100)*500,net:'NET',role:'any'}));
fs.writeFileSync(process.argv[1],exportKiCad(normalizeProject(p),{diameter:250}).board);
""",large)
    t=time.perf_counter();large_board=pcbnew.LoadBoard(str(large));large_pads=list(large_board.GetPads());assert len(large_pads)==10000
    for pad in large_pads:
        i=int(pad.GetNumber());xy=pad.GetPosition()
        assert xy.x==i%100*500000 and xy.y==-(i//100)*500000
        assert pad.GetNetname()=='NET'
    cases.append({'pads':10000,'nativeTerminalCoverage':True,'seconds':round(time.perf_counter()-t,4)})
report={'oracle':'KiCad pcbnew native parser','version':pcbnew.Version(),'passed':len(cases),'failed':0,'cases':cases,'limitations':['Terminal-map interoperability only. No PCB DRC, route generation, stackup, electrical or manufacturing qualification.','Front/back coordinates verified against native pad positions; native serialization round trips measured at 0.003 um tolerance.']}
(EVIDENCE/'kicad-native-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
