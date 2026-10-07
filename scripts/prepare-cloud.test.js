import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { encryptState } from './cloud-session.js';
import { prepareCloud } from './prepare-cloud.js';

function fixture(t) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'prepare-cloud-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const root = pathToFileURL(dir + path.sep);
    const state = { cookies: [], origins: [] };
    const env = {
        FIREBASE_SESSION_KEY: randomBytes(32).toString('base64'),
        GOOGLE_CREDENTIALS_JSON: JSON.stringify({ client_email: 'test@example.com', private_key: 'secret-test-key' }),
        SPREADSHEET_ID: 'test-sheet', SHEET_NAME: 'test-tab', SLACK_WEBHOOK_URL: 'test-webhook',
    };
    fs.mkdirSync(new URL('cloud/auth/', root), { recursive: true });
    fs.writeFileSync(new URL('cloud/auth/firebase-state.enc', root), encryptState(state, env.FIREBASE_SESSION_KEY));
    return { root, state, env };
}

test('restores credentials and session with whitespace around the key', t => {
    const { root, state, env } = fixture(t);
    env.FIREBASE_SESSION_KEY = '\n' + env.FIREBASE_SESSION_KEY + '\r\n';
    prepareCloud(env, root);
    assert.deepEqual(JSON.parse(fs.readFileSync(new URL('credentials/firebase-state.json', root))), state);
    assert.deepEqual(JSON.parse(fs.readFileSync(new URL('credentials/service-account.json', root))), JSON.parse(env.GOOGLE_CREDENTIALS_JSON));
});

test('reports all missing configuration names before writing credentials', t => {
    const { root, env } = fixture(t);
    env.FIREBASE_SESSION_KEY = '';
    env.SPREADSHEET_ID = '   ';
    assert.throws(() => prepareCloud(env, root), /Missing cloud configuration: FIREBASE_SESSION_KEY, SPREADSHEET_ID/);
    assert.equal(fs.existsSync(new URL('credentials/', root)), false);
});

test('distinguishes malformed keys, missing files, and mismatched keys', t => {
    const { root, env } = fixture(t);
    assert.throws(() => prepareCloud({ ...env, FIREBASE_SESSION_KEY: 'bad-key' }, root), /32-byte base64 key/);
    assert.throws(() => prepareCloud({ ...env, FIREBASE_SESSION_KEY: randomBytes(32).toString('base64') }, root), /Cannot decrypt.*must match/);
    fs.rmSync(new URL('cloud/auth/firebase-state.enc', root));
    assert.throws(() => prepareCloud(env, root), /Missing cloud\/auth\/firebase-state.enc/);
});

test('rejects malformed credentials without including their contents', t => {
    const { root, env } = fixture(t);
    for (const value of ['secret-invalid-json', 'null', '{}', '{"client_email":1,"private_key":true}']) {
        assert.throws(() => prepareCloud({ ...env, GOOGLE_CREDENTIALS_JSON: value }, root), error => {
            assert.match(error.message, /GOOGLE_CREDENTIALS_JSON/);
            assert.equal(error.message.includes(value), false);
            return true;
        });
    }
    assert.equal(fs.existsSync(new URL('credentials/', root)), false);
});

test('CLI exits with a safe actionable diagnostic', () => {
    const result = spawnSync(process.execPath, ['scripts/prepare-cloud.js'], {
        env: { ...process.env, FIREBASE_SESSION_KEY: '', GOOGLE_CREDENTIALS_JSON: 'secret-invalid-json' }, encoding: 'utf8',
    });
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Cloud configuration failed\. Missing cloud configuration: FIREBASE_SESSION_KEY/);
    assert.equal(result.stderr.includes('secret-invalid-json'), false);
});
