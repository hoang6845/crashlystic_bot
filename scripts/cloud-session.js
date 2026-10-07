import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

function keyBytes(key) {
    const bytes = Buffer.from(key || '', 'base64');
    if (bytes.length !== 32) throw new Error('FIREBASE_SESSION_KEY must be a 32-byte base64 key.');
    return bytes;
}
export function encryptState(state, key) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', keyBytes(key), iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(state), 'utf8'), cipher.final()]);
    return JSON.stringify({ version: 1, iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') });
}
export function decryptState(encrypted, key) {
    const payload = JSON.parse(encrypted);
    if (payload.version !== 1) throw new Error('Unsupported session format.');
    const decipher = createDecipheriv('aes-256-gcm', keyBytes(key), Buffer.from(payload.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(payload.tag, 'base64'));
    const state = JSON.parse(Buffer.concat([decipher.update(Buffer.from(payload.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
    if (!Array.isArray(state.cookies) || !Array.isArray(state.origins)) throw new Error('Invalid browser storage state.');
    return state;
}
