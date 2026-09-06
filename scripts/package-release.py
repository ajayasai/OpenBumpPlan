#!/usr/bin/env python3
"""Prepare an explicit file manifest, or package and re-test its exact source bytes.

--prepare is a maintainer operation that creates a NEW integrity record; it does
not authenticate existing evidence. Normal packaging never changes a manifest.
No network, third-party Python package or publishing credential is used.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOP = ['.dockerignore', '.gitignore', 'CHANGELOG.md', 'CONTRIBUTING.md',
       'Dockerfile', 'index.html', 'LICENSE', 'README.md', 'SECURITY.md', 'package.json']
DIRECTORIES = ['src', 'scripts', 'tests', 'examples', 'docs', 'dist']
BASE = '7e87673bd63b601045c1d5a50e5448051ec759ef'


def run(arguments, cwd=ROOT):
    subprocess.run(arguments, cwd=cwd, check=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--prepare', action='store_true', help='Explicitly generate a new manifest from current files, then verify it.')
    parser.add_argument('--output', type=Path, help='New ZIP path outside the repository; must not already exist.')
    args = parser.parse_args()
    if args.prepare == bool(args.output):
        parser.error('Choose exactly one of --prepare or --output.')
    version = json.loads((ROOT / 'package.json').read_text())['version']
    if not re.fullmatch(r'\d+\.\d+\.\d+', version):
        raise ValueError('Invalid release version.')
    manifest_path = f'docs/release-manifest-v{version}.json'
    if args.prepare:
        run(['node', 'scripts/build.mjs'])
        names = set(TOP)
        for directory in DIRECTORIES:
            for p in (ROOT / directory).rglob('*'):
                if '__pycache__' in p.parts:
                    continue
                if p.is_symlink():
                    raise ValueError(f'Symlink rejected: {p}')
                if p.is_file():
                    names.add(p.relative_to(ROOT).as_posix())
        names.discard(manifest_path)  # A file cannot include its own digest.
        files = []
        for name in sorted(names):
            p = ROOT / name
            if p.is_symlink() or not p.is_file():
                raise ValueError(f'Non-regular release file: {name}')
            content = p.read_bytes()
            files.append({'path':name, 'bytes':len(content), 'sha256':hashlib.sha256(content).hexdigest()})
        manifest = {'version':version, 'repository':'ajayasai/OpenBumpPlan', 'baseCommit':BASE,
                    'scope':'Exact runtime, source, test, example and retained-document bytes; excludes Git metadata, bootstrap workflows and this self-manifest. Integrity only, not publisher authentication.',
                    'files':files}
        (ROOT / manifest_path).write_text(json.dumps(manifest, indent=2)+'\n')
        run(['node', 'scripts/publish-update.mjs', '--verify-only'])
        return
    output = args.output.resolve()
    if output == ROOT or ROOT in output.parents or output.exists():
        raise ValueError('Output must be a new path outside the repository.')
    run(['node', 'scripts/publish-update.mjs', '--verify-only'])
    manifest = json.loads((ROOT / manifest_path).read_text())
    paths = [f['path'] for f in manifest['files']] + [manifest_path]
    prefix = f'OpenBumpPlan-{version}'
    output.parent.mkdir(parents=True, exist_ok=True)
    # Do not expose an output labelled as a release until the actual package passes.
    with tempfile.TemporaryDirectory(prefix='.openbumpplan-staging-', dir=output.parent) as stage:
        candidate = Path(stage) / 'candidate.zip'
        # Fixed timestamps and ordering make identical inputs produce identical ZIP bytes.
        with zipfile.ZipFile(candidate, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name in sorted(paths):
                info = zipfile.ZipInfo(f'{prefix}/{name}', date_time=(1980,1,1,0,0,0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, (ROOT / name).read_bytes(), compresslevel=9)
        # Rebuild and test exported bytes, not just the working directory.
        checkout_root = Path(stage) / 'checkout'
        with zipfile.ZipFile(candidate) as archive:
            for item in archive.infolist():
                if not item.filename.startswith(prefix+'/') or '..' in Path(item.filename).parts:
                    raise ValueError('Unsafe package member.')
            archive.extractall(checkout_root)
        checkout = checkout_root / prefix
        run(['node', 'scripts/build.mjs'], cwd=checkout)
        run(['node', 'scripts/publish-update.mjs', '--verify-only'], cwd=checkout)
        run(['npm', 'test'], cwd=checkout)
        # Atomic, exclusive publication of the already validated ZIP on this filesystem.
        os.link(candidate, output)
    print(json.dumps({'package':str(output), 'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),
                      'files':len(paths), 'cleanRebuildAndTestsPassed':True}, indent=2))



if __name__ == '__main__':
    main()
