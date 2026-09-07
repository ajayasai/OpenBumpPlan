#!/usr/bin/env python3
"""Real standalone HTML, worker and downloaded-bundle tests for v0.4.
The large case uses ordinary UI controls and actual route generation, not an
injected worker result. --native additionally tests an actual localhost origin.
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
from engineering_browser_test import ROOT, downloaded, current_project, edit_project

SCENARIOS = []
def scenario(name):
    def register(fn): SCENARIOS.append((name,fn)); return fn
    return register

def controls(page, values):
    for key,value in values.items():
        target=page.locator(f'[data-engineering="{key}"]')
        if key in ('fromKind','toKind'): target.select_option(value)
        else:
            # Explicit grid controls are in a normal expandable details element.
            parent=target.locator('xpath=ancestor::details')
            if parent.count() and parent.get_attribute('open') is None: parent.locator('summary').click()
            target.fill(str(value)); target.dispatch_event('change')

def route_demo(page):
    page.locator('[data-tab="engineering"]').click(); page.locator('[data-action="engineering-demo"]').click()
    page.locator('[data-action="engineering-physical"]').click()
    expect(page.locator('#engineeringReport')).to_contain_text('routed-physical',timeout=30000)

@scenario('4096 actual physical routes from UI, 5 MiB reusable arrays, downloaded review replay')
def large(page):
    source=subprocess.run(['node','--input-type=module','-e',
        "import {copperArray} from './tests/copper-fixtures.mjs'; console.log(JSON.stringify(copperArray(4096).project));"],
        cwd=ROOT,capture_output=True,text=True,check=True)
    project=json.loads(source.stdout); edit_project(page,project)
    project=current_project(page)  # Import itself records an audit/revision transaction.
    page.locator('[data-tab="engineering"]').click()
    controls(page,dict(fromKind='pad',toKind='ball',pitch=1,layers=1,clearance=0,viaCost=4,
        traceWidth=.2,viaDiameter=.3,padDiameter=.4,copperClearance=.2,originX=0,originY=0,columns=512,rows=512))
    page.locator('[data-action="engineering-physical"]').click()
    expect(page.locator('#engineeringReport')).to_contain_text('routed-physical',timeout=60000)
    route=json.loads(downloaded(page,'[data-action="engineering-download"]'))
    assert route['verified'] and route['copperVerification']['ok']
    assert route['metrics']==dict(routed=4096,wireLength=24576,vias=0)
    assert route['searchStats']['searches']==4096 and route['searchStats']['workspaces']==1
    assert route['searchStats']['scratchBytes']==5242880 and route['searchStats']['fullResets']==0
    assert current_project(page)==project
    raw=downloaded(page,'[data-action="engineering-bundle-routes"]');bundle=json.loads(raw)
    assert bundle['manifest']['engineVersion']=='0.4.0' and bundle['manifest']['copperPass']
    with tempfile.TemporaryDirectory() as tmp:
        b=Path(tmp)/'bundle.json';b.write_bytes(raw);t=Path(tmp)/'technology.json';t.write_text(json.dumps(route['technology']))
        p=Path(tmp)/'project.json';p.write_text(json.dumps(project))
        checked=subprocess.run(['node','scripts/cli.mjs','verify-bundle',str(b),'--project',str(p),'--technology',str(t)],
            cwd=ROOT,capture_output=True,text=True,timeout=45)
        assert checked.returncode==0,checked.stdout+checked.stderr

@scenario('Changed copper controls make old evidence stale and disable approval')
def stale_controls(page):
    route_demo(page); before=current_project(page)
    controls(page,dict(traceWidth=20))
    expect(page.locator('#engineeringReport')).to_contain_text('STALE RESULT')
    expect(page.locator('[data-action="engineering-bundle-routes"]')).to_be_disabled()
    assert current_project(page)==before

@scenario('Negative explicit origins work; clearing controls restores automatic bounds')
def grid_window(page):
    page.locator('[data-tab="engineering"]').click();page.locator('[data-action="engineering-demo"]').click()
    controls(page,dict(originX=-10,originY=-10,columns=9,rows=9))
    page.locator('[data-action="engineering-route"]').click()
    expect(page.locator('#engineeringReport')).to_contain_text('routed',timeout=30000)
    r=json.loads(downloaded(page,'[data-action="engineering-download"]'))
    assert r['verified'] and r['config']['originX']==-10 and r['config']['columns']==9
    controls(page,dict(originX='',originY='',columns='',rows=''))
    expect(page.locator('[data-action="engineering-bundle-routes"]')).to_be_disabled()
    page.locator('[data-action="engineering-route"]').click()
    expect(page.locator('#engineeringReport')).not_to_contain_text('STALE RESULT',timeout=30000)
    r=json.loads(downloaded(page,'[data-action="engineering-download"]'))
    assert r['verified'] and r['config']['originX']==-30

@scenario('Oversized explicit grid fails closed without changing the project')
def grid_limit(page):
    page.locator('[data-tab="engineering"]').click();page.locator('[data-action="engineering-demo"]').click();before=current_project(page)
    controls(page,dict(columns=1024,rows=1024))
    page.locator('[data-action="engineering-route"]').click()
    expect(page.locator('#toast')).to_contain_text('262,144',timeout=20000)
    assert current_project(page)==before
    assert page.locator('[data-action="engineering-bundle-routes"]').count()==0


def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--chromium',default='/usr/bin/chromium')
    parser.add_argument('--native',action='store_true');parser.add_argument('--output-dir',type=Path,default=ROOT/'docs')
    args=parser.parse_args();args.output_dir.mkdir(parents=True,exist_ok=True);server=None;origin=None;results=[]
    if args.native:
        with socket.socket() as sock:sock.bind(('127.0.0.1',0));port=sock.getsockname()[1]
        origin=f'http://127.0.0.1:{port}'
        server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
        for _ in range(50):
            try:connection=socket.create_connection(('127.0.0.1',port),.1);connection.close();break
            except OSError:time.sleep(.1)
    try:
        with sync_playwright() as pw:
            browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
            for name,fn in SCENARIOS:
                ctx=browser.new_context(viewport={'width':1600,'height':1200},accept_downloads=True)
                page=ctx.new_page();page.set_default_timeout(20000);errors=[];requests=[]
                page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
                start=time.perf_counter()
                try:
                    if origin:page.goto(origin+'/dist/openbumpplan.html')
                    else:page.set_content((ROOT/'dist/openbumpplan.html').read_text(),wait_until='load')
                    fn(page);assert not errors,errors;assert all(origin and u.startswith(origin+'/') for u in requests),requests
                    result={'name':name,'passed':True}
                    if name.startswith('4096'):page.screenshot(path=str(args.output_dir/('v04-large-native.png' if origin else 'v04-large-standalone.png')),full_page=True)
                except Exception as e:result={'name':name,'passed':False,'error':str(e),'traceback':traceback.format_exc()}
                result['seconds']=round(time.perf_counter()-start,3);results.append(result)
                print(('PASS ' if result['passed'] else 'FAIL ')+name,flush=True)
                if not result['passed']:print(result['traceback'],flush=True)
                ctx.close()
            report={'browser':browser.version,'mode':'native localhost' if origin else 'standalone set_content',
                'total':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'scenarios':results}
            (args.output_dir/('v04-native-browser.json' if origin else 'v04-browser.json')).write_text(json.dumps(report,indent=2)+'\n');browser.close()
    finally:
        if server:server.terminate();server.wait(timeout=5)
    raise SystemExit(1 if any(not r['passed'] for r in results) else 0)
if __name__=='__main__':main()
