const DAY_MS = 86400000;
const SHEETS_EPOCH = Date.UTC(1899, 11, 30);
export const TRACKING_SPREADSHEET_ID = '1uz7VkvtZwHjk16luXoW66olcMtSZmG-Vp45xRimaOYU';
export const TRACKING_SHEET_ID = 555656315;

function appKey(value) {
    return String(value ?? '').normalize('NFKC').toLocaleLowerCase('en').replace(/[^\p{L}\p{N}]/gu, '');
}

export function dateSerial(value) {
    if (typeof value === 'number' && Number.isInteger(value) && value > 20000 && value < 100000) return value;
    const match = String(value ?? '').trim().match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/);
    if (!match) return null;
    const [, day, month, year] = match.map(Number);
    const stamp = Date.UTC(year, month - 1, day);
    const date = new Date(stamp);
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return (stamp - SHEETS_EPOCH) / DAY_MS;
}

// This existing tracking tab has headers on row 2, app names in B, dates from F.
export function planTrackingUpdates(headers, appNames, results, reportDate) {
    const day = dateSerial(reportDate);
    if (day === null) throw new Error('Invalid tracking report date: ' + reportDate);
    const dates = headers.map((value, column) => ({ day: dateSerial(value), column })).filter(x => x.column >= 5 && x.day !== null);
    if (!dates.length) throw new Error('Tracking sheet has no full date headers on row 2.');
    const matches = dates.filter(x => x.day === day);
    if (matches.length > 1) throw new Error('Tracking sheet has duplicate columns for ' + reportDate);
    // Insert before the next date, or after the last populated header; never reuse a separator column.
    const next = dates.find(x => x.day > day);
    let lastHeader = 4;
    headers.forEach((value, column) => { if (String(value ?? '').trim()) lastHeader = Math.max(lastHeader, column); });
    const column = matches[0]?.column ?? next?.column ?? lastHeader + 1;
    const seen = new Set();
    const updates = results.map(result => {
        const key = appKey(result.app);
        if (!key || seen.has(key)) throw new Error('Duplicate or empty app in tracking report: ' + result.app);
        seen.add(key);
        const rows = appNames.map((name, row) => ({ name, row })).filter(x => x.row >= 2 && appKey(x.name) === key);
        if (rows.length !== 1) throw new Error('Tracking sheet must have exactly one matching app row: ' + result.app);
        const percent = String(result.crashFreeUsers).trim().match(/^(\d+(?:\.\d+)?)\s*%$/);
        const number = percent ? Number(percent[1]) : NaN;
        if (!Number.isFinite(number) || number < 0 || number > 100) throw new Error('Invalid Crash-Free Users for ' + result.app);
        return { row: rows[0].row, app: result.app, value: number / 100 };
    });
    if (!matches.length && dates.some((entry, i) => i > 0 && entry.day <= dates[i - 1].day)) {
        throw new Error('Tracking date columns must be chronological before inserting a new day.');
    }
    const templateColumn = [...dates].reverse().find(entry => entry.column < column)?.column ?? dates[0].column;
    return { day, column, templateColumn, createColumn: matches.length === 0, updates };
}

export async function readTrackingPlan(sheet, results, reportDate) {
    await sheet.loadCells([
        { startRowIndex: 1, endRowIndex: 2, startColumnIndex: 0, endColumnIndex: sheet.columnCount },
        { startRowIndex: 2, endRowIndex: sheet.rowCount, startColumnIndex: 1, endColumnIndex: 2 },
    ]);
    const headers = Array.from({ length: sheet.columnCount }, (_, column) => sheet.getCell(1, column).value);
    const appNames = Array.from({ length: sheet.rowCount }, (_, row) => row < 2 ? '' : sheet.getCell(row, 1).value);
    return planTrackingUpdates(headers, appNames, results, reportDate);
}

export async function writeTrackingSheet(sheet, results, reportDate) {
    const plan = await readTrackingPlan(sheet, results, reportDate);
    if (!plan.updates.length) return plan;
    if (plan.createColumn) {
        if (plan.column >= sheet.columnCount) {
            await sheet.resize({ rowCount: sheet.rowCount, columnCount: plan.column + 1 });
        } else {
            await sheet.insertDimension('COLUMNS', { startIndex: plan.column, endIndex: plan.column + 1 }, true);
        }
        // Copy only formatting from the neighbouring date column, leaving its values untouched.
        const sourceColumn = plan.templateColumn >= plan.column ? plan.templateColumn + 1 : plan.templateColumn;
        await sheet.copyPaste(
            { startRowIndex: 0, endRowIndex: sheet.rowCount, startColumnIndex: sourceColumn, endColumnIndex: sourceColumn + 1 },
            { startRowIndex: 0, endRowIndex: sheet.rowCount, startColumnIndex: plan.column, endColumnIndex: plan.column + 1 },
            'PASTE_FORMAT',
        );
    }
    await sheet.loadCells([
        { startRowIndex: 1, endRowIndex: 2, startColumnIndex: plan.column, endColumnIndex: plan.column + 1 },
        ...plan.updates.map(update => ({ startRowIndex: update.row, endRowIndex: update.row + 1, startColumnIndex: plan.column, endColumnIndex: plan.column + 1 })),
    ]);
    // Validate every destination before changing values; do not replace user formulas.
    for (const update of plan.updates) {
        if (sheet.getCell(update.row, plan.column).formula) throw new Error('Tracking destination contains a formula for ' + update.app);
    }
    if (plan.createColumn) {
        const header = sheet.getCell(1, plan.column);
        header.value = plan.day;
        header.numberFormat = { type: 'DATE', pattern: 'dd/mm' };
    }
    for (const update of plan.updates) {
        const cell = sheet.getCell(update.row, plan.column);
        cell.value = update.value;
        cell.numberFormat = { type: 'PERCENT', pattern: '0.00%' };
    }
    await sheet.saveUpdatedCells();
    return plan;
}
