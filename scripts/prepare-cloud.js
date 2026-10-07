import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { decryptState } from './cloud-session.js';

class CloudConfigurationError extends Error {}

export function prepareCloud(env = process.env, root = new URL('../', import.meta.url)) {
    const missing = ['FIREBASE_SESSION_KEY', 'GOOGLE_CREDENTIALS_JSON', 'SPREADSHEET_ID', 'SHEET_NAME', 'SLACK_WEBHOOK_URL']
        .filter(name => typeof env[name] !== 'string' || !env[name].trim());
    if (missing.length) throw new CloudConfigurationError('Missing cloud configuration: ' + missing.join(', ') + '. Check repository Actions secrets and variables.');
    const key = env.FIREBASE_SESSION_KEY.trim();
    if (!/^[A-Za-z0-9+/]{43}=$/.test(key) || Buffer.from(key, 'base64').length !== 32) {
        throw new CloudConfigurationError('FIREBASE_SESSION_KEY must be a 32-byte base64 key. Copy the contents of .runtime/cloud-session-key.txt into the Actions secret.');
    }
    let encrypted;
    try { encrypted = fs.readFileSync(new URL('cloud/auth/firebase-state.enc', root), 'utf8'); }
    catch (error) {
        if (error.code !== 'ENOENT') throw new CloudConfigurationError('Cannot read cloud/auth/firebase-state.enc. Check file permissions.');
        throw new CloudConfigurationError('Missing cloud/auth/firebase-state.enc. Run npm run login:cloud locally, then commit and push the encrypted session file.');
    }
    let state;
    try { state = decryptState(encrypted, key); }
    catch {
        throw new CloudConfigurationError('Cannot decrypt cloud/auth/firebase-state.enc. FIREBASE_SESSION_KEY must match the key used to export this file. Update the Actions secret from .runtime/cloud-session-key.txt; if the key is lost, run npm run login:cloud and push the new encrypted session.');
    }
    let credentials;
    try { credentials = JSON.parse(env.GOOGLE_CREDENTIALS_JSON); }
    catch { throw new CloudConfigurationError('GOOGLE_CREDENTIALS_JSON is not valid JSON. Set the Actions secret to the complete Google service account JSON file contents.'); }
    if (!credentials || typeof credentials.client_email !== 'string' || !credentials.client_email.trim() || typeof credentials.private_key !== 'string' || !credentials.private_key.trim()) {
        throw new CloudConfigurationError('GOOGLE_CREDENTIALS_JSON must contain client_email and private_key from a Google service account JSON file.');
    }
    const dir = new URL('credentials/', root);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(new URL('service-account.json', dir), JSON.stringify(credentials), { mode: 0o600 });
    fs.writeFileSync(new URL('firebase-state.json', dir), JSON.stringify(state), { mode: 0o600 });
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try { prepareCloud(); }
    catch (error) {
        // JSON and filesystem errors can contain secrets; only print our own messages.
        console.error('Cloud configuration failed. ' + (error instanceof CloudConfigurationError
            ? error.message : 'Could not write credentials. Check runner filesystem permissions and available disk space.'));
        process.exitCode = 1;
    }
}
