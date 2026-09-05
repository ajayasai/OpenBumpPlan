#!/usr/bin/env python3
"""Optional browser integration tests. Requires Python + Playwright + Chromium.
Uses the actual built standalone HTML through set_content, not a mock application.
This works in managed environments that prohibit file:// and localhost navigation.
It does NOT verify native file navigation or real-origin localStorage persistence.
Run: python tests/browser_test.py [--chromium /path/to/chromium]
"""
import argparse
import json
import os
from pathlib import Path
import time
import traceback
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]
HTML = (ROOT / 'dist/openbumpplan.html').read_text()
RESULTS = []
SCENARIOS = []


def scenario(name):
    def decorate(fn):
        SCENARIOS.append((name, fn))
        return fn
    return decorate


def select_port(page, ident):
    item = page.locator(f'[data-port="{ident}"]')
    item.focus()
    item.press('Enter')
    assert page.locator('.inspector-title').inner_text() == ident


def export(page, fmt='json'):
    with page.expect_download(timeout=8000) as event:
        if fmt == 'json':
            page.locator('[data-action="export-json"]').click()
        else:
            page.locator('#exportSelect').select_option(fmt)
    dl = event.value
    assert dl.failure() is None
    return Path(dl.path()).read_bytes()


def project(page):
    return json.loads(export(page))


def port(data, ident):
    return next(x for x in data['ports'] if x['id'] == ident)


@scenario('Boot: all five layers and 122 sites, no application exception')
def boot(page):
    assert page.title().startswith('OpenBumpPlan')
    assert page.locator('[data-port]').count() == 122
    assert page.locator('[data-layer]').count() == 5
    data = project(page)
    assert len(data['connections']) == 96
    assert data['units'] == 'um'
    assert 'Review warnings' in page.locator('.metrics').inner_text()


@scenario('Worker optimization, measured improvement, undo and redo')
def optimization(page):
    page.locator('[data-action="optimize"]').click()
    expect(page.locator('.metrics')).to_contain_text('25,920', timeout=8000)
    a = json.loads(export(page, 'validation'))
    assert a['errors'] == a['warnings'] == 0
    assert a['metrics']['crossings'] == 0
    assert a['metrics']['score'] == 25920
    page.locator('[data-action="undo"]').click()
    assert json.loads(export(page, 'validation'))['metrics']['score'] == 27540
    page.locator('[data-action="redo"]').click()
    assert json.loads(export(page, 'validation'))['metrics']['score'] == 25920


@scenario('Inspector changes and keyboard undo/redo preserve revision content')
def inspector(page):
    select_port(page, 'CORE:pad:9')
    page.locator('[data-form="port"] [name="label"]').fill('Review DATA9')
    page.locator('[data-form="port"] button[type="submit"]').click()
    assert port(project(page), 'CORE:pad:9')['label'] == 'Review DATA9'
    page.locator('[data-port="CORE:pad:9"]').focus()
    page.keyboard.press('Control+z')
    assert port(project(page), 'CORE:pad:9')['label'] != 'Review DATA9'
    page.locator('[data-port="CORE:pad:9"]').focus()
    page.keyboard.press('Control+Shift+z')
    assert port(project(page), 'CORE:pad:9')['label'] == 'Review DATA9'


@scenario('Strict net conflict rejected atomically; explicit draft edit reported')
def strict_conflict(page):
    select_port(page, 'CORE:ball:9')
    page.locator('[data-form="port"] [name="net"]').fill('WRONG_NET')
    page.locator('[data-form="port"] button[type="submit"]').click()
    assert 'blocked' in page.locator('#toast').inner_text().lower()
    assert port(project(page), 'CORE:ball:9')['net'] != 'WRONG_NET'
    page.locator('#strictToggle').uncheck()
    page.locator('[data-form="port"] [name="net"]').fill('WRONG_NET')
    page.locator('[data-form="port"] button[type="submit"]').click()
    a = json.loads(export(page, 'validation'))
    assert a['errors'] > 0
    assert any(i['code'] == 'NET_CONFLICT' for i in a['issues'])


