import test from 'node:test';
import assert from 'node:assert/strict';
import { createCommandHandler } from './slack-command.js';
const body = { command: '/crash-report', text: '', trigger_id: 'one', response_url: 'unused' };
const log = () => {};
test('acknowledges before report, and ignores Slack retries', async () => {
    const events = [];
    const handle = createCommandHandler({ log, reserve: () => ({ release() {}, run: async () => events.push('run') }), notify: async () => events.push('notify') });
    await handle({ body, ack: async () => events.push('ack') });
    assert.deepEqual(events, ['ack', 'run', 'notify']);
    await handle({ body, ack: async () => events.push('duplicate') });
    assert.deepEqual(events, ['ack', 'run', 'notify', 'duplicate']);
});
test('concurrent request is rejected while report runs', async () => {
    let busy = false;
    let finish;
    const wait = new Promise(resolve => { finish = resolve; });
    const handle = createCommandHandler({ log, reserve: () => {
        if (busy) return null;
        busy = true;
        return { release() { busy = false; }, async run() { await wait; busy = false; } };
    }, notify: async () => {} });
    const first = handle({ body, ack: async () => {} });
    let reply;
    await handle({ body: { ...body, trigger_id: 'two' }, ack: async value => { reply = value; } });
    assert.match(reply.text, /Đang chạy/);
    finish();
    await first;
    assert.equal(busy, false);
});
test('failed acknowledgement releases slot without running', async () => {
    let released = false;
    const handle = createCommandHandler({ log, reserve: () => ({ release() { released = true; }, run() { assert.fail('must not run'); } }), notify: async () => {} });
    await handle({ body, ack: async () => { throw new Error('offline'); } });
    assert.equal(released, true);
});
test('configuration, usage and report failures return private feedback', async () => {
    let reply;
    let notification;
    const event = { body, ack: async value => { reply = value; } };
    const invalid = createCommandHandler({ log, reserve() { throw new Error('config'); }, notify() {} });
    await invalid(event);
    assert.equal(reply.response_type, 'ephemeral');
    assert.match(reply.text, /Chưa đủ/);
    await invalid({ ...event, body: { ...body, text: 'unknown' } });
    assert.match(reply.text, /Dùng/);
    const failed = createCommandHandler({ log, reserve: () => ({ release() {}, async run() { throw new Error('failed'); } }), notify: async (url, text) => { notification = text; } });
    await failed(event);
    assert.match(notification, /gặp lỗi/);
});
