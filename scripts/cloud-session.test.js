import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { encryptState, decryptState } from './cloud-session.js';
const state = { cookies: [{ name: 'session', value: 'secret-cookie', domain: '.google.com' }], origins: [{ origin: 'https://console.firebase.google.com', localStorage: [], indexedDB: [] }] };
test('encrypted cloud session round-trips cookies and IndexedDB without plaintext', () => {
    const key = randomBytes(32).toString('base64');
    const encoded = encryptState(state, key);
    assert.equal(encoded.includes('secret-cookie'), false);
    assert.deepEqual(decryptState(encoded, key), state);
    assert.notEqual(encryptState(state, key), encoded);
});
test('wrong key and modified ciphertext are rejected', () => {
    const key = randomBytes(32).toString('base64');
    const encoded = encryptState(state, key);
    assert.throws(() => decryptState(encoded, randomBytes(32).toString('base64')));
    const data = JSON.parse(encoded);
    const bytes = Buffer.from(data.ciphertext, 'base64');
    bytes[0] ^= 1;
    data.ciphertext = bytes.toString('base64');
    assert.throws(() => decryptState(JSON.stringify(data), key));
    assert.throws(() => encryptState(state, 'short'));
});
