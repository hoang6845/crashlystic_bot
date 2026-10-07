export function createCommandHandler({ reserve, log, notify }) {
    const seen = new Map();
    return async ({ body, ack }) => {
        const reply = text => ack({ response_type: 'ephemeral', text });
        if (body.command !== '/crash-report' || body.text?.trim()) {
            await reply('Dùng /crash-report để lấy báo cáo ngay.'); return;
        }
        const now = Date.now();
        for (const [key, expires] of seen) if (expires < now) seen.delete(key);
        const key = body.trigger_id;
        if (key && seen.has(key)) { await reply('Yêu cầu này đã được tiếp nhận.'); return; }
        let job;
        try { job = reserve(); }
        catch { await reply('Chưa đủ cấu hình báo cáo. Kiểm tra .env, Google key và đăng nhập Firebase trên máy.'); return; }
        if (!job) { await reply('Đang chạy báo cáo. Vui lòng chờ hoàn tất.'); return; }
        if (key) seen.set(key, now + 60 * 60 * 1000);
        try { await reply('Đã nhận yêu cầu. Báo cáo sẽ gửi vào kênh webhook đã cấu hình khi hoàn tất.'); }
        catch { job.release(); log('Slack command acknowledgement failed.'); return; }
        try {
            await job.run();
            await notify(body.response_url, 'Đã hoàn tất báo cáo và gửi vào kênh webhook.');
        } catch {
            log('Slack command report or completion notification failed.');
            try { await notify(body.response_url, 'Báo cáo hoặc thông báo hoàn tất gặp lỗi. Kiểm tra run-report.log trên máy.'); }
            catch { log('Slack command error notification failed.'); }
        }
    };
}
