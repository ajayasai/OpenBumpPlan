#!/usr/bin/env python3
"""Real bundled HTML/worker scenarios. --native adds real-origin persistence.
Never disables managed navigation policy. CI can exercise localhost normally.
"""
import argparse,json,os,socket,subprocess,tempfile,time,traceback
from pathlib import Path
from playwright.sync_api import sync_playwright,expect
from engineering_browser_test import ROOT,downloaded,current_project,edit_project
SCENARIOS=[]
def scenario(name):
 def register(fn):SCENARIOS.append((name,fn));return fn
 return register

def constrained(page):
 page.locator('[data-tab="engineering"]').click()
 page.locator('[data-action="engineering-coupled-demo"]').click()

@scenario('Certified coupled worker, self-contained proof export, CLI replay and undo')
def coupled(page):
 constrained(page);before=current_project(page)
 page.locator('[data-action="engineering-coupled"]').click()
 expect(page.locator('#engineeringReport')).to_contain_text('certified-coupled-optimal',timeout=20000)
 report=json.loads(downloaded(page,'[data-action="engineering-download"]'))
 assert report['verification']['ok'] and report['proof']['claim']=='optimal'
 assert report['inputProject']==before and current_project(page)==before
 with tempfile.TemporaryDirectory() as tmp:
  p=Path(tmp)/'p.json';p.write_text(json.dumps(before));r=Path(tmp)/'proof.json';r.write_text(json.dumps(report['proof']))
  checked=subprocess.run(['node','scripts/cli.mjs','verify-coupled',str(p),str(r)],cwd=ROOT,capture_output=True,text=True)
  assert checked.returncode==0,checked.stdout+checked.stderr
 page.locator('[data-action="engineering-apply"]').click()
 assert len(current_project(page)['connections'])==3
 page.locator('[data-tab="plan"]').click();page.locator('[data-action="undo"]').click()
 assert current_project(page)['connections']==before['connections']

@scenario('One-subproblem cutoff stays unknown with disabled Apply')
def bounded(page):
 constrained(page);before=current_project(page)
 page.locator('[data-engineering="maxSubproblems"]').fill('1')
 page.locator('[data-action="engineering-coupled"]').click()
 expect(page.locator('#engineeringReport')).to_contain_text('unknown')
 expect(page.locator('[data-action="engineering-apply"]')).to_be_disabled()
 assert current_project(page)==before

@scenario('Invalid relaxed assignment is never applied')
def linear_rejection(page):
 constrained(page);before=current_project(page)
 page.locator('[data-action="engineering-scalable"]').click()
 expect(page.locator('#engineeringReport')).to_contain_text('coupled-constraints-rejected')
 expect(page.locator('[data-action="engineering-apply"]')).to_be_disabled()
 assert current_project(page)==before

@scenario('Physical worker checks finite trace/via/pad dimensions and exports signed-review-ready evidence')
def copper(page):
 page.locator('[data-tab="engineering"]').click();page.locator('[data-action="engineering-demo"]').click()
 page.locator('[data-action="engineering-physical"]').click()
 expect(page.locator('#engineeringReport')).to_contain_text('routed-physical',timeout=20000)
 r=json.loads(downloaded(page,'[data-action="engineering-download"]'))
 assert r['verified'] and r['copperVerification']['ok'] and r['technology']['traceWidth']==1
 assert r['copperVerification']['algorithm']=='aabb-bvh-v1'
 assert 0 < r['copperVerification']['spatialVisits'] <= 10000000
 b=json.loads(downloaded(page,'[data-action="engineering-bundle-routes"]'))
 assert b['manifest']['copperPass'] and b['manifest']['routingPass']
 with tempfile.TemporaryDirectory() as tmp:
  file=Path(tmp)/'b.json';file.write_text(json.dumps(b));tech=Path(tmp)/'t.json';tech.write_text(json.dumps(r['technology']))
  checked=subprocess.run(['node','scripts/cli.mjs','verify-bundle',str(file),'--technology',str(tech)],cwd=ROOT,capture_output=True,text=True)
  assert checked.returncode==0,checked.stdout+checked.stderr
 page.set_viewport_size({'width':1600,'height':1500});page.locator('#engineeringReport').scroll_into_view_if_needed()
 page.screenshot(path=str(ROOT/'docs/studio-v0.3.0.png'),full_page=True)

@scenario('Oversized declared copper cannot get a passing bundle')
def too_wide(page):
 page.locator('[data-tab="engineering"]').click();page.locator('[data-action="engineering-demo"]').click()
 page.locator('[data-engineering="padDiameter"]').fill('50')
 page.locator('[data-action="engineering-physical"]').click()
 expect(page.locator('#engineeringReport')).to_contain_text('No fully checked copper witness',timeout=20000)
 expect(page.locator('[data-action="engineering-bundle-routes"]')).to_be_disabled()
 r=json.loads(downloaded(page,'[data-action="engineering-download"]'));assert not r['verified'];assert r['technology']['padDiameter']==50

