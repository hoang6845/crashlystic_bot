import test from 'node:test';
import assert from 'node:assert/strict';
import { dateSerial, planTrackingUpdates, writeTrackingSheet } from './tracking-sheet.js';
const day = '7/10/2026';
const serial = dateSerial(day);
const results = [
    { app: 'Cute Keyboard', crashFreeUsers: '99.58%' },
    { app: 'Cross Stitch', crashFreeUsers: '100%' },
];

function sheetFixture(headers = ['No.', 'App name', 'Dev', 'Squad', 'SDK version', dateSerial('7/10/2025'), serial, serial + 1]) {
    const cells = Array.from({ length: 8 }, () => headers.map(() => ({ value: null, formula: null, note: 'preserved' })));
    headers.forEach((value, col) => { cells[1][col].value = value; });
    cells[2][1].value = 'Action';
    cells[3][1].value = 'CuteKeyboard';
    cells[4][1].value = '[iOS] CuteKeyboard';
    cells[6][1].value = 'Cross Stitch';
    cells[3][0].value = 1;
    cells[3][2].value = 'Developer';
    cells[3][5].value = 0.95;
    cells[2][6].value = 'Manual action notes';
    const calls = [];
    const sheet = {
        rowCount: cells.length, columnCount: headers.length,
        getCell(row, col) { return cells[row][col]; },
        async loadCells(ranges) { calls.push(['load', ranges]); },
        async resize({ columnCount }) {
            calls.push(['resize', columnCount]);
            for (const row of cells) while (row.length < columnCount) row.push({ value: null, formula: null });
            this.columnCount = columnCount;
        },
        async insertDimension(dimension, range, inherit) {
            calls.push(['insert', dimension, range, inherit]);
            for (const row of cells) row.splice(range.startIndex, 0, { value: null, formula: null });
            this.columnCount++;
        },
        async copyPaste(source, target, type) { calls.push(['copy', source, target, type]); },
        async saveUpdatedCells() { calls.push(['save']); },
    };
    return { sheet, cells, calls };
}

test('matches names and full year, writes only users at existing app/date intersections', async () => {
    const { sheet, cells, calls } = sheetFixture();
    const before = structuredClone(cells);
    const plan = await writeTrackingSheet(sheet, [...results].reverse(), day);
    assert.equal(plan.column, 6);
    assert.equal(plan.createColumn, false);
    assert.equal(cells[3][6].value, 0.9958);
    assert.equal(cells[6][6].value, 1);
    assert.deepEqual(cells[3][6].numberFormat, { type: 'PERCENT', pattern: '0.00%' });
    for (let r = 0; r < cells.length; r++) for (let c = 0; c < sheet.columnCount; c++) {
        if (c === 6 && [3, 6].includes(r)) continue;
        assert.deepEqual(cells[r][c], before[r][c]);
    }
    assert.equal(calls.some(call => ['insert', 'resize', 'copy'].includes(call[0])), false);
    await writeTrackingSheet(sheet, [{ app: 'Cute Keyboard', crashFreeUsers: '98.12%' }], day);
    assert.ok(Math.abs(cells[3][6].value - 0.9812) < 1e-12);
    assert.equal(sheet.columnCount, 8);
});

test('inserts missing date in order, copying format without copying values', async () => {
    const { sheet, cells, calls } = sheetFixture(['No.', 'App name', 'Dev', 'Squad', 'SDK version', serial - 1, serial + 1, serial + 2]);
    const before = structuredClone(cells);
    const plan = await writeTrackingSheet(sheet, results, day);
    assert.equal(plan.column, 6);
    assert.equal(plan.createColumn, true);
    assert.equal(cells[1][6].value, serial);
    assert.deepEqual(cells[1][6].numberFormat, { type: 'DATE', pattern: 'dd/mm' });
    assert.equal(cells[3][6].value, 0.9958);
    assert.equal(cells[0][6].value, null);
    for (let r = 0; r < cells.length; r++) for (let c = 0; c < before[r].length; c++) {
        assert.deepEqual(cells[r][c >= 6 ? c + 1 : c], before[r][c]);
    }
    assert.equal(calls.find(call => call[0] === 'copy')[3], 'PASTE_FORMAT');
});

test('appends after last date when grid is full', async () => {
    const { sheet, cells, calls } = sheetFixture(['No.', 'App name', 'Dev', 'Squad', 'SDK version', serial - 3, serial - 2, serial - 1]);
    await writeTrackingSheet(sheet, results, day);
    assert.equal(sheet.columnCount, 9);
    assert.equal(cells[1][8].value, serial);
    assert.equal(cells[3][8].value, 0.9958);
    assert.equal(calls.some(call => call[0] === 'resize'), true);
});

test('rejects missing/ambiguous app rows, invalid rates and duplicate dates before writes', async () => {
    for (const change of [
        f => { f.cells[6][1].value = 'Other App'; },
        f => { f.cells[7][1].value = 'Cute Keyboard'; },
        f => { f.cells[1][7].value = serial; },
    ]) {
        const f = sheetFixture();
        change(f);
        const before = structuredClone(f.cells);
        await assert.rejects(writeTrackingSheet(f.sheet, results, day));
        assert.deepEqual(f.cells, before);
        assert.equal(f.calls.some(call => ['insert', 'resize', 'copy', 'save'].includes(call[0])), false);
    }
    const f = sheetFixture();
    for (const rate of ['N/A', '101%', '-1%', '99.5% garbage']) {
        await assert.rejects(writeTrackingSheet(f.sheet, [{ app: 'Cute Keyboard', crashFreeUsers: rate }], day), /Invalid Crash-Free/);
    }
    await assert.rejects(writeTrackingSheet(f.sheet, [results[0], results[0]], day), /Duplicate/);
});

test('preserves formulas rather than replacing them with scraped rates', async () => {
    const f = sheetFixture();
    f.cells[6][6].formula = '=AVERAGE(F7)';
    const before = structuredClone(f.cells);
    await assert.rejects(writeTrackingSheet(f.sheet, results, day), /contains a formula/);
    assert.deepEqual(f.cells, before);
    assert.equal(f.calls.some(call => call[0] === 'save'), false);
});

test('date parsing validates the year and rejects ambiguous yearless headers', () => {
    assert.equal(dateSerial('07/10/2026'), serial);
    assert.equal(dateSerial(serial), serial);
    assert.notEqual(dateSerial('7/10/2025'), serial);
    assert.equal(dateSerial('31/2/2026'), null);
    assert.equal(dateSerial('7/10'), null);
    assert.throws(() => planTrackingUpdates(['', '', '', '', '', '07/10'], ['', '', 'CuteKeyboard'], [results[0]], day), /no full date headers/);
});
