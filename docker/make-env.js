import fs from 'node:fs';
import dotenv from 'dotenv';
const root = new URL('../', import.meta.url);
const target = new URL('report.env', import.meta.url);
if (fs.existsSync(target) && !process.argv.includes('--force')) {
    throw new Error('docker/report.env already exists. Keep it, or use --force to rebuild it from local configuration.');
}
const envPath = new URL('.env', root);
const env = { ...(fs.existsSync(envPath) ? dotenv.parse(fs.readFileSync(envPath)) : {}), ...process.env };
function read(relative, message) {
    try { return fs.readFileSync(new URL(relative, root), 'utf8').trim(); }
    catch { throw new Error(message); }
}
const encrypted = read('cloud/auth/firebase-state.enc', 'Missing encrypted session. Run npm run login:cloud first.');
const key = read('.runtime/cloud-session-key.txt', 'Missing local session key. Use the key matching the encrypted session.');
const credentials = JSON.parse(read('credentials/service-account.json', 'Missing credentials/service-account.json.'));
const values = {
    DOCKER_REPORT_MODE: 'check',
    SPREADSHEET_ID: env.SPREADSHEET_ID || '',
    SHEET_NAME: env.SHEET_NAME || 'crashlystic',
    SLACK_WEBHOOK_URL: env.SLACK_WEBHOOK_URL || '',
    GOOGLE_CREDENTIALS_JSON: JSON.stringify(credentials),
    FIREBASE_SESSION_ENCRYPTED: JSON.stringify(JSON.parse(encrypted)),
    FIREBASE_SESSION_KEY: key
};
for (const name of ['TRACKING_SPREADSHEET_ID', 'TRACKING_SHEET_ID']) if (env[name]) values[name] = env[name];
const content = Object.entries(values).map(([name, value]) => {
    if (/[\r\n]/.test(value)) throw new Error('Multiline value not supported: ' + name);
    return name + '=' + value;
}).join('\n') + '\n';
fs.writeFileSync(target, content, { mode: 0o600 });
console.log('Created docker/report.env in check mode. Values were not printed. Do not commit this file.');
