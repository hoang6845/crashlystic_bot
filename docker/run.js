import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export function dockerReportSource(source) {
    const start = source.indexOf("    const userDataDir = path.join(__dirname, 'browser-profile');");
    const end = source.indexOf('    const page = await context.newPage();', start);
    if (start < 0 || end < 0) throw new Error('Report browser setup changed; review Docker integration.');
    let result = "import { openDockerProfile } from './docker/profile.js';\n" + source.slice(0, start) +
        '    const dockerProfile = await openDockerProfile();\n    const context = dockerProfile.context;\n    let browser;\n\n' + source.slice(end);
    const close = '        try { await context.close(); } finally { await browser?.close(); }';
    if (result.split(close).length !== 2) throw new Error('Report browser cleanup changed.');
    result = result.replace(close, '        try {\n            if (results.length === APPS.length) await dockerProfile.validated();\n        } finally { await context.close(); }');
    const check = "    if (results.length !== APPS.length) throw new Error('Incomplete report: an app could not be scraped.');";
    if (result.split(check).length !== 2) throw new Error('Report completeness check changed.');
    return result.replace(check, check + "\n    if (process.env.DOCKER_REPORT_MODE === 'check') {\n        console.log('CHECK PASSED: all app metrics read; no Sheets or Slack writes.');\n        return;\n    }");
}

export function prepareDocker(env = process.env, root = new URL('../', import.meta.url)) {
    if (!['check', 'report'].includes(env.DOCKER_REPORT_MODE || 'check')) throw new Error('DOCKER_REPORT_MODE must be check or report.');
    env.DOCKER_REPORT_MODE ||= 'check';
    if (env.DOCKER_REPORT_MODE === 'report') {
        for (const name of ['SPREADSHEET_ID', 'SHEET_NAME', 'SLACK_WEBHOOK_URL', 'GOOGLE_CREDENTIALS_JSON']) {
            if (!env[name]?.trim()) throw new Error('Missing Docker variable: ' + name);
        }
        let credentials;
        try { credentials = JSON.parse(env.GOOGLE_CREDENTIALS_JSON); }
        catch { throw new Error('GOOGLE_CREDENTIALS_JSON must be valid service account JSON.'); }
        if (!credentials.client_email || !credentials.private_key) throw new Error('Service account JSON needs client_email and private_key.');
        fs.mkdirSync(new URL('credentials/', root), { recursive: true });
        fs.writeFileSync(new URL('credentials/service-account.json', root), JSON.stringify(credentials), { mode: 0o600 });
    }
    const source = fs.readFileSync(new URL('run-report.js', root), 'utf8');
    const target = new URL('run-report.docker.generated.js', root);
    fs.writeFileSync(target, dockerReportSource(source));
    return target;
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    try { await import(prepareDocker().href); }
    catch (error) { console.error(error.message); process.exitCode = 1; }
}
