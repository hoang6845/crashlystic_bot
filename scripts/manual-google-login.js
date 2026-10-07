import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

export function chromeExecutable() {
    const candidates = [process.env.CHROME_EXECUTABLE_PATH];
    if (process.platform === 'win32') {
        for (const base of [process.env.PROGRAMFILES, process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA]) {
            if (base) candidates.push(path.join(base, 'Google', 'Chrome', 'Application', 'chrome.exe'));
        }
    } else {
        candidates.push('/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
    }
    const executable = candidates.find(candidate => candidate && fs.existsSync(candidate));
    if (!executable) throw new Error('Google Chrome was not found. Install Chrome or set CHROME_EXECUTABLE_PATH.');
    return executable;
}
export async function manualGoogleLogin(profile) {
    console.log('Stop the report app and close any Chrome window using this app profile before continuing.');
    const child = spawn(chromeExecutable(), [
        '--user-data-dir=' + profile,
        '--no-first-run', '--no-default-browser-check', '--disable-background-mode',
        'https://console.firebase.google.com/'
    ], { stdio: 'ignore', windowsHide: false });
    let exitCode;
    let exited = false;
    const closed = new Promise(resolve => child.once('exit', code => { exitCode = code; exited = true; resolve(); }));
    await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
    const input = createInterface({ input: process.stdin, output: process.stdout });
    try {
        await input.question('Sign in in normal Chrome, open the target Crashlytics page and verify the metrics. Then CLOSE ALL windows of this app Chrome and press Enter here. ');
    } finally { input.close(); }
    if (!exited) {
        let timer;
        try {
            await Promise.race([closed, new Promise((_, reject) => {
                timer = setTimeout(() => reject(new Error('Chrome is still running. Close all app Chrome windows, then rerun this command.')), 10000);
            })]);
        } finally { clearTimeout(timer); }
    }
    if (exitCode !== 0) throw new Error('Chrome exited unexpectedly. Retry the manual login.');
}