@scenario('Pointer movement changes snapped coordinates; Undo restores')
def pointer_move(page):
    # Show only pads to avoid overlapping physical-layer hit targets.
    for kind in ['bump', 'interposer', 'ball', 'pcb']:
        page.locator(f'[data-layer="{kind}"]').uncheck()
    page.locator('#labelToggle').uncheck()
    page.locator('[data-mode="move"]').click()
    before = project(page)
    ident = 'CORE:pad:9'
    box = page.locator(f'[data-port="{ident}"] circle').last.bounding_box()
    assert box
    x, y = box['x'] + box['width']/2, box['y'] + box['height']/2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x+6, y, steps=5)
    page.mouse.up()
    after = project(page)
    assert port(after, ident)['x'] != port(before, ident)['x']
    assert port(after, ident)['x'] % 10 == 0
    page.locator('[data-action="undo"]').click()
    assert port(project(page), ident)['x'] == port(before, ident)['x']


@scenario('Explicit occupied-target reassignment and lock controls')
def reassign(page):
    select_port(page, 'CORE:interposer:9')
    page.locator('[data-form="assign"] [name="target"]').select_option('CORE:ball:9')
    page.locator('[data-form="assign"] [name="replace"]').check()
    page.locator('[data-form="assign"] button').click()
    p = project(page)
    assert any(e['from'] == 'CORE:interposer:9' and e['to'] == 'CORE:ball:9' for e in p['connections'])
    page.locator('[data-action="lock"]').click()
    assert port(project(page), 'CORE:interposer:9')['locked']
    assert page.locator('[data-form="port"] [name="x"]').is_disabled()
    assert page.locator('[data-form="assign"] button').is_disabled()


@scenario('CSV preview, millimetre conversion, apply and duplicate rejection')
def csv_import(page):
    page.locator('[data-action="import"]').click()
    page.locator('[name="importType"]').select_option('ports')
    page.locator('[name="importKind"]').select_option('ball')
    page.locator('[name="importUnits"]').select_option('mm')
    page.locator('#importText').fill('id,x,y,role\nNEW_BALL,12.5,8,any\n')
    page.locator('[data-action="preview-import"]').click()
    assert page.locator('#applyImport').is_enabled()
    page.locator('#applyImport').click()
    data = project(page)
    assert len(data['ports']) == 123
    assert port(data, 'NEW_BALL')['x'] == 12500
    page.locator('[data-action="import"]').click()
    page.locator('[name="importType"]').select_option('ports')
    page.locator('#importText').fill('id,x,y\nNEW_BALL,0,0\n')
    page.locator('[data-action="preview-import"]').click()
    assert page.locator('#applyImport').is_disabled()
    assert page.locator('#dialogError').inner_text()


@scenario('Array generator creates unassigned sites, not invented nets')
def array(page):
    page.locator('[data-action="array"]').click()
    page.locator('#arrayForm [name="rows"]').fill('2')
    page.locator('#arrayForm [name="columns"]').fill('3')
    page.locator('#arrayForm [name="prefix"]').fill('TEST_GRID')
    page.locator('[data-action="create-array"]').click()
    data = project(page)
    added = [p for p in data['ports'] if p['id'].startswith('TEST_GRID')]
    assert len(added) == 6
    assert all(p['net'] == '' and p['role'] == 'any' for p in added)


@scenario('All export formats produce actual parsable or signature-valid files')
def formats(page):
    assert len(json.loads(export(page))['ports']) == 122
    assert export(page, 'ports').startswith(b'id,label,kind,')
    assert export(page, 'connections').startswith(b'id,from,to,')
    assert b'<svg ' in export(page, 'svg')
    pdf = export(page, 'pdf')
    assert pdf.startswith(b'%PDF-') and b'%%EOF' in pdf[-20:]
    assert b'interface control' in export(page, 'html').lower(), 'HTML document marker'
    assert b'interface-control' in export(page, 'md').lower(), 'Markdown document marker'
    assert json.loads(export(page, 'validation'))['complete']
    assert 'changes' in json.loads(export(page, 'diff'))


@scenario('Revision review and embedded interface-control document')
def review(page):
    page.locator('[data-action="optimize"]').click()
    expect(page.locator('.metrics')).to_contain_text('25,920', timeout=8000)
    page.locator('[data-tab="revisions"]').click()
    assert 'Regression gate: no newly introduced' in page.locator('#workspace').inner_text()
    diff = json.loads(export(page, 'diff'))
    assert diff['summary']['changed'] > 0
    assert len(diff['propagated']) > 0
    page.locator('[data-action="baseline-current"]').click()
    assert json.loads(export(page, 'diff'))['changes'] == []
    page.locator('[data-tab="icd"]').click()
    frame = page.frame_locator('#icdFrame')
    assert 'Dual-chiplet' in frame.locator('h1').inner_text()
    assert frame.locator('body').inner_text().count('PLANNING') > 0


