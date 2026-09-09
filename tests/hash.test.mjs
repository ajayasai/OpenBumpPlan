import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { sha256Bytes } from '../src/core/hash.js';
import { seeded } from './helpers.mjs';
for(const size of [0,1,2,3,7,31,55,56,57,63,64,65,119,120,127,128,129,255,256,1024,65537,1000000])test(`portable SHA-256 equals Node/OpenSSL: ${size} bytes`,()=>{
 const rng=seeded(size+1),bytes=Uint8Array.from({length:size},()=>Math.floor(rng()*256));assert.equal(sha256Bytes(bytes),createHash('sha256').update(bytes).digest('hex'));
});
for(const text of ['abc','தமிழ் 日本語 😀','a'.repeat(1000000),'\ud800','\u0000'])test(`portable UTF-8 SHA ${text.slice(0,15)}`,()=>{
 const bytes=new TextEncoder().encode(text);assert.equal(sha256Bytes(bytes),createHash('sha256').update(bytes).digest('hex'));
});
test('fallback rejects non-byte inputs',()=>assert.throws(()=>sha256Bytes('abc')));
