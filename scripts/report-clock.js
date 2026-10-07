export function scheduledDay(now, time = '08:30') {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('REPORT_TIME must be HH:mm');
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).map(p => [p.type, p.value]));
    return parts.hour + ':' + parts.minute >= time ? parts.year + '-' + parts.month + '-' + parts.day : null;
}
