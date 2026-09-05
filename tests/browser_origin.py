"""Native loading, persistence and cross-runtime evidence checks.
Run against an already running local read-only server. No set_content fallback:
blocked browser navigation is a FAILURE, not silently relabeled as coverage.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import tempfile
from urllib.parse import urlsplit
from playwright.sync_api import sync_playwright, expect

ROOT = Path(__file__).resolve().parents[1]


def downloaded(page, action):
    with page.expect_download() as event:
        page.locator(f'[data-action="{action}"]').click()
    return Path(event.value.path()).read_bytes()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--chromium', default=os.environ.get('CHROMIUM', '/usr/bin/chromium'))
    parser.add_argument('--url', default='http://127.0.0.1:4173')
    args = parser.parse_args()
    results = []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, headless=True, args=['--no-sandbox'])
        for suffix in ['/', '/dist/openbumpplan.html']:
            with browser.new_context(viewport={'width':1600,'height':1050}, accept_downloads=True) as context:
                page = context.new_page()
                errors, external = [], []
                page.on('pageerror', lambda error: errors.append(str(error)))
                page.on('request', lambda req: external.append(req.url) if req.url.startswith(('http:', 'https:')) and urlsplit(req.url).netloc != urlsplit(args.url).netloc else None)
                page.goto(args.url.rstrip('/') + suffix, wait_until='load')
                assert page.evaluate('isSecureContext && !!crypto.subtle')
                page.locator('[data-tab="engineering"]').click()
                page.locator('[data-action="lab-demo-exact"]').click()
                original = downloaded(page, 'export-json')
                page.reload(wait_until='load')
                assert downloaded(page, 'export-json') == original, 'Browser storage must restore the exact saved revision'
                results.append({'scenario':'real-origin persistence', 'entrypoint':suffix, 'passed':True})
                page.locator('[data-tab="engineering"]').click()
                # Stage selectors are session-only, and revert after a real reload.
                page.locator('[name="fromStage"]').select_option('pad')
                page.locator('[name="toStage"]').select_option('ball')
                page.locator('[data-action="lab-exact"]').click()
                expect(page.locator('#engineeringResult')).to_contain_text('optimal', timeout=12000)
                evidence = downloaded(page, 'lab-evidence')
                recorded_input = downloaded(page, 'lab-input')
                with tempfile.TemporaryDirectory() as td:
                    ip, ep = Path(td)/'input.json', Path(td)/'evidence.json'
                    ip.write_bytes(recorded_input)
                    ep.write_bytes(evidence)
                    result = subprocess.run(['node','scripts/cli.mjs','verify',str(ip),str(ep)], cwd=ROOT, capture_output=True, text=True, timeout=30)
                    assert result.returncode == 0, result.stderr + result.stdout
                    assert json.loads(result.stdout)['planningPass']
                assert not external, external
                assert not errors, errors
                results.append({'scenario':'browser SHA-256 to Node deterministic replay; no third-party requests', 'entrypoint':suffix, 'passed':True})
        # Standalone file loading is distinct from both module and HTTP embedding.
        context = browser.new_context(viewport={'width':1600,'height':1050})
        page = context.new_page()
        page.goto((ROOT/'dist/openbumpplan.html').as_uri(), wait_until='load')
        assert page.locator('[data-port]').count() == 122
        page.locator('[data-action="optimize"]').click()
        expect(page.locator('.metrics')).to_contain_text('25,920', timeout=12000)
        results.append({'scenario':'standalone file navigation and worker optimization', 'entrypoint':'file://dist/openbumpplan.html', 'passed':True})
        report={'browser':browser.version,'total':len(results),'passed':len(results),'scenarios':results}
        (ROOT/'docs/browser-origin-results.json').write_text(json.dumps(report,indent=2)+'\n')
        print(json.dumps(report,indent=2))
        browser.close()


if __name__ == '__main__':
    main()
