import test from 'node:test';
import assert from 'node:assert/strict';
import { scheduledDay } from './report-clock.js';
test('Vietnam schedule: before, exactly at, and late startup', () => {
    assert.equal(scheduledDay(new Date('2026-09-30T01:29:59Z')), null);
    assert.equal(scheduledDay(new Date('2026-09-30T01:30:00Z')), '2026-09-30');
    assert.equal(scheduledDay(new Date('2026-09-30T16:59:59Z')), '2026-09-30');
    assert.equal(scheduledDay(new Date('2026-09-30T17:00:00Z')), null);
    assert.equal(scheduledDay(new Date('2026-10-01T01:30:00Z')), '2026-10-01');
});
test('custom time and invalid configuration', () => {
    assert.equal(scheduledDay(new Date('2026-09-30T01:00:00Z'), '08:00'), '2026-09-30');
    assert.throws(() => scheduledDay(new Date(), '25:00'));
});
