import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FIREBASE_URL = 'https://console.firebase.google.com/project/toonage-50700/crashlytics/app/android:com.aiface.generator.art.style.maker.studio/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount';

(async () => {
    const userDataDir = path.join(__dirname, 'browser-profile');

    console.log(chalk.blue('Opening browser for login session setup...'));
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: false,
        viewport: null,
        channel: 'chrome',
        ignoreDefaultArgs: ['--enable-automation'],
        args: ['--start-maximized', '--disable-blink-features=AutomationControlled']
    });

    const page = await context.newPage();

    console.log(chalk.yellow('Navigating to Firebase Crashlytics...'));
    await page.goto(FIREBASE_URL, { waitUntil: 'domcontentloaded', timeout: 90000 });

    console.log(chalk.cyan('Please log in to your Google account if prompted.'));
    console.log(chalk.cyan('Waiting up to 3 minutes for login completion...'));

    let loggedIn = false;
    try {
        await page.waitForFunction(() => {
            const text = document.body.innerText;
            const hasContent = text.length > 1500;
            const hasPercent = text.includes('%');
            const notLogin = !window.location.href.includes('accounts.google.com')
                && !window.location.href.includes('signin');
            return notLogin && hasContent && hasPercent;
        }, { timeout: 180000 });
        loggedIn = true;
        console.log(chalk.green('✓ Firebase Crashlytics loaded - login session saved successfully!'));
    } catch {
        const url = page.url();
        if (!url.includes('accounts.google.com') && !url.includes('signin')) {
            loggedIn = true;
            console.log(chalk.green('✓ Login appears successful (redirected away from login page).'));
        } else {
            console.log(chalk.red('✗ Login not completed within 3 minutes. Try running test-crash again.'));
        }
    }

    console.log(chalk.blue('Session profile saved to browser-profile/.'));
    console.log(chalk.blue('Ready — you can now run: node run-report.js'));
    await page.waitForTimeout(3000);
    await context.close();
})();
