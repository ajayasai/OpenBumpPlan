#!/usr/bin/env python3
"""Apply a checksummed, bounded XZ/tar source overlay; no network or credentials.

The checksum is transport integrity, not publisher authentication. Review the
branch and its executable source before running its workflows. Decoder memory
and output are capped *before* the full uncompressed archive can be materialized.
"""
import argparse
import base64
import hashlib
import io
import json
import lzma
from pathlib import Path, PurePosixPath
import re
import tarfile

MAX_INPUT = 500_000
MAX_OUTPUT = 10_000_000
DECODER_MEMORY = 96 * 1024 * 1024
MAX_FILES = 500


def bounded_xz(payload: bytes, *, max_output: int = MAX_OUTPUT,
               max_input: int = MAX_INPUT, memlimit: int = DECODER_MEMORY) -> bytes:
    if not isinstance(payload, bytes) or len(payload) > max_input:
        raise ValueError('Compressed source archive exceeds input budget')
    if type(max_output) is not int or not 0 <= max_output <= MAX_OUTPUT:
        raise ValueError('Invalid output budget')
    decoder = lzma.LZMADecompressor(format=lzma.FORMAT_XZ, memlimit=memlimit)
    # One bounded call. At most one byte beyond the budget is materialized,
    # independently of a compressed stream's claimed or actual expanded size.
    output = decoder.decompress(payload, max_length=max_output + 1)
    if len(output) > max_output:
        raise ValueError('Source archive exceeds output budget')
    if not decoder.eof:
        raise ValueError('Truncated or incomplete source archive')
    if decoder.unused_data:
        raise ValueError('Trailing data or concatenated archives are not accepted')
    return output


def safe_name(name: str) -> PurePosixPath:
    if not isinstance(name, str) or not re.fullmatch(r'[A-Za-z0-9_./-]+', name):
        raise ValueError('Unsafe archive member name')
    p = PurePosixPath(name)
    if (not p.parts or p.is_absolute() or str(p) != name or
            any(part in ('.', '..') for part in p.parts) or
            p.parts[0] in ('.git', '.github', '.publication', 'node_modules') or
            any(part == '.env' or part.startswith('.env.') for part in p.parts) or
            p.suffix.lower() in ('.pem', '.key')):
        raise ValueError('Unsafe archive member: ' + name)
    return p


def apply_overlay(root: Path, manifest_path: Path) -> int:
    root = root.resolve()
    manifest_path = manifest_path.resolve()
    if manifest_path.stat().st_size > 256_000:
        raise ValueError('Manifest exceeds budget')
    manifest = json.loads(manifest_path.read_text())
    parts = sorted(manifest_path.parent.glob('part-*.b64'))
    count = manifest.get('parts')
    if type(count) is not int or not 1 <= count <= 30 or len(parts) != count:
        raise ValueError('Transfer chunk count mismatch')
    if any(p.is_symlink() or not p.is_file() for p in parts):
        raise ValueError('Non-regular transfer chunk')
    if sum(p.stat().st_size for p in parts) > 4 * ((MAX_INPUT + 2) // 3) + 60:
        raise ValueError('Encoded archive exceeds input budget')
    payload = base64.b64decode(''.join(p.read_text().strip() for p in parts), validate=True)
    if len(payload) > MAX_INPUT or hashlib.sha256(payload).hexdigest() != manifest.get('archive_sha256'):
        raise ValueError('Source archive checksum mismatch or input budget exceeded')
    expected = manifest.get('members')
    if (not isinstance(expected, list) or not 1 <= len(expected) <= MAX_FILES or
            any(not isinstance(name, str) for name in expected) or
            len(set(expected)) != len(expected)):
        raise ValueError('Invalid manifest member set')
    names = set(expected)
    for name in expected:
        p = safe_name(name)
        if any(str(parent) in names for parent in p.parents):
            raise ValueError('Archive file/directory prefix conflict')
    unpacked = bounded_xz(payload)
    with tarfile.open(fileobj=io.BytesIO(unpacked), mode='r:') as archive:
        members = archive.getmembers()
        if len(members) != len(expected) or {m.name for m in members} != names:
            raise ValueError('Archive member set mismatch')
        # Validate every member and every destination before writing any file.
        for member in members:
            p = safe_name(member.name)
            if not member.isfile() or member.size < 0 or member.size > 5_000_000 or member.sparse:
                raise ValueError('Unsafe archive member type or size: ' + member.name)
            cursor = root
            for index, part in enumerate(p.parts):
                cursor = cursor / part
                if cursor.is_symlink():
                    raise ValueError('Destination symlink rejected: ' + str(cursor))
                if cursor.exists() and (not cursor.is_file() if index == len(p.parts)-1 else not cursor.is_dir()):
                    raise ValueError('Incompatible existing destination: ' + str(cursor))
        for member in members:
            data = archive.extractfile(member).read(member.size + 1)
            if len(data) != member.size:
                raise ValueError('Truncated archive member: ' + member.name)
            target = root / member.name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(data)
    return len(members)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path, default=Path('.'))
    parser.add_argument('--manifest', type=Path, default=Path('.publication/ready.json'))
    args = parser.parse_args()
    print(f'Applied {apply_overlay(args.root, args.manifest)} bounded, SHA-256 checked source files')


if __name__ == '__main__':
    main()
