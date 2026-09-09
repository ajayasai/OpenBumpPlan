"""Real browser tests for the source and self-contained routed workbench."""
import argparse
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
from playwright.sync_api import sync_playwright, expect
ROOT=Path(__file__).resolve().parents[1]
OUT=Path(os.environ.get('OPENBUMPPLAN_EVIDENCE_DIR',str(ROOT/'docs')))
OUT.mkdir(parents=True,exist_ok=True)

def downloaded(page,selector):
    with page.expect_download() as info: page.locator(selector).click()
    return Path(info.value.path()).read_text()

def sample(page):
    page.locator('#routedHandoff summary').click()
    page.locator('#routedSample').click()
    page.locator('#routedBuild').click()
    expect(page.locator('#routedResult')).to_contain_text('Source checks pass')
    expect(page.locator('#routedSaveBoard')).to_be_enabled()

def upload(page,selector,value):
    page.locator(selector).set_input_files({'name':'fixture.json','mimeType':'application/json','buffer':json.dumps(value).encode()})

def scenarios(page):
    passed=[]
    expect(page.locator('#routedHandoff')).to_be_visible()
    expect(page.locator('#routedSaveBoard')).to_be_disabled()
    page.locator('#routedBuild').click()
    expect(page.locator('#routedResult')).to_contain_text('Load a route witness')
    passed.append('No fabricated output without source witness')
    sample(page)
    board=downloaded(page,'#routedSaveBoard');receipt=json.loads(downloaded(page,'#routedSaveReceipt'))
    inputs=json.loads(downloaded(page,'#routedSaveInputs'))
    assert board.count('(segment ')==4 and board.count('(via ')==2 and '(keepout ' in board
    assert receipt['counts']=={'pads':5,'segments':4,'vias':2,'keepouts':1}
    assert inputs['project']['name']=='Synthetic two-layer routed handoff'
    assert page.locator('#contractText').input_value()==''
    expect(page.locator('#routedResult')).to_contain_text('native DRC has NOT been run')
    page.locator('#routedHandoff').screenshot(path=str(OUT/'routed-workbench.png'))
    with tempfile.TemporaryDirectory() as tmp:
        files=[]
        for key in ['project','witness','technology','specification']:
            file=Path(tmp)/(key+'.json');file.write_text(json.dumps(inputs[key]));files.append(str(file))
        bf=Path(tmp)/'board.kicad_pcb';bf.write_text(board)
        rf=Path(tmp)/'receipt.json';rf.write_text(json.dumps(receipt))
        result=subprocess.run(['node','scripts/routed-kicad.mjs','verify',*files,str(bf),str(rf)],cwd=ROOT,capture_output=True,text=True,timeout=30)
        assert result.returncode==0,result.stdout+result.stderr
    passed.append('Actual copper and receipt downloads replay through standalone CLI')
    tech=inputs['technology'].copy();tech['traceWidth']=8000
    page.locator('#routedTechnology').fill(json.dumps(tech))
    expect(page.locator('#routedSaveBoard')).to_be_disabled()
    page.locator('#routedBuild').click();expect(page.locator('#routedResult')).to_contain_text('Rejected:')
    passed.append('Invalid technology clears output and fails copper checks')
    page.locator('#routedTechnology').fill(json.dumps(inputs['technology']))
    page.locator('#routedBuild').click();expect(page.locator('#routedSaveBoard')).to_be_enabled()
    page.locator('#routedSpecification').fill('{')
    expect(page.locator('#routedSaveBoard')).to_be_disabled()
    page.locator('#routedBuild').click();expect(page.locator('#routedResult')).to_contain_text('Rejected:')
    page.locator('#routedSpecification').fill(json.dumps(inputs['specification']))
    page.locator('#routedBuild').click();expect(page.locator('#routedSaveBoard')).to_be_enabled()
    passed.append('Malformed specification cannot keep a stale download enabled')
    page.locator('#demo').click();expect(page.locator('#routedSaveBoard')).to_be_disabled()
    page.locator('#routedBuild').click();expect(page.locator('#routedResult')).to_contain_text('Rejected:')
    passed.append('Project replacement invalidates old routes and download controls')
    upload(page,'#projectFile',inputs['project']);expect(page.locator('#applyImport')).to_be_enabled();page.locator('#applyImport').click()
    upload(page,'#routedWitnessFile',inputs['witness']);expect(page.locator('#routedWitnessInfo')).to_contain_text('2 supplied routes')
    page.locator('#routedBuild').click();expect(page.locator('#routedSaveBoard')).to_be_enabled()
    assert downloaded(page,'#routedSaveBoard')==board
    passed.append('User project and witness files reproduce deterministic native output')
    broken=inputs['witness'].copy();broken['routes']=broken['routes'][:1]
    upload(page,'#routedWitnessFile',broken);expect(page.locator('#routedWitnessInfo')).to_contain_text('1 supplied routes')
    page.locator('#routedBuild').click();expect(page.locator('#routedResult')).to_contain_text('Rejected:')
    expect(page.locator('#routedSaveBoard')).to_be_disabled()
    passed.append('Partial witness rejected, without automatic repair or missing-net suppression')
    upload(page,'#routedWitnessFile',receipt);expect(page.locator('#routedResult')).to_contain_text('Expected a route witness')
    expect(page.locator('#routedSaveBoard')).to_be_disabled()
    passed.append('Receipt cannot substitute for independently checked source routes')
    return passed

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--chromium');parser.add_argument('--native',action='store_true');args=parser.parse_args()
    server=None
    try:
        if args.native:
            class Quiet(SimpleHTTPRequestHandler):
                def log_message(self,*args): pass
            server=ThreadingHTTPServer(('127.0.0.1',0),partial(Quiet,directory=str(ROOT)))
            thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
            url=f'http://127.0.0.1:{server.server_port}/interop.html'
        else: url=(ROOT/'dist/interop.html').as_uri()
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,executable_path=args.chromium)
            context=browser.new_context(accept_downloads=True,viewport={'width':1600,'height':1000})
            page=context.new_page();errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
            page.goto(url);names=scenarios(page);assert not errors,errors
            report={'browser':browser.version,'origin':'http-source' if args.native else 'file-bundled','passed':len(names),'failed':0,'scenarios':names,'pageErrors':errors}
            (OUT/('routed-browser-native-results.json' if args.native else 'routed-browser-results.json')).write_text(json.dumps(report,indent=2)+'\n')
            print(json.dumps(report,indent=2));browser.close()
    finally:
        if server: server.shutdown();server.server_close()
if __name__=='__main__':main()
