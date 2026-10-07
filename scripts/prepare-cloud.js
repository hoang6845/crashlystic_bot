import fs from 'node:fs';
import { decryptState } from './cloud-session.js';
export function prepareCloud(env = process.env) {
    for (const name of ['FIREBASE_SESSION_KEY', 'GOOGLE_CREDENTIALS_JSON', 'SPREADSHEET_ID', 'SHEET_NAME', 'SLACK_WEBHOOK_URL']) {
        if (!env[name]) throw new Error('Missing cloud configuration: ' + name);
    }
    const state = decryptState(fs.readFileSync(new URL('../cloud/auth/firebase-state.enc', import.meta.url), 'utf8'), env.FIREBASE_SESSION_KEY);
    const credentials = JSON.parse(env.GOOGLE_CREDENTIALS_JSON);
    if (!credentials.client_email || !credentials.private_key) throw new Error('Invalid Google service account JSON.');
    const dir = new URL('../credentials/', import.meta.url);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(new URL('service-account.json', dir), JSON.stringify(credentials), { mode: 0o600 });
    fs.writeFileSync(new URL('firebase-state.json', dir), JSON.stringify(state), { mode: 0o600 });
}
try { prepareCloud(); }
catch { console.error('Cloud configuration failed. Check secrets and re-export the Firebase session.'); process.exitCode = 1; }
