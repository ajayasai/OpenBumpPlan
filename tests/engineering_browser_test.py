#!/usr/bin/env python3
"""Exercises the shipped standalone HTML, workers, downloads, and evidence verifier.
Default set_content mode works in managed browsers; --native tests a real localhost
origin including reload persistence. No browser navigation policies are changed.
"""
import argparse
import json
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import time
import traceback
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
SCENARIOS = []
def scenario(name):
    def register(fn): SCENARIOS.append((name, fn)); return fn
    return register

def downloaded(page, selector):
    with page.expect_download(timeout=12000) as event: page.locator(selector).click()
    d = event.value
    assert d.failure() is None
    return Path(d.path()).read_bytes()

def current_project(page):
    return json.loads(downloaded(page, '[data-action="export-json"]'))

def edit_project(page, data):
    page.locator('[data-action="advanced"]').click()
    page.locator('#projectJSON').fill(json.dumps(data))
    page.locator('[data-action="apply-json"]').click()
    expect(page.locator('#dialog')).not_to_be_visible()

def route_demo(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="engineering-demo"]').click()
    page.locator('[data-action="engineering-route"]').click()
    expect(page.locator('#engineeringReport')).to_contain_text('routed', timeout=12000)

def slow_case(page):
    p = json.loads((ROOT/'examples/pair-bottleneck.json').read_text())
    p['name'] = 'Bounded symmetric synthetic worker test'
    p['rules']['maxLength'] = 10000
    p['ports'], p['connections'] = [], []
    for i in range(10):
        p['ports'] += [dict(id=f's{i}', kind='pad', x=i, y=0, net='SHARED', domain='V', role='signal'),
                       dict(id=f't{i}', kind='ball', x=100+i, y=100, role='any')]
        p['connections'].append(dict(id=f'e{i}', **{'from':f's{i}', 'to':f't{i}'}))
    edit_project(page, p)
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-engineering="fromKind"]').select_option('pad')
    page.locator('[data-engineering="toKind"]').select_option('ball')
    page.locator('[data-engineering="maxNodes"]').fill('1000000')
    return p

@scenario('Engineering workspace is available without changing the design')
def workspace(page):
    before = current_project(page)
    page.locator('[data-tab="engineering"]').click()
    expect(page.locator('#workspace')).to_contain_text('Coupled exact search')
    assert current_project(page) == before

@scenario('Exact worker solves greedy pair bottleneck and checked Apply is undoable')
def exact_apply(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="engineering-coupled-demo"]').click()
    before = current_project(page)
    assert len(before['connections']) == 0
    page.locator('[data-action="engineering-exact"]').click()
    expect(page.locator('#engineeringReport')).to_contain_text('optimal', timeout=12000)
    assert current_project(page) == before  # solving alone is read-only
    page.locator('[data-action="engineering-apply"]').click()
    assert len(current_project(page)['connections']) == 3
    expect(page.locator('.metrics')).to_contain_text('Checks pass')
    page.locator('[data-tab="plan"]').click()
    page.locator('[data-action="undo"]').click()
    assert len(current_project(page)['connections']) == 0

@scenario('Layered routing produces a checked witness and actual vector SVG')
def routes(page):
    route_demo(page)
    r = json.loads(downloaded(page,'[data-action="engineering-download"]'))
    assert r['verified'] is True and r['metrics']['routed'] == 2
    assert r['metrics']['vias'] == 2
    svg = downloaded(page,'[data-action="engineering-svg"]').decode()
    assert '<svg' in svg and '<path' in svg and 'not signoff' in svg
    assert page.locator('.route-preview svg').count() == 1

@scenario('A completed route becomes visibly stale after constraints change')
def stale_completed(page):
    route_demo(page)
    p = current_project(page)
    p['rules']['maxLength'] += 1
    edit_project(page,p)
    expect(page.locator('#engineeringReport')).to_contain_text('STALE RESULT')
    expect(page.locator('[data-action="engineering-bundle-routes"]')).to_be_disabled()

@scenario('Off-grid routing fails closed without modifying the model')
def offgrid(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="engineering-demo"]').click()
    before = current_project(page)
    page.locator('[data-engineering="pitch"]').fill('7')
    page.locator('[data-action="engineering-route"]').click()
    expect(page.locator('#toast')).to_contain_text('OFF_GRID',timeout=8000)
    assert current_project(page) == before

@scenario('Unsupported exact-stage size reports a resource limit, not infeasibility')
def large_scope(page):
    page.locator('[data-tab="engineering"]').click()
    before = current_project(page)
    page.locator('[data-action="engineering-exact"]').click()
    expect(page.locator('#toast')).to_contain_text('12 movable',timeout=8000)
    assert current_project(page) == before

@scenario('Cancellation terminates a running worker without applying a candidate')
def cancel(page):
    slow_case(page)
    before = current_project(page)
    page.locator('[data-action="engineering-exact"]').click()
    page.locator('[data-action="cancel-optimize"]').click()
    assert current_project(page) == before
    expect(page.locator('[data-action="engineering-exact"]')).to_be_enabled()

