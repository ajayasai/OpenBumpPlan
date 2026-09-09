"""Independent KiCad native geometry, connectivity and DRC qualification.
The oracle expands native tracks into unit edges and compares source paths,
not exporter receipts or the JavaScript re-importer. Requires KiCad 9+ pcbnew.
"""
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time
import pcbnew
ROOT = Path(__file__).resolve().parents[1]
OUTPUT = Path(os.environ.get('OPENBUMPPLAN_EVIDENCE_DIR', str(ROOT / 'docs')))
OUTPUT.mkdir(parents=True, exist_ok=True)
GENERATE = r"""
import { routedHandoffDemo } from './src/core/routed-demo.js';
import { exportRoutedKiCad } from './src/core/routed-kicad.js';
import { normalizeProject } from './src/core/model.js';
import { routeStage } from './src/core/routing.js';
const fixtures=[routedHandoffDemo()];
for(const [n,startLayer,endLayer] of [[1,0,0],[8,1,1],[8,0,1],[8,1,0],[64,0,0]]){
 const d=routedHandoffDemo();d.project.name=`Native ${n}-route ${startLayer}-${endLayer}`;
 d.project.ports=[];d.project.connections=[];d.project.keepouts=[];
 for(let i=0;i<n;i++){
  d.project.ports.push({id:'s'+i,kind:'pad',x:-5000,y:i*3000,role:'any',net:'N'+i},{id:'t'+i,kind:'ball',x:5000,y:i*3000,role:'any'});
  d.project.connections.push({id:'e'+i,from:'s'+i,to:'t'+i});
 }
 d.project=normalizeProject(d.project);
 d.witness=routeStage(d.project,'pad','ball',{pitch:1000,layers:2,startLayer,endLayer});
 fixtures.push(d);
}
console.log(JSON.stringify(fixtures.map(d=>({...d,...exportRoutedKiCad(d.project,d.witness,d.technology,d.specification)}))));
"""
def nm(um):
    value = round(um * 1000)
    assert abs(value - um * 1000) < .00001
    return value

def source_geometry(case):
    p, w = case['project'], case['witness']
    assert not p['dies'], 'Fixture requires explicit world-coordinate terminals'
    ports = {x['id']: x for x in p['ports']}
    nets = {x['id']: x['net'] for x in p['ports']}
    edges = {x['id']: x for x in p['connections']}
    for e in p['connections']:
        name = ports[e['from']]['net'] or e['net'] or ports[e['to']]['net']
        nets[e['from']] = nets[e['to']] = name
    c = w['config']
    xy = lambda v: (nm(c['originX'] + v[0]*c['pitch']), -nm(c['originY'] + v[1]*c['pitch']))
    expected_tracks, expected_vias = Counter(), Counter()
    for route in w['routes']:
        name = nets[edges[route['connectionId']]['from']]
        for a, b in zip(route['path'], route['path'][1:]):
            if a[2] != b[2]:
                expected_vias[(name, *xy(a))] += 1
            else:
                ends = sorted([xy(a), xy(b)])
                expected_tracks[(name, int(pcbnew.F_Cu) if a[2] == 0 else int(pcbnew.B_Cu), *ends[0], *ends[1])] += 1
    pads = {x['id']: (nm(x['x']), -nm(x['y']), nets[x['id']],
            int(pcbnew.F_Cu) if (c['startLayer'] if x['kind']==c['fromKind'] else c['endLayer']) == 0 else int(pcbnew.B_Cu))
            for x in p['ports']}
    return pads, expected_tracks, expected_vias

