import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { SocketModeClient } from '@slack/socket-mode';
import { scheduledDay } from './scripts/report-clock.js';
import { createCommandHandler } from './scripts/slack-command.js';
const root = path.dirname(fileURLToPath(import.meta.url));
const runtime = path.join(root, '.runtime');
fs.mkdirSync(runtime, { recursive: true });
const statePath = path.join(runtime, 'daily.json');
const logPath = path.join(root, 'run-report.log');
const log = message => fs.appendFileSync(logPath, new Date().toISOString() + ' ' + message + '\n');
const readEnv = () => ({ ...process.env, ...dotenv.parse(fs.readFileSync(path.join(root, '.env'))) });
let busy = false;
function reserve(env = readEnv()) {
    if (busy) return null;
    if (!env.SPREADSHEET_ID || !env.SHEET_NAME || !env.SLACK_WEBHOOK_URL ||
        !fs.existsSync(path.join(root, 'credentials/service-account.json')) ||
        !fs.existsSync(path.join(runtime, 'firebase-login-ready'))) {
        throw new Error('Complete .env, credentials/service-account.json and npm run login before running reports.');
    }
    busy = true;
    return {
        release: () => { busy = false; },
        async run() {
            let fd;
            try {
                log('Starting report');
                fd = fs.openSync(logPath, 'a');
                const code = await new Promise((resolve, reject) => {
                    const child = spawn(process.execPath, [path.join(root, 'run-report.js')], {
                        cwd: root, env, windowsHide: true, stdio: ['ignore', fd, fd], timeout: 45 * 60 * 1000
                    });
                    child.once('error', reject);
                    child.once('exit', resolve);
                });
                log('Report finished; exit code ' + code);
                if (code !== 0) throw new Error('Report failed. Check run-report.log.');
            } finally {
                if (fd !== undefined) fs.closeSync(fd);
                busy = false;
            }
        }
    };
}
async function tick() {
    if (busy) return;
    let job;
    try {
        const env = readEnv();
        const day = scheduledDay(new Date(), env.REPORT_TIME || '08:00');
        if (!day) return;
        const state = fs.existsSync(statePath) ? JSON.parse(fs.readFileSync(statePath, 'utf8')) : {};
        if (state.day === day) return;
        job = reserve(env);
        if (!job) return;
        const save = status => {
            fs.writeFileSync(statePath + '.tmp', JSON.stringify({ day, status }));
            fs.renameSync(statePath + '.tmp', statePath);
        };
        save('running');
        try { await job.run(); save('success'); }
        catch (error) { save('failed'); throw error; }
    } catch (error) { log(error.message); }
    finally { job?.release(); }
}
async function startSlack() {
    const env = readEnv();
    if (!env.SLACK_APP_TOKEN) { log('Socket Mode disabled: SLACK_APP_TOKEN is empty.'); return; }
    // Transport errors may contain credentials; keep SDK messages out of logs.
    const logger = { debug() {}, info() {}, warn() { log('Slack Socket Mode warning.'); }, error() { log('Slack Socket Mode error.'); }, setLevel() {}, getLevel() { return 'error'; }, setName() {} };
    const client = new SocketModeClient({ appToken: env.SLACK_APP_TOKEN, logger });
    const handler = createCommandHandler({ reserve, log, notify: async (url, text) => {
        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ response_type: 'ephemeral', text }),
            signal: AbortSignal.timeout(30000)
        });
        if (!response.ok) throw new Error('Slack completion notification failed.');
    } });
    client.on('slash_commands', event => { void handler(event).catch(() => log('Slack command handling failed.')); });
    client.on('connected', () => log('Slack Socket Mode connected.'));
    client.on('error', () => log('Slack Socket Mode connection error.'));
    await client.start();
}
const guard = net.createServer(socket => socket.end());
guard.on('error', error => {
    if (error.code !== 'EADDRINUSE') { log(error.message); process.exitCode = 1; }
});
guard.listen(47831, '127.0.0.1', () => {
    log('Scheduler started; timezone Asia/Ho_Chi_Minh.');
    void tick();
    setInterval(() => void tick(), 30000);
    void startSlack().catch(() => log('Socket Mode could not start. Check SLACK_APP_TOKEN and restart the app.'));
});