@scenario('A worker result is discarded when project content changes during execution')
def stale_worker(page):
    slow_case(page)
    before = current_project(page)
    page.locator('[data-action="engineering-exact"]').click()
    before['name'] = 'Changed while exact worker is running'
    edit_project(page,before)
    expect(page.locator('#toast')).to_contain_text('Stale engineering results were discarded',timeout=15000)
    assert current_project(page)['name'] == before['name']
    assert page.locator('#engineeringReport').count() == 0

@scenario('Browser SHA-256 review bundle verifies independently in the Node CLI')
def evidence_cli(page):
    route_demo(page)
    blob = downloaded(page,'[data-action="engineering-bundle-routes"]')
    data = json.loads(blob)
    assert data['manifest']['routingPass'] is True
    assert data['manifest']['engineVersion'] == json.loads((ROOT/'package.json').read_text())['version']
    with tempfile.TemporaryDirectory() as tmp:
        f = Path(tmp)/'review.json'; f.write_bytes(blob)
        checked = subprocess.run(['node','scripts/cli.mjs','verify-bundle',str(f)],cwd=ROOT,capture_output=True,text=True)
        assert checked.returncode == 0, checked.stderr + checked.stdout
        assert json.loads(checked.stdout)['valid'] is True

@scenario('Browser verifier checks current-design freshness as well as bundle hashes')
def evidence_ui(page):
    route_demo(page)
    blob = downloaded(page,'[data-action="engineering-bundle-routes"]')
    def verify():
        page.locator('#reviewBundleFile').set_input_files({'name':'review.json','mimeType':'application/json','buffer':blob})
        page.locator('[data-action="engineering-verify"]').click()
    verify()
    expect(page.locator('#bundleVerification')).to_contain_text('"valid": true',timeout=10000)
    p = current_project(page); p['name'] = 'New revision'
    edit_project(page,p)
    verify()
    expect(page.locator('#bundleVerification')).to_contain_text('"valid": false',timeout=10000)
    expect(page.locator('#bundleVerification')).to_contain_text('different expected project')

@scenario('Corrupt review contents do not acquire a passing browser verification')
def corrupt_bundle(page):
    page.locator('[data-tab="engineering"]').click()
    b = json.loads(downloaded(page,'[data-action="engineering-bundle"]'))
    b['payload']['validation']['metrics']['totalLength'] = 0
    page.locator('#reviewBundleFile').set_input_files({'name':'corrupt.json','mimeType':'application/json','buffer':json.dumps(b).encode()})
    page.locator('[data-action="engineering-verify"]').click()
    expect(page.locator('#bundleVerification')).to_contain_text('"valid": false',timeout=10000)


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--chromium',default=os.environ.get('CHROMIUM','/usr/bin/chromium'))
    parser.add_argument('--native',action='store_true')
    args=parser.parse_args()
    server=None; origin=None; results=[]
    if args.native:
        sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
        server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
        for _ in range(50):
            try: connection=socket.create_connection(('127.0.0.1',port),.1);connection.close();break
            except OSError: time.sleep(.1)
        origin=f'http://127.0.0.1:{port}/dist/openbumpplan.html'
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
            for name,fn in SCENARIOS:
                context=browser.new_context(viewport={'width':1600,'height':1200},accept_downloads=True)
                page=context.new_page();page.set_default_timeout(8000)
                errors=[];requests=[]
                page.on('pageerror',lambda e:errors.append(str(e)))
                page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
                start=time.perf_counter()
                try:
                    if args.native: page.goto(origin)
                    else: page.set_content((ROOT/'dist/openbumpplan.html').read_text(),wait_until='load')
                    fn(page)
                    assert not errors,errors
                    assert all(origin and r.startswith(origin.rsplit('/',2)[0]) for r in requests),requests
                    result={'name':name,'passed':True}
                    if name.startswith('Layered routing'):
                        page.set_viewport_size({'width':1600,'height':1900})
                        page.locator('#workspace').evaluate('(element) => element.scrollTop = 0')
                        expect(page.locator('#toast')).not_to_have_class('show',timeout=8000)
                        page.screenshot(path=str(ROOT/'docs/engineering-studio.png'),full_page=True)
                except Exception as e:
                    result={'name':name,'passed':False,'error':str(e),'traceback':traceback.format_exc()}
                result['seconds']=round(time.perf_counter()-start,3);results.append(result)
                print(('PASS ' if result['passed'] else 'FAIL ')+name,flush=True)
                if not result['passed']:print(result['traceback'],flush=True)
                context.close()
            if args.native:
                page=browser.new_page();page.goto(origin)
                p=current_project(page);p['name']='Native origin persistence test';edit_project(page,p)
                page.reload();assert current_project(page)['name']=='Native origin persistence test'
                results.append({'name':'Native reload restores the saved project','passed':True})
            report={'browser':browser.version,'mode':'native localhost' if args.native else 'standalone HTML set_content',
                    'limitations':[] if args.native else ['Native localhost/file navigation and true-origin persistence remain unverified; this managed browser blocks navigation.'],
                    'total':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'scenarios':results}
            output='native-browser-v0.3.0.json' if args.native else 'engineering-browser-v0.3.0.json'
            (ROOT/'docs'/output).write_text(json.dumps(report,indent=2)+'\n')
            browser.close()
    finally:
        if server:server.terminate();server.wait(timeout=5)
    raise SystemExit(1 if any(not r['passed'] for r in results) else 0)
if __name__=='__main__':main()
