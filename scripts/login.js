import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { manualGoogleLogin } from './manual-google-login.js';
await manualGoogleLogin(fileURLToPath(new URL('../browser-profile/', import.meta.url)));
const runtime = new URL('../.runtime/', import.meta.url);
fs.mkdirSync(runtime, { recursive: true });
fs.writeFileSync(new URL('firebase-login-ready', runtime), new Date().toISOString());
console.log('Manual login completed. The report app can now use the saved Chrome profile.');
