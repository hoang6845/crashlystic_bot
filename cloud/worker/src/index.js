function message(text, status = 200) {
    return Response.json({ response_type: 'ephemeral', text }, { status });
}
export async function validSignature(raw, timestamp, signature, secret, now = Date.now()) {
    if (!/^\d{10}$/.test(timestamp || '') || Math.abs(now / 1000 - Number(timestamp)) > 300 || !/^v0=[a-f0-9]{64}$/.test(signature || '')) return false;
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const bytes = Uint8Array.from(signature.slice(3).match(/../g), hex => parseInt(hex, 16));
    return crypto.subtle.verify('HMAC', key, bytes, new TextEncoder().encode(`v0:${timestamp}:${raw}`));
}
export function createWorker({ fetcher = fetch, now = Date.now } = {}) {
    async function notify(url, text) {
        try {
            const parsed = new URL(url);
            if (parsed.protocol !== 'https:' || parsed.hostname !== 'hooks.slack.com' || !parsed.pathname.startsWith('/commands/')) return;
            const result = await fetcher(url, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ response_type: 'ephemeral', text }),
                signal: AbortSignal.timeout(8000)
            });
            if (!result.ok) console.error('Slack private reply failed.');
        } catch { console.error('Slack private reply failed.'); }
    }
    async function dispatch(raw, body, env) {
        const requestId = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))), byte => byte.toString(16).padStart(2, '0')).join('');
        const seconds = Math.floor(now() / 1000);
        const day = new Date(now()).toISOString().slice(0, 10);
        const configured = Number(env.MAX_MANUAL_REPORTS_PER_DAY || 2);
        const limit = Number.isInteger(configured) && configured >= 1 && configured <= 20 ? configured : 2;
        try {
            await env.DB.prepare('DELETE FROM requests WHERE created_at < ?').bind(seconds - 7 * 86400).run();
            // One atomic statement enforces both deduplication and the daily budget.
            const claim = await env.DB.prepare(`INSERT OR IGNORE INTO requests (id, day, created_at)
                SELECT ?, ?, ? WHERE (SELECT COUNT(*) FROM requests WHERE day = ?) < ?`)
                .bind(requestId, day, seconds, day, limit).run();
            if (!claim.meta.changes) {
                await notify(body.get('response_url'), 'Yêu cầu đã được nhận trước đó hoặc đã hết số lần chạy thủ công hôm nay (UTC).');
                return;
            }
            const endpoint = `https://api.github.com/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/actions/workflows/daily-report.yml/dispatches`;
            const response = await fetcher(endpoint, {
                method: 'POST', headers: {
                    Authorization: `Bearer ${env.GITHUB_TOKEN}`,
                    Accept: 'application/vnd.github+json',
                    'X-GitHub-Api-Version': '2022-11-28',
                    'Content-Type': 'application/json',
                    'User-Agent': 'crashlytics-slack-worker'
                },
                body: JSON.stringify({ ref: env.GITHUB_REF || 'main' }),
                signal: AbortSignal.timeout(8000)
            });
            if (response.status !== 204) throw new Error('dispatch');
            await notify(body.get('response_url'), 'GitHub đã nhận yêu cầu. Báo cáo sẽ gửi vào kênh webhook khi hoàn tất.');
        } catch {
            // Do not retry automatically: GitHub might have accepted a timed-out call.
            console.error('Report dispatch failed; inspect GitHub runs before retrying.');
            await notify(body.get('response_url'), 'Không xác nhận được việc chạy báo cáo. Kiểm tra GitHub Actions và cấu hình Worker trước khi thử lại.');
        }
    }
    return {
        async fetch(request, env, ctx) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/health' && request.method === 'GET') return Response.json({ ok: true });
            if (pathname !== '/slack/commands') return new Response('Not found', { status: 404 });
            if (request.method !== 'POST') return new Response('Method not allowed', { status: 405 });
            if (!env.SLACK_SIGNING_SECRET || !env.SLACK_TEAM_ID || !env.SLACK_ALLOWED_USER_IDS || !env.GITHUB_TOKEN || !env.GITHUB_OWNER || !env.GITHUB_REPO || !env.DB) {
                return message('Chưa đủ cấu hình Worker. Kiểm tra secrets và D1.', 503);
            }
            if (Number(request.headers.get('content-length')) > 16384) return new Response('Too large', { status: 413 });
            const raw = await request.text();
            if (raw.length > 16384) return new Response('Too large', { status: 413 });
            if (!await validSignature(raw, request.headers.get('x-slack-request-timestamp'), request.headers.get('x-slack-signature'), env.SLACK_SIGNING_SECRET, now())) {
                return new Response('Unauthorized', { status: 401 });
            }
            const body = new URLSearchParams(raw);
            const allowedUsers = env.SLACK_ALLOWED_USER_IDS.split(',').map(value => value.trim());
            if (body.get('team_id') !== env.SLACK_TEAM_ID || !allowedUsers.includes(body.get('user_id'))) return message('Bạn chưa được cấp quyền chạy báo cáo.');
            if (body.get('command') !== '/crash-report' || (body.get('text') || '').trim()) return message('Dùng /crash-report để lấy báo cáo ngay.');
            if (env.CLOUD_REPORT_ENABLED !== 'true') return message('Báo cáo cloud đang tắt. Hoàn tất cấu hình rồi bật CLOUD_REPORT_ENABLED.');
            ctx.waitUntil(dispatch(raw, body, env));
            return message('Đã nhận yêu cầu. Đang chuyển sang GitHub Actions; có thể phải chờ runner.');
        }
    };
}
export default createWorker();
