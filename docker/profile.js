import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { decryptState, encryptState } from '../scripts/cloud-session.js';

export async function openDockerProfile(env = process.env, browserType = chromium) {
    const dir = env.DOCKER_DATA_DIR || '/data';
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const marker = path.join(dir, 'seed.sha256');
    const encrypted = env.FIREBASE_SESSION_ENCRYPTED;
    const fingerprint = encrypted ? createHash('sha256').update(encrypted).digest('hex') : null;
    const previous = fs.existsSync(marker) ? fs.readFileSync(marker, 'utf8') : null;
    if (!previous && !encrypted) throw new Error('First run needs FIREBASE_SESSION_ENCRYPTED and FIREBASE_SESSION_KEY. Export a valid session with npm run login:cloud.');
    let seed;
    const latest = path.join(dir, 'latest-session.enc');
    const profile = path.join(dir, 'browser-profile');
    // Preserve cookies Chromium may update during shutdown after the snapshot.
    const hasProfileCookies = ['Default/Cookies', 'Default/Network/Cookies']
        .some(relative => fs.existsSync(path.join(profile, relative)));
    if (fingerprint && fingerprint !== previous) {
        try { seed = decryptState(encrypted, env.FIREBASE_SESSION_KEY); }
        catch { throw new Error('Cannot decrypt the supplied session. Check FIREBASE_SESSION_KEY and FIREBASE_SESSION_ENCRYPTED.'); }
    }
    if (!seed && !hasProfileCookies && fs.existsSync(latest)) {
        try { seed = decryptState(fs.readFileSync(latest, 'utf8'), env.FIREBASE_SESSION_KEY); }
        catch { throw new Error('Cannot restore the updated volume session. Supply the original key or export a new seed session.'); }
    }
    const context = await browserType.launchPersistentContext(profile, {
        headless: true,
        args: ['--disable-dev-shm-usage']
    });
    try {
        if (seed) await context.setStorageState(seed);
    } catch {
        await context.close();
        throw new Error('Could not restore the login state into the Docker profile.');
    }
    return {
        context,
        async validated() {
            // Only called after every configured app yielded both metrics.
            if (env.FIREBASE_SESSION_KEY) {
                const state = await context.storageState({ indexedDB: true });
                const target = path.join(dir, 'latest-session.enc');
                fs.writeFileSync(target + '.tmp', encryptState(state, env.FIREBASE_SESSION_KEY), { mode: 0o600 });
                fs.renameSync(target + '.tmp', target);
            }
            if (fingerprint) {
                fs.writeFileSync(marker + '.tmp', fingerprint, { mode: 0o600 });
                fs.renameSync(marker + '.tmp', marker);
            }
            console.log('Validated login saved; next run reuses the volume profile.');
        }
    };
}
