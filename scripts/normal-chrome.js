import net from 'node:net';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { chromium } from 'playwright';
import { chromeExecutable } from './manual-google-login.js';

export async function openNormalChrome(profile, startUrl = 'https://console.firebase.google.com/') {
    const port = await new Promise((resolve, reject) => {
        const server = net.createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const available = server.address().port;
            server.close(error => error ? reject(error) : resolve(available));
        });
    });
    // No automation, headless or alternate password-store flags. Use the same
    // Chrome executable/profile as the user's manual login, with loopback CDP.
    const child = spawn(chromeExecutable(), [
        '--user-data-dir=' + profile,
        '--no-first-run', '--no-default-browser-check', '--disable-background-mode',
        '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=' + port,
        startUrl
    ], { stdio: 'ignore', windowsHide: false });
    let ended = false;
    const closed = new Promise(resolve => child.once('exit', () => { ended = true; resolve(); }));
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    let browser;
    try {
        const endpoint = 'http://127.0.0.1:' + port;
        const deadline = Date.now() + 15000;
        let ready = false;
        while (Date.now() < deadline && !ended) {
            try {
                const response = await fetch(endpoint + '/json/version', { signal: AbortSignal.timeout(1000) });
                if (response.ok) { ready = true; break; }
            } catch { /* Chrome is still starting. */ }
            await delay(150);
        }
        if (!ready) throw new Error('Could not attach to app Chrome. Close all app Chrome windows and retry.');
        browser = await chromium.connectOverCDP(endpoint, { noDefaults: true, timeout: 10000 });
        const context = browser.contexts()[0];
        if (!context) throw new Error('Chrome profile was not available.');
        return { context, async close() {
            try {
                const session = await browser.newBrowserCDPSession();
                await session.send('Browser.close').catch(() => {});
            } finally {
                await browser.close().catch(() => {});
                await Promise.race([closed, delay(5000)]);
                if (!ended) { child.unref(); console.error('Close the app Chrome window before running another report.'); }
            }
        } };
    } catch (error) {
        await browser?.close().catch(() => {});
        child.unref();
        throw error;
    }
}
