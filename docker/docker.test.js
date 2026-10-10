import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { dockerReportSource, prepareDocker } from './run.js';
import { openDockerProfile } from './profile.js';
import { encryptState, decryptState } from '../scripts/cloud-session.js';

test('reuses updated persistent profile, reseeds only for a newly supplied session', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-profile-'));
    t.after(() => fs.rmSync(dir, {recursive:true, force:true}));
    const key = randomBytes(32).toString('base64');
    const state = {cookies:[],origins:[]};
    const refreshed = {cookies:[{name:'updated',value:'test'}],origins:[]};
    let restored = 0;
    const context = {async setStorageState(s) { assert.ok(s === state || JSON.stringify(s) === JSON.stringify(state) || JSON.stringify(s) === JSON.stringify(refreshed)); restored++; }, async storageState(){return refreshed;},async close(){}};
    const browser = {async launchPersistentContext(p){ assert.equal(p,path.join(dir,'browser-profile')); return context; }};
    const env = {DOCKER_DATA_DIR:dir,FIREBASE_SESSION_KEY:key,FIREBASE_SESSION_ENCRYPTED:encryptState(state,key)};
    const first = await openDockerProfile(env,browser);
    assert.equal(restored,1);
    assert.equal(fs.existsSync(path.join(dir,'seed.sha256')),false);
    await first.validated();
    assert.deepEqual(decryptState(fs.readFileSync(path.join(dir,'latest-session.enc'),'utf8'),key),refreshed);
    const cookies = path.join(dir, 'browser-profile', 'Default', 'Network', 'Cookies');
    fs.mkdirSync(path.dirname(cookies), {recursive:true});
    fs.writeFileSync(cookies, 'newer browser cookies');
    await openDockerProfile(env,browser);
    assert.equal(restored,1);
    assert.equal(fs.readFileSync(cookies, 'utf8'), 'newer browser cookies');
    // Missing cookie database recovers from the encrypted backup.
    fs.rmSync(cookies);
    await openDockerProfile(env,browser);
    assert.equal(restored,2);
    fs.writeFileSync(path.join(dir, 'browser-profile', 'Default', 'Cookies'), 'legacy cookies');
    await openDockerProfile(env,browser);
    assert.equal(restored,2);
    env.FIREBASE_SESSION_ENCRYPTED = encryptState(state,key);
    await openDockerProfile(env,browser);
    assert.equal(restored,3);
});

test('bad seed cannot launch browser or expose supplied secrets', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(),'docker-bad-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    await assert.rejects(openDockerProfile({DOCKER_DATA_DIR:dir,FIREBASE_SESSION_ENCRYPTED:'secret-invalid',FIREBASE_SESSION_KEY:'secret-key'}, {
        launchPersistentContext(){throw new Error('must not launch');}
    }), /Cannot decrypt/);
});

test('restores missing session cookies after restart without replacing refreshed profile cookies', async t => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'docker-session-'));
    t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
    const key = randomBytes(32).toString('base64');
    const env = { DOCKER_DATA_DIR: dir, FIREBASE_SESSION_KEY: key };
    const cookie = { name: 'session', value: 'saved', domain: '.example.com', path: '/', expires: -1, httpOnly: true, secure: true, sameSite: 'Lax' };
    fs.writeFileSync(path.join(dir, 'seed.sha256'), 'existing-seed');
    const db = path.join(dir, 'browser-profile', 'Default', 'Network', 'Cookies');
    fs.mkdirSync(path.dirname(db), { recursive: true });
    fs.writeFileSync(db, 'persistent database still exists');
    fs.writeFileSync(path.join(dir, 'latest-session.enc'), encryptState({ cookies: [cookie, { ...cookie, name: 'persistent', expires: 2000000000 }], origins: [] }, key));
    let current = [];
    const added = [];
    const browser = { async launchPersistentContext() { return {
        async setStorageState() { assert.fail('must preserve existing profile'); },
        async cookies() { return current; },
        async addCookies(cookies) { added.push(...cookies); },
        async close() {}
    }; } };
    await openDockerProfile(env, browser);
    assert.deepEqual(added, [cookie]);
    added.length = 0;
    current = [{ ...cookie, value: 'refreshed' }];
    await openDockerProfile(env, browser);
    assert.deepEqual(added, []);
    assert.equal(current[0].value, 'refreshed');
    current = [{ ...cookie, path: '/other' }];
    await openDockerProfile(env, browser);
    assert.deepEqual(added, [cookie]);
});

test('Docker keeps app list, retries, output functions, and checks intact', () => {
    const source=fs.readFileSync(new URL('../run-report.js',import.meta.url),'utf8');
    const result=dockerReportSource(source);
    assert.ok(result.includes(source.slice(source.indexOf('async function sendSlackNotification'))));
    assert.ok(result.includes(source.slice(source.indexOf('const APPS ='),source.indexOf('async function main()'))));
    assert.ok(result.includes('const MAX_RETRIES = 2;'));
    assert.ok(result.indexOf("process.env.DOCKER_REPORT_MODE === 'check'") < result.indexOf('const keyFilePath'));
    assert.ok(result.includes('if (results.length === APPS.length) await dockerProfile.validated();'));
    assert.throws(()=>dockerReportSource('unexpected source'),/setup changed/);
});

test('report validates configuration before producing executable report', t => {
    const dir=fs.mkdtempSync(path.join(os.tmpdir(),'docker-prep-'));
    t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));
    const root=pathToFileURL(dir+path.sep);
    assert.throws(()=>prepareDocker({DOCKER_REPORT_MODE:'report'},root),/SPREADSHEET_ID/);
    assert.throws(()=>prepareDocker({DOCKER_REPORT_MODE:'invalid'},root),/check or report/);
});