@scenario('Connectivity search, layer toggles, exploded layout and zoom')
def views(page):
    page.locator('[data-tab="connections"]').click()
    page.locator('#connectionSearch').fill('CORE:pad:9')
    assert 'CORE:pad:9' in page.locator('#workspace').inner_text()
    page.locator('[data-tab="plan"]').click()
    page.locator('[data-layer="pad"]').uncheck()
    assert page.locator('[data-port]').count() == 98
    page.locator('#viewSelect').select_option('exploded')
    before = page.locator('#map').get_attribute('viewBox')
    box = page.locator('#map').bounding_box()
    page.mouse.move(box['x']+box['width']/2, box['y']+box['height']/2)
    page.mouse.wheel(0, -120)
    page.wait_for_timeout(150)
    assert page.locator('#map').get_attribute('viewBox') != before
    page.locator('[data-action="fit"]').click()
    assert page.locator('#map').get_attribute('viewBox') == before


@scenario('Rule editing updates validation without claiming signoff')
def rules(page):
    page.locator('[data-tab="rules"]').click()
    page.locator('[name="maxLength"]').fill('50')
    page.locator('[data-form="rules"] button[type="submit"]').click()
    data = project(page)
    assert data['rules']['maxLength'] == 50
    a = json.loads(export(page, 'validation'))
    assert a['errors'] > 0
    assert any(i['code'] == 'MAX_LENGTH' for i in a['issues'])



@scenario('Engineering exact oracle exposes bounds and applies only after review')
def exact_engineering(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="lab-demo-exact"]').click()
    before = project(page)
    page.locator('[data-action="lab-exact"]').click()
    expect(page.locator('#engineeringResult')).to_contain_text('optimal', timeout=12000)
    with page.expect_download() as event:
        page.locator('[data-action="lab-result"]').click()
    result = json.loads(Path(event.value.path()).read_text())
    assert result['upperBound'] == result['lowerBound'] == 2850
    assert project(page) == before, 'Solving alone must not modify the input'
    page.locator('[data-action="lab-apply"]').click()
    assert json.loads(export(page, 'validation'))['errors'] == 0
    expect(page.locator('#engineeringResult')).to_contain_text('STALE')
    assert page.locator('[data-action="lab-apply"]').is_disabled()
    page.keyboard.press('Control+z')
    assert project(page) == before
    assert page.locator('[data-action="lab-apply"]').is_enabled()


@scenario('Multilayer routing workbench displays checked paths and real SVG export')
def routing_engineering(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="lab-demo-routing"]').click()
    before = project(page)
    page.locator('[data-action="lab-route"]').click()
    expect(page.locator('#engineeringResult')).to_contain_text('passes configured grid geometry', timeout=12000)
    with page.expect_download() as event:
        page.locator('[data-action="lab-result"]').click()
    result = json.loads(Path(event.value.path()).read_text())
    assert result['check']['valid'] and len(result['routes']) == 2
    assert result['check']['metrics']['vias'] == 4
    assert project(page) == before
    with page.expect_download() as event:
        page.locator('[data-action="lab-svg"]').click()
    assert b'<svg ' in Path(event.value.path()).read_bytes()
    assert page.locator('#engineeringResult svg').count() == 1


@scenario('Engineering worker errors are visible and cannot change project data')
def engineering_error(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="lab-demo-routing"]').click()
    before = project(page)
    config = json.loads(page.locator('#labConfig').input_value())
    config['pitch'] = 137
    page.locator('#labConfig').fill(json.dumps(config))
    page.locator('[data-action="lab-route"]').click()
    expect(page.locator('#toast')).to_contain_text('off-grid', timeout=12000)
    assert project(page) == before
    assert page.locator('[data-action="lab-route"]').is_enabled()


@scenario('Engineering stale result is visibly invalidated by a rule edit')
def engineering_stale(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="lab-demo-exact"]').click()
    page.locator('[data-action="lab-exact"]').click()
    expect(page.locator('#engineeringResult')).to_contain_text('optimal', timeout=12000)
    page.locator('[data-tab="rules"]').click()
    page.locator('[name="maxLength"]').fill('1234')
    page.locator('[data-form="rules"] button[type="submit"]').click()
    page.locator('[data-tab="engineering"]').click()
    expect(page.locator('#engineeringResult')).to_contain_text('STALE')
    assert page.locator('[data-action="lab-apply"]').is_disabled()


