import fs from 'node:fs';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { manualGoogleLogin } from './manual-google-login.js';
import { openNormalChrome } from './normal-chrome.js';
import { encryptState } from './cloud-session.js';

async function main() {
    const profile = fileURLToPath(new URL('../browser-profile/', import.meta.url));
    const runtime = new URL('../.runtime/', import.meta.url);
    const target = new URL('../cloud/auth/firebase-state.enc', import.meta.url);
    const keyPath = new URL('cloud-session-key.txt', runtime);
    fs.mkdirSync(runtime, { recursive: true });
    fs.mkdirSync(new URL('../cloud/auth/', import.meta.url), { recursive: true });
    // Manual login has no Playwright or remote debugging attached.
    await manualGoogleLogin(profile);
    console.log('Reopening the same normal Chrome profile to export the saved session. Do not close this second window; the script will close it.');
    const chrome = await openNormalChrome(profile);
    try {
        const page = await chrome.context.newPage();
        await page.goto('https://console.firebase.google.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(2000);
        if (new URL(page.url()).hostname === 'accounts.google.com') {
            throw new Error('Chrome still needs Google sign-in. Run npm run login:cloud again and verify Crashlytics metrics in the FIRST app Chrome window before closing it.');
        }
        const state = await chrome.context.storageState({ indexedDB: true });
        if (!state.cookies.some(cookie => /(^|\.)google\.com$/.test(cookie.domain))) throw new Error('No Google login cookies found. Complete sign-in in the first app Chrome window.');
        const key = fs.existsSync(keyPath) ? fs.readFileSync(keyPath, 'utf8').trim() : randomBytes(32).toString('base64');
        fs.writeFileSync(keyPath, key, { mode: 0o600 });
        fs.writeFileSync(target, encryptState(state, key));
        console.log('Encrypted session saved: cloud/auth/firebase-state.enc');
        console.log('Copy the contents of .runtime/cloud-session-key.txt into GitHub secret FIREBASE_SESSION_KEY. Never commit this key.');
    } finally { await chrome.close(); }
}
main().catch(error => { console.error('Cloud session export failed: ' + error.message); process.exitCode = 1; });
