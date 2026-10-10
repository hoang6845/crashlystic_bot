import fs from 'node:fs';
import { decryptState } from './cloud-session.js';

try {
    const target = process.argv[2] || new URL('../cloud/auth/firebase-state.enc', import.meta.url);
    const key = process.env.FIREBASE_SESSION_KEY || fs.readFileSync(new URL('../.runtime/cloud-session-key.txt', import.meta.url), 'utf8').trim();
    const state = decryptState(fs.readFileSync(target, 'utf8'), key.trim());
    const now = Date.now() / 1000;
    const cookies = state.cookies.filter(cookie => /(^|\.)google\.com$/.test(cookie.domain) || /(^|\.)firebase\.google\.com$/.test(cookie.domain));
    console.log('Checked at: ' + new Date().toISOString());
    console.table(cookies.map(cookie => ({
        name: cookie.name,
        domain: cookie.domain,
        status: cookie.expires === -1 ? 'SESSION (no fixed expiry)' : cookie.expires <= now ? 'EXPIRED' : 'NOT EXPIRED',
        expires: cookie.expires === -1 ? '-' : new Date(cookie.expires * 1000).toISOString()
    })));
    console.log('Cookie values and encryption key are omitted. Cookie expiry does not prove Google still accepts this session.');
} catch {
    console.error('Cannot check session. Verify the encrypted file path and its matching FIREBASE_SESSION_KEY or .runtime/cloud-session-key.txt.');
    process.exitCode = 1;
}
