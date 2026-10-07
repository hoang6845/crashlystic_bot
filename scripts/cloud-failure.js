// Only sends a generic failure; never includes credentials or raw exceptions.
const url = process.env.SLACK_WEBHOOK_URL;
if (url) {
    try {
        const response = await fetch(url, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: 'Crashlytics cloud report failed. Check the GitHub Actions run; if Firebase login expired, run npm run login:cloud and update the encrypted session.' }),
            signal: AbortSignal.timeout(15000)
        });
        if (!response.ok) throw new Error();
    } catch { console.error('Could not send the cloud failure notification.'); process.exitCode = 1; }
}
