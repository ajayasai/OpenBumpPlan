import base64
import hashlib
import io
import json
import lzma
from pathlib import Path
import sys
import tarfile
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from safe_overlay import bounded_xz, apply_overlay, MAX_OUTPUT, DECODER_MEMORY, safe_name


class DecompressionTests(unittest.TestCase):
    def test_normal_and_exact_output_limit(self):
        for data in [b'', b'hello', b'x' * 4096]:
            self.assertEqual(bounded_xz(lzma.compress(data), max_output=len(data)), data)

    def test_one_byte_above_limit(self):
        with self.assertRaisesRegex(ValueError, 'output budget'):
            bounded_xz(lzma.compress(b'x' * 4097), max_output=4096)

    def test_compression_bomb_rejected_at_small_output_limit(self):
        # Fixture construction is bounded; actual decoder is permitted only 1025 output bytes.
        payload = lzma.compress(b'x' * 2_000_000)
        self.assertLess(len(payload), 500_000)
        with self.assertRaisesRegex(ValueError, 'output budget'):
            bounded_xz(payload, max_output=1024)

    def test_decoder_receives_the_limit_before_expanding(self):
        with patch('safe_overlay.lzma.LZMADecompressor') as factory:
            factory.return_value.decompress.return_value = b'x' * 1025
            with self.assertRaisesRegex(ValueError, 'output budget'):
                bounded_xz(b'compressed', max_output=1024)
            factory.assert_called_once_with(format=lzma.FORMAT_XZ, memlimit=DECODER_MEMORY)
            factory.return_value.decompress.assert_called_once_with(b'compressed', max_length=1025)

    def test_full_ten_megabyte_budget_is_enforced(self):
        compressor = lzma.LZMACompressor()
        payload = b''.join(compressor.compress(b'x' * 100_001) for _ in range(100)) + compressor.flush()
        with self.assertRaisesRegex(ValueError, 'output budget'):
            bounded_xz(payload)

    def test_truncated_stream(self):
        with self.assertRaisesRegex(ValueError, 'Truncated'):
            bounded_xz(lzma.compress(b'hello')[:-1])

    def test_trailing_and_concatenated_streams(self):
        for extra in [b'bad', b'\0', lzma.compress(b'another')]:
            with self.subTest(extra=extra), self.assertRaisesRegex(ValueError, 'Trailing'):
                bounded_xz(lzma.compress(b'hello') + extra)

    def test_corruption(self):
        with self.assertRaises((lzma.LZMAError, ValueError)):
            bounded_xz(b'not xz')

    def test_input_limit_precedes_decoder(self):
        with patch('safe_overlay.lzma.LZMADecompressor') as decoder:
            with self.assertRaisesRegex(ValueError, 'input budget'):
                bounded_xz(b'x' * 500001)
            decoder.assert_not_called()

    def test_decoder_memory_is_bounded(self):
        with self.assertRaises(lzma.LZMAError):
            bounded_xz(lzma.compress(b'hello'), memlimit=1)

    def test_invalid_output_limit(self):
        for limit in [-1, MAX_OUTPUT + 1, float('inf'), True]:
            with self.subTest(limit=limit), self.assertRaises(ValueError):
                bounded_xz(lzma.compress(b'x'), max_output=limit)


class OverlayTests(unittest.TestCase):
    def build(self, root, entries):
        stream = io.BytesIO()
        with tarfile.open(fileobj=stream, mode='w') as archive:
            for name, data, kind in entries:
                info = tarfile.TarInfo(name); info.type = kind; info.size = len(data)
                if kind == tarfile.SYMTYPE: info.linkname = '/tmp/escape'; info.size = 0
                archive.addfile(info, io.BytesIO(data) if info.isfile() else None)
        payload = lzma.compress(stream.getvalue())
        pub = root / '.publication'; pub.mkdir(exist_ok=True)
        (pub / 'part-001.b64').write_text(base64.b64encode(payload).decode())
        manifest = pub / 'ready.json'
        manifest.write_text(json.dumps({'parts':1, 'archive_sha256':hashlib.sha256(payload).hexdigest(),
                                        'members':[e[0] for e in entries]}))
        return manifest

    def test_valid_overlay(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp); m = self.build(root, [('src/a.js', b'good', tarfile.REGTYPE)])
            self.assertEqual(apply_overlay(root,m),1); self.assertEqual((root/'src/a.js').read_bytes(),b'good')

    def test_unsafe_names(self):
        for name in ['../bad','/bad','./bad','x/../bad','x//bad','x/./bad','.git/config','.github/workflows/bad',
                     '.publication/ready.json','.env','dir/.env.local','secret.key','node_modules/x',r'x\bad']:
            with self.subTest(name=name), self.assertRaises(ValueError): safe_name(name)

    def test_symlinks_rejected_before_any_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp); m=self.build(root,[('src/good.js',b'good',tarfile.REGTYPE),('src/bad',b'',tarfile.SYMTYPE)])
            with self.assertRaises(ValueError): apply_overlay(root,m)
            self.assertFalse((root/'src/good.js').exists())

    def test_destination_symlink(self):
        with tempfile.TemporaryDirectory() as tmp, tempfile.TemporaryDirectory() as outside:
            root=Path(tmp); m=self.build(root,[('src/a',b'bad',tarfile.REGTYPE)]);(root/'src').symlink_to(outside)
            with self.assertRaisesRegex(ValueError,'symlink'): apply_overlay(root,m)
            self.assertFalse((Path(outside)/'a').exists())

    def test_file_directory_conflict(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.build(root,[('x',b'one',tarfile.REGTYPE),('x/y',b'two',tarfile.REGTYPE)])
            with self.assertRaisesRegex(ValueError,'prefix conflict'):apply_overlay(root,m)
            self.assertFalse((root/'x').exists())

    def test_existing_incompatible_destination(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.build(root,[('x/a',b'one',tarfile.REGTYPE)]);(root/'x').write_text('file')
            with self.assertRaisesRegex(ValueError,'Incompatible'):apply_overlay(root,m)

    def test_duplicate_members(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.build(root,[('x',b'one',tarfile.REGTYPE),('x',b'two',tarfile.REGTYPE)])
            with self.assertRaisesRegex(ValueError,'member set'):apply_overlay(root,m)

    def test_checksum_mismatch(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.build(root,[('x',b'one',tarfile.REGTYPE)]);data=json.loads(m.read_text());data['archive_sha256']='0'*64;m.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'checksum'):apply_overlay(root,m)

    def test_wrong_chunk_count(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.build(root,[('x',b'one',tarfile.REGTYPE)]);data=json.loads(m.read_text());data['parts']=2;m.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'chunk count'):apply_overlay(root,m)

    def test_manifest_missing_member(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);m=self.build(root,[('x',b'one',tarfile.REGTYPE)]);data=json.loads(m.read_text());data['members']=['y'];m.write_text(json.dumps(data))
            with self.assertRaisesRegex(ValueError,'member set'):apply_overlay(root,m)

if __name__ == '__main__': unittest.main()
