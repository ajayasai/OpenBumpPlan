#!/usr/bin/env bash
# Runs locally or on CI with Playwright and Chromium preinstalled.
set -euo pipefail
npm test | tee docs/node-test-results-v0.2.tap
npm run build
node scripts/cli.mjs check examples/chiplet-demo.json
node scripts/cli.mjs check examples/chiplet-optimized.json --fail-on warning
npm run benchmark:engineering
node scripts/cli.mjs verify examples/exact-challenge.json examples/exact-evidence.json
node scripts/cli.mjs verify examples/routing-challenge.json examples/routing-evidence.json
CHROMIUM_PATH="${CHROMIUM_PATH:-$(python -c 'from playwright.sync_api import sync_playwright; p=sync_playwright().start(); print(p.chromium.executable_path); p.stop()')}"
ORIGINAL=$(mktemp)
cp docs/browser-test-results.json "$ORIGINAL"
node scripts/serve.mjs > /tmp/openbumpplan-server.log 2>&1 &
SERVER_PID=$!
cleanup() { kill "$SERVER_PID" 2>/dev/null || true; cp "$ORIGINAL" docs/browser-test-results.json; rm -f "$ORIGINAL"; }
trap cleanup EXIT
python - <<'PY'
import time, urllib.request
for attempt in range(50):
    try:
        with urllib.request.urlopen('http://127.0.0.1:4173/', timeout=1) as r:
            if r.status == 200:
                break
    except OSError:
        time.sleep(.1)
else:
    raise SystemExit('Local read-only application server did not start')
PY
python tests/browser_test.py --chromium "$CHROMIUM_PATH"
cp docs/browser-test-results.json docs/browser-embedded-v0.2.json
python tests/browser_test.py --chromium "$CHROMIUM_PATH" --url http://127.0.0.1:4173/
cp docs/browser-test-results.json docs/browser-native-v0.2.json
python tests/browser_test.py --chromium "$CHROMIUM_PATH" --url http://127.0.0.1:4173/dist/openbumpplan.html
cp docs/browser-test-results.json docs/browser-standalone-v0.2.json
python tests/browser_origin.py --chromium "$CHROMIUM_PATH"
