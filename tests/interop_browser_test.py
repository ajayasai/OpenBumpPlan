"""Actual workbench UI, files and independent CLI replay; --native uses HTTP."""
import os, argparse, functools, http.server, json, pathlib, subprocess, tempfile, threading, time
from playwright.sync_api import sync_playwright
ROOT=pathlib.Path(__file__).resolve().parents[1]
EVIDENCE=pathlib.Path(os.environ.get('OPENBUMPPLAN_EVIDENCE_DIR',str(ROOT/'docs')));EVIDENCE.mkdir(parents=True,exist_ok=True)
parser=argparse.ArgumentParser();parser.add_argument('--native',action='store_true');parser.add_argument('--chromium');args=parser.parse_args()
html=(ROOT/'dist/interop.html').read_text();results=[];server=None
if args.native:
    handler=functools.partial(http.server.SimpleHTTPRequestHandler,directory=str(ROOT/'dist'))
    server=http.server.ThreadingHTTPServer(('127.0.0.1',0),handler)
    threading.Thread(target=server.serve_forever,daemon=True).start();url=f'http://127.0.0.1:{server.server_port}/interop.html'
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
    def scenario(name,fn):
        t=time.perf_counter();ctx=browser.new_context(viewport={'width':1600,'height':1150},accept_downloads=True);page=ctx.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        if args.native: page.goto(url)
        else: page.set_content(html)
        page.wait_for_selector('#check');fn(page);assert not errors,errors
        results.append({'name':name,'passed':True,'seconds':round(time.perf_counter()-t,3)});ctx.close()
    def boot(p):
        assert p.locator('#sites').inner_text()=='13';assert p.locator('#links').inner_text()=='6'
        p.locator('#check').click();assert p.locator('#reviewStatus').inner_text()=='All-port intent passes'
        p.screenshot(path=str(EVIDENCE/'interop-workbench.png'),full_page=True)
    scenario('Boot and independently supplied synthetic intent',boot)
    def mutation(p):
        p.locator('#check').click();c=json.loads(p.locator('#contractText').input_value());c['nets'][0]['ports'][1]='missing'
        p.locator('#contractText').fill(json.dumps(c));assert p.locator('#saveReview').is_disabled()
        p.locator('#check').click();assert 'MISSING_PORT' in p.locator('#findings').inner_text()
    scenario('Contract edits invalidate review and detect lost terminals',mutation)
    def eco(p):
        p.locator('#swapDemo').click();assert 'intent finding' in p.locator('#reviewStatus').inner_text()
        p.locator('#previewEco').click();assert not p.locator('#applyEco').is_disabled();p.locator('#applyEco').click()
        assert p.locator('#reviewStatus').inner_text()=='All-port intent passes'
        p.locator('#undo').click();p.locator('#check').click();assert 'intent finding' in p.locator('#reviewStatus').inner_text()
    scenario('Atomic mapping repair, explicit application and Undo',eco)
    def stale(p):
        p.locator('#swapDemo').click();p.locator('#previewEco').click();c=json.loads(p.locator('#contractText').input_value());c['name']='Changed intent'
        p.locator('#contractText').fill(json.dumps(c));assert p.locator('#applyEco').is_disabled()
        p.locator('#previewEco').click();assert p.locator('#applyEco').is_disabled();assert 'Stale/wrong' in p.locator('#notice').inner_text()
    scenario('Stale independent contract cannot authorize pending ECO',stale)
    def native_input(p):
        p.get_by_text('Paste native KiCad text', exact=True).click()
        text='(footprint "PKG" (layer "B.Cu") (at 10 20 90) (fp_text reference "U1") (pad "A1" smd circle (at 1 2) (size .25 .25) (layers "B.Cu")))'
        p.locator('#nativeText').fill(text);p.locator('#previewImport').click();assert p.locator('#sites').inner_text()=='13'
        assert 'not imported' in p.locator('#importInfo').inner_text();p.locator('#applyImport').click();assert p.locator('#sites').inner_text()=='1'
        assert p.locator('#reviewStatus').inner_text()=='Not reviewed'
    scenario('Native back-side input preview, omission disclosure and apply',native_input)
    def reject(p):
        p.get_by_text('Paste native KiCad text', exact=True).click()
        p.locator('#nativeText').fill('(footprint "X" (layer "F.Cu") (pad "1" thru_hole circle (at 0 0) (size 1 1) (layers "*.Cu")))')
        p.locator('#previewImport').click();assert p.locator('#applyImport').is_disabled();assert p.locator('#sites').inner_text()=='13'
        assert 'unsupported' in p.locator('#notice').inner_text()
    scenario('Unsupported geometry does not replace current project',reject)
    def exports(p):
        with tempfile.TemporaryDirectory() as d:
            d=pathlib.Path(d)
            def save(button,target):
                with p.expect_download() as info:p.locator('#'+button).click()
                info.value.save_as(str(d/target))
            p.locator('#check').click();save('saveProject','project.json');save('saveContract','contract.json');save('saveReview','review.json')
            p.locator('#makeExport').click();assert '7 terminals' in p.locator('#exportInfo').inner_text()
            save('saveBoard','map.kicad_pcb');save('saveFootprint','map.kicad_mod');save('saveReceipt','receipt.json')
            for argv in [['replay',d/'project.json',d/'contract.json',d/'review.json'],['verify-export',d/'project.json',d/'map.kicad_pcb',d/'receipt.json','--diameter','250']]:
                r=subprocess.run(['node','scripts/interop.mjs',*map(str,argv)],cwd=ROOT,text=True,capture_output=True,timeout=30);assert r.returncode==0,r.stdout+r.stderr
            r=json.loads((d/'review.json').read_text());r['statistics']['ports']=999
            p.locator('#reviewFile').set_input_files({'name':'tampered.json','mimeType':'application/json','buffer':json.dumps(r).encode()})
            p.wait_for_function("document.getElementById('notice').textContent.includes('rejected')")
    scenario('Real file downloads independently replayed by CLI; tampered review rejected',exports)
    def diameter(p):
        p.locator('#makeExport').click();assert not p.locator('#saveBoard').is_disabled();p.locator('#diameter').fill('100');assert p.locator('#saveBoard').is_disabled()
        p.locator('#diameter').fill('0');p.locator('#makeExport').click();assert p.locator('#saveBoard').is_disabled()
    scenario('Geometry changes invalidate output and invalid diameter fails',diameter)
    if args.native:
        def storage(p):
            with p.expect_download() as info:p.locator('#saveProject').click()
            saved=pathlib.Path(info.value.path()).read_text();project=json.loads(saved);project['name']='Explicit origin-local import'
            p.evaluate("p=>localStorage.setItem('openbumpplan.project.v1',JSON.stringify(p))",project)
            p.reload();p.wait_for_selector('#loadPlanner');assert p.locator('#projectName').inner_text()!='Explicit origin-local import'
            p.locator('#loadPlanner').click();p.locator('#applyImport').click();assert p.locator('#projectName').inner_text()=='Explicit origin-local import'
        scenario('Planner origin-local project is read only on explicit request',storage)
    version=browser.version;browser.close()
if server:server.shutdown()
report={'browser':version,'harness':'native HTTP' if args.native else 'standalone HTML via set_content','passed':len(results),'failed':0,'scenarios':results}
out=EVIDENCE/('interop-native-browser.json' if args.native else 'interop-browser.json');out.write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report,indent=2))