@scenario('Changing the design invalidates a completed coupled proof for Apply')
def stale(page):
 constrained(page);page.locator('[data-action="engineering-coupled"]').click()
 expect(page.locator('#engineeringReport')).to_contain_text('certified-coupled-optimal',timeout=20000)
 p=current_project(page);p['name']='Changed after calculation';edit_project(page,p)
 expect(page.locator('#engineeringReport')).to_contain_text('STALE RESULT')
 expect(page.locator('[data-action="engineering-apply"]')).to_be_disabled()

@scenario('Cost quantum validation fails without changing coordinates or rules')
def invalid_cost(page):
 constrained(page);p=current_project(page)
 page.locator('[data-engineering="quantum"]').fill('0');page.locator('[data-action="engineering-coupled"]').click()
 expect(page.locator('#toast')).to_contain_text('Invalid changePenalty or quantum')
 assert current_project(page)==p

@scenario('Negotiated router uses actual worker and exports a recheckable witness')
def negotiation(page):
 p=json.loads((ROOT/'examples/congestion-laboratory.json').read_text());edit_project(page,p)
 page.locator('[data-tab="engineering"]').click()
 page.locator('[data-engineering="fromKind"]').select_option('pad');page.locator('[data-engineering="toKind"]').select_option('ball')
 page.locator('[data-engineering="layers"]').fill('1');page.locator('[data-action="engineering-negotiated"]').click()
 expect(page.locator('#engineeringReport')).to_contain_text('routed',timeout=20000)
 r=json.loads(downloaded(page,'[data-action="engineering-download"]'));assert r['verified'];assert r['strategy']=='negotiated-congestion'

def main():
 parser=argparse.ArgumentParser();parser.add_argument('--chromium',default='/usr/bin/chromium');parser.add_argument('--native',action='store_true');args=parser.parse_args()
 origin=None;server=None;results=[]
 if args.native:
  sock=socket.socket();sock.bind(('127.0.0.1',0));port=sock.getsockname()[1];sock.close()
  origin=f'http://127.0.0.1:{port}';server=subprocess.Popen(['node','scripts/serve.mjs'],cwd=ROOT,env={**os.environ,'PORT':str(port)},stdout=subprocess.DEVNULL)
  for _ in range(50):
   try:c=socket.create_connection(('127.0.0.1',port),.1);c.close();break
   except OSError:time.sleep(.1)
 try:
  with sync_playwright() as pw:
   browser=pw.chromium.launch(executable_path=args.chromium,headless=True,args=['--no-sandbox'])
   for name,fn in SCENARIOS:
    context=browser.new_context(viewport={'width':1600,'height':1200},accept_downloads=True);page=context.new_page();page.set_default_timeout(10000)
    errors=[];requests=[];page.on('pageerror',lambda e:errors.append(str(e)));page.on('request',lambda r:requests.append(r.url) if r.url.startswith(('http:','https:')) else None)
    started=time.perf_counter()
    try:
     if origin:page.goto(origin+'/dist/openbumpplan.html',timeout=10000)
     else:page.set_content((ROOT/'dist/openbumpplan.html').read_text(),wait_until='load')
     fn(page);assert not errors,errors;assert all(origin and url.startswith(origin+'/') for url in requests),requests
     result={'name':name,'passed':True}
    except Exception as e:result={'name':name,'passed':False,'error':str(e),'traceback':traceback.format_exc()}
    result['seconds']=round(time.perf_counter()-started,3);results.append(result);context.close();print(('PASS ' if result['passed'] else 'FAIL ')+name,flush=True)
    if not result['passed']:print(result['traceback'],flush=True)
   if origin:
    context=browser.new_context(accept_downloads=True);page=context.new_page();page.goto(origin+'/dist/openbumpplan.html')
    p=current_project(page);p['name']='v0.3 native persistence';edit_project(page,p);page.reload()
    assert current_project(page)['name']==p['name'];results.append({'name':'Native reload persistence','passed':True});context.close()
   report={'browser':browser.version,'mode':'native localhost' if origin else 'standalone set_content','total':len(results),'passed':sum(r['passed'] for r in results),'failed':sum(not r['passed'] for r in results),'scenarios':results}
   (ROOT/'docs'/('v03-native-browser.json' if origin else 'v03-browser.json')).write_text(json.dumps(report,indent=2)+'\n');browser.close()
 finally:
  if server:server.terminate();server.wait(timeout=5)
 raise SystemExit(1 if any(not r['passed'] for r in results) else 0)
if __name__=='__main__':main()
