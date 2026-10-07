import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createWorker } from './src/index.js';
const now = Date.UTC(2026, 9, 7, 2);
const secret = 'test-signing-secret';
function request(fields = {}, { age = 0, bad = false } = {}) {
    const raw = new URLSearchParams({ command: '/crash-report', text: '', team_id: 'T1', user_id: 'U1', trigger_id: 'one', response_url: 'https://hooks.slack.com/commands/test', ...fields }).toString();
    const timestamp = String(Math.floor(now / 1000) - age);
    const signature = 'v0=' + createHmac('sha256', secret).update(`v0:${timestamp}:${raw}`).digest('hex');
    return new Request('https://worker.test/slack/commands', { method: 'POST', body: raw, headers: {
        'x-slack-request-timestamp': timestamp, 'x-slack-signature': bad ? 'v0=' + '0'.repeat(64) : signature
    } });
}
function harness({ dispatchStatus = 204, failDb = false } = {}) {
    const rows = new Map();
    const calls = [];
    const pending = [];
    const env = {
        SLACK_SIGNING_SECRET: secret, SLACK_TEAM_ID: 'T1', SLACK_ALLOWED_USER_IDS: 'U1,U2',
        GITHUB_TOKEN: 'test-token', GITHUB_OWNER: 'owner', GITHUB_REPO: 'repo', GITHUB_REF: 'main', CLOUD_REPORT_ENABLED: 'true',
        DB: { prepare(sql) { return { bind(...args) { return { async run() {
            if (failDb) throw new Error('db');
            if (sql.startsWith('DELETE')) return { meta: { changes: 0 } };
            const [id, day, created, countDay, limit] = args;
            if (rows.has(id) || [...rows.values()].filter(row => row.day === countDay).length >= limit) return { meta: { changes: 0 } };
            rows.set(id, { day, created });
            return { meta: { changes: 1 } };
        } }; } }; } }
    };
    const worker = createWorker({ now: () => now, fetcher: async (url, options) => {
        calls.push({ url, options });
        return new Response(null, { status: url.startsWith('https://api.github.com') ? dispatchStatus : 200 });
    } });
    return { env, calls, rows, async invoke(req) {
        const response = await worker.fetch(req, env, { waitUntil(promise) { pending.push(promise); } });
        await Promise.all(pending.splice(0));
        return response;
    } };
}
test('valid Slack command dispatches the configured private workflow and replies privately', async () => {
    const h = harness();
    const response = await h.invoke(request());
    assert.equal(response.status, 200);
    assert.equal((await response.json()).response_type, 'ephemeral');
    assert.equal(h.calls.length, 2);
    assert.match(h.calls[0].url, /repos\/owner\/repo\/actions\/workflows\/daily-report.yml\/dispatches$/);
    assert.deepEqual(JSON.parse(h.calls[0].options.body), { ref: 'main' });
    assert.equal(JSON.parse(h.calls[1].options.body).response_type, 'ephemeral');
});
test('forged and expired signatures cannot dispatch', async () => {
    const h = harness();
    assert.equal((await h.invoke(request({}, { bad: true }))).status, 401);
    assert.equal((await h.invoke(request({}, { age: 301 }))).status, 401);
    assert.equal(h.calls.length, 0);
});
test('workspace, user, command arguments and disabled cloud are enforced', async () => {
    const h = harness();
    for (const fields of [{ team_id: 'T2' }, { user_id: 'U3' }, { text: 'extra' }, { command: '/other' }]) await h.invoke(request(fields));
    h.env.CLOUD_REPORT_ENABLED = 'false';
    await h.invoke(request());
    assert.equal(h.calls.length, 0);
    delete h.env.SLACK_ALLOWED_USER_IDS;
    assert.equal((await h.invoke(request())).status, 503);
});
test('Slack retries and daily command budget do not launch extra reports', async () => {
    const h = harness();
    await h.invoke(request());
    await h.invoke(request());
    await h.invoke(request({ trigger_id: 'two' }));
    await h.invoke(request({ trigger_id: 'three' }));
    assert.equal(h.calls.filter(call => call.url.startsWith('https://api.github.com')).length, 2);
    assert.equal(h.rows.size, 2);
});
test('GitHub and D1 failures provide private feedback without automatic redispatch', async () => {
    const h = harness({ dispatchStatus: 403 });
    await h.invoke(request());
    await h.invoke(request());
    assert.equal(h.calls.filter(call => call.url.startsWith('https://api.github.com')).length, 1);
    assert.match(JSON.parse(h.calls[1].options.body).text, /GitHub Actions/);
    const db = harness({ failDb: true });
    await db.invoke(request());
    assert.equal(db.calls.filter(call => call.url.startsWith('https://api.github.com')).length, 0);
});
test('response URLs outside Slack are never fetched', async () => {
    const h = harness();
    await h.invoke(request({ response_url: 'https://attacker.test/commands/steal' }));
    assert.equal(h.calls.length, 1);
});