@scenario('Web Crypto evidence export fails explicitly rather than using a weak hash')
def evidence_environment(page):
    page.locator('[data-tab="engineering"]').click()
    page.locator('[data-action="lab-demo-exact"]').click()
    page.locator('[data-action="lab-exact"]').click()
    expect(page.locator('#engineeringResult')).to_contain_text('optimal', timeout=12000)
    if page.evaluate('!!globalThis.crypto?.subtle'):
        with page.expect_download() as event:
            page.locator('[data-action="lab-evidence"]').click()
        evidence = json.loads(Path(event.value.path()).read_text())
        assert len(evidence['projectSHA256']) == 64
    else:
        page.locator('[data-action="lab-evidence"]').click()
        expect(page.locator('#toast')).to_contain_text('Web Crypto')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chromium', default=os.environ.get('CHROMIUM', '/usr/bin/chromium'))
    parser.add_argument('--url', default='')
    args = parser.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox'])
        version = browser.version
        for name, fn in SCENARIOS:
            context = browser.new_context(viewport={'width': 1600, 'height': 1050}, accept_downloads=True)
            page = context.new_page()
            page.set_default_timeout(7000)
            errors, requests = [], []
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.on('request', lambda req: requests.append(req.url) if req.url.startswith(('http://','https://')) else None)
            started = time.perf_counter()
            try:
                if args.url:
                    page.goto(args.url, wait_until='load')
                else:
                    page.set_content(HTML, wait_until='load')
                fn(page)
                assert not errors, errors
                if args.url:
                    from urllib.parse import urlsplit
                    origin = urlsplit(args.url)
                    assert all(urlsplit(u).netloc == origin.netloc and urlsplit(u).scheme == origin.scheme for u in requests), requests
                else:
                    assert not requests, requests
                result = {'name': name, 'passed': True}
            except Exception as error:
                result = {'name': name, 'passed': False, 'error': str(error), 'traceback': traceback.format_exc()}
            result['seconds'] = round(time.perf_counter()-started, 3)
            RESULTS.append(result)
            print(('PASS ' if result['passed'] else 'FAIL ') + name, flush=True)
            if not result['passed']:
                print(result.get('traceback'), flush=True)
            context.close()
        # Documentation screenshot uses the running application, not a concept rendering.
        page = browser.new_page(viewport={'width': 1600, 'height': 1050})
        if args.url:
            page.goto(args.url, wait_until='load')
        else:
            page.set_content(HTML, wait_until='load')
        page.locator('#labelToggle').uncheck()
        page.locator('[data-action="optimize"]').click()
        expect(page.locator('.metrics')).to_contain_text('25,920', timeout=8000)
        page.wait_for_timeout(6800)  # Allow the normal status toast to expire.
        page.screenshot(path=str(ROOT/'docs/studio-screenshot.png'), full_page=True)
        page.locator('[data-tab="engineering"]').click()
        page.locator('[data-action="lab-demo-routing"]').click()
        page.locator('[data-action="lab-route"]').click()
        expect(page.locator('#engineeringResult')).to_contain_text('passes configured grid geometry', timeout=12000)
        page.screenshot(path=str(ROOT/'docs/engineering-screenshot.png'), full_page=True)
        browser.close()
    report = {'origin': args.url or 'about:blank (set_content)', 'browser': f'Chromium {version}', 'harness': 'Actual standalone HTML loaded using Playwright set_content; fresh context per scenario', 'limitations': ['Native file:// / localhost navigation and real-origin localStorage persistence were not tested: managed Chromium blocked navigation in this environment.', 'No cross-browser, accessibility audit, or large-scale interactive performance qualification.'], 'total': len(RESULTS), 'passed': sum(r['passed'] for r in RESULTS), 'failed': sum(not r['passed'] for r in RESULTS), 'scenarios': RESULTS}
    if args.url:
        report['harness'] = 'Real HTTP navigation to ' + args.url + '; fresh browser context per scenario'
        report['limitations'] = ['No foundry qualification, non-Chromium cross-browser or large-scale interactive performance qualification.']
    (ROOT/'docs/browser-test-results.json').write_text(json.dumps(report, indent=2)+'\n')
    raise SystemExit(0 if report['failed'] == 0 else 1)


if __name__ == '__main__':
    main()