def inspect(board, case):
    pad_expect, edge_expect, via_expect = source_geometry(case)
    tech, c = case['technology'], case['witness']['config']
    pads = list(board.GetPads())
    assert len(pads) == len(pad_expect), 'Native pad count mismatch'
    assert len({p.GetNumber() for p in pads}) == len(pads)
    for pad in pads:
        pos = pad.GetPosition()
        assert (pos.x, pos.y, pad.GetNetname(), int(pad.GetLayer())) == pad_expect[pad.GetNumber()]
        assert pad.GetSize().x == pad.GetSize().y == nm(tech['padDiameter'])
        assert pad.GetShape() == pcbnew.PAD_SHAPE_CIRCLE
    tracks, vias = Counter(), Counter()
    compact = via_count = 0
    pitch = nm(c['pitch'])
    for item in board.GetTracks():
        name = item.GetNetname()
        if isinstance(item, pcbnew.PCB_VIA):
            via_count += 1
            pos = item.GetPosition()
            vias[(name, pos.x, pos.y)] += 1
            assert item.GetWidth(pcbnew.F_Cu) == item.GetWidth(pcbnew.B_Cu) == nm(tech['viaDiameter'])
            assert item.GetDrillValue() == nm(case['specification']['viaDrill'])
            assert item.IsOnLayer(pcbnew.F_Cu) and item.IsOnLayer(pcbnew.B_Cu)
        else:
            compact += 1
            a, b = item.GetStart(), item.GetEnd()
            assert item.GetWidth() == nm(tech['traceWidth'])
            dx, dy = b.x-a.x, b.y-a.y
            assert (dx == 0) != (dy == 0), 'Native track is not nonzero Manhattan geometry'
            distance = abs(dx)+abs(dy)
            assert distance % pitch == 0
            sx = 0 if dx == 0 else (pitch if dx > 0 else -pitch)
            sy = 0 if dy == 0 else (pitch if dy > 0 else -pitch)
            for i in range(distance//pitch):
                ends = sorted([(a.x+i*sx, a.y+i*sy), (a.x+(i+1)*sx, a.y+(i+1)*sy)])
                tracks[(name, int(item.GetLayer()), *ends[0], *ends[1])] += 1
    assert tracks == edge_expect, f'Native track coverage differs: missing={edge_expect-tracks}, extra={tracks-edge_expect}'
    assert vias == via_expect, 'Native via coverage differs from source witness'
    assert board.GetCopperLayerCount() == 2
    assert board.GetDesignSettings().GetBoardThickness() == nm(case['specification']['boardThickness'])
    zones = list(board.Zones())
    assert len(zones) == len(case['project']['keepouts'])
    for zone in zones:
        assert zone.GetIsRuleArea(), 'Keepout converted to copper zone'
        assert zone.GetDoNotAllowTracks() and zone.GetDoNotAllowVias() and zone.GetDoNotAllowPads()
    assert len([x for x in board.GetDrawings() if x.GetLayer()==pcbnew.Edge_Cuts]) == 4
    board.BuildConnectivity()
    connection = board.GetConnectivity()
    connection.RecalculateRatsnest()
    unconnected = connection.GetUnconnectedCount(False)
    assert unconnected == 0, f'Native engine finds {unconnected} open connections'
    return {'pads':len(pads), 'segments':compact, 'vias':via_count,
            'unitTrackEdges':sum(tracks.values()), 'nativeUnconnected':unconnected, 'keepouts':len(zones)}

def drc(file, out):
    result = subprocess.run(['kicad-cli','pcb','drc','--format','json','--severity-error',
        '--exit-code-violations','--output',str(out),str(file)],capture_output=True,text=True,timeout=90)
    if not out.exists():
        raise AssertionError(f'Native DRC produced no report: {result.stdout} {result.stderr}')
    return result.returncode, json.loads(out.read_text())

cases = json.loads(subprocess.check_output(['node','--input-type=module','-e',GENERATE],cwd=ROOT,text=True,timeout=120))
results = []
with tempfile.TemporaryDirectory(prefix='openbumpplan-native-routes-') as folder:
    folder = Path(folder)
    for number, case in enumerate(cases):
        started = time.perf_counter()
        file = folder / f'route-{number}.kicad_pcb'
        file.write_text(case['board'])
        board = pcbnew.LoadBoard(str(file))
        assert board is not None
        metrics = inspect(board, case)
        saved = folder / f'resaved-{number}.kicad_pcb'
        pcbnew.SaveBoard(str(saved), board)
        assert inspect(pcbnew.LoadBoard(str(saved)), case) == metrics
        code, report = drc(file, folder/f'drc-{number}.json')
        assert code == 0 and not report.get('violations') and not report.get('unconnected_items'), report
        results.append({'fixture':case['project']['name'],**metrics,'nativeResave':True,'nativeDRCErrorCount':0,
            'boardSHA256':hashlib.sha256(file.read_bytes()).hexdigest(),'seconds':round(time.perf_counter()-started,4)})
    board = pcbnew.LoadBoard(str(folder/'route-0.kicad_pcb'))
    straight = next(t for t in board.GetTracks() if not isinstance(t,pcbnew.PCB_VIA) and t.GetNetname()=='HORIZONTAL')
    board.Remove(straight)
    board.BuildConnectivity(); board.GetConnectivity().RecalculateRatsnest()
    assert board.GetConnectivity().GetUnconnectedCount(False) > 0, 'Native missing-trace control was not detected'
    broken = folder/'broken-open.kicad_pcb';pcbnew.SaveBoard(str(broken),board)
    code, report = drc(broken, folder/'broken-open.json')
    assert code == 5 and report.get('unconnected_items'), report
    board = pcbnew.LoadBoard(str(folder/'route-0.kicad_pcb'))
    pads = {p.GetNumber():p for p in board.GetPads()}
    short = pcbnew.PCB_TRACK(board)
    short.SetStart(pads['H_IN'].GetPosition());short.SetEnd(pads['V_IN'].GetPosition())
    short.SetWidth(nm(250));short.SetLayer(pcbnew.F_Cu);short.SetNetCode(pads['H_IN'].GetNetCode());board.Add(short)
    broken = folder/'broken-short.kicad_pcb';pcbnew.SaveBoard(str(broken),board)
    code, report = drc(broken, folder/'broken-short.json')
    assert code == 5 and any('short' in v['type'] or 'clearance' in v['type'] for v in report.get('violations',[])), report
report = {'oracle':'KiCad native copper geometry, connectivity, serialization and CLI DRC',
    'version':pcbnew.Version(),'casesPassed':len(results),'casesFailed':0,
    'negativeControls':{'removedTrackDetected':True,'addedShortDetected':True},'cases':results,
    'scope':'Synthetic two-layer fixtures with the stated simplified dimensions. Native DRC used error severity and default KiCad rules; warnings are outside this gate. Not foundry, signal/power integrity, thermal or mechanical signoff.'}
(OUTPUT/'routed-kicad-native-results.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
