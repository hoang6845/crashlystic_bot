import { chromium } from 'playwright';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { JWT } from 'google-auth-library';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { writeTrackingSheet, TRACKING_SPREADSHEET_ID, TRACKING_SHEET_ID } from './scripts/tracking-sheet.js';



const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '.env') });
const SHEET_NAME = process.env.SHEET_NAME;
const reportDate = () => new Date().toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

if (!SPREADSHEET_ID) {
    console.warn(chalk.yellow('WARNING: SPREADSHEET_ID is not defined in .env'));
}

const APPS = [
    // {
    //     name: 'Pixel Art',
    //     url: 'https://console.firebase.google.com/project/pixel-art-8849d/crashlytics/app/android:com.draw.drawing.pixel.art.color.coloring.by.number/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Draw & Paint',
    //     url: 'https://console.firebase.google.com/project/draw-and-paint-ef72d/crashlytics/app/android:com.draw.drawing.paint.painting.classic.pixel.art/issues?time=24h&state=open&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Cross Stitch',
    //     url: 'https://console.firebase.google.com/project/cross-stitch---color-by-number/crashlytics/app/android:com.draw.drawing.cross.stitch.color.coloring.by.number/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Diamond Painting',
    //     url: 'https://console.firebase.google.com/project/diamond-painting-79873/crashlytics/app/android:com.diamond.painting.art.craft.color.coloring.by.number/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'T-Shirt',
    //     url: 'https://console.firebase.google.com/project/diy-t-shirt-design/crashlytics/app/android:com.diy.design.desining.make.making.tshirt.art.ai/issues?state=open&time=24h&tag=all&sort=eventCount&types=crash'
    // },
    {
        name: 'Relax Paint',
        url: 'https://console.firebase.google.com/project/relax-paint---paint-by-number/crashlytics/app/android:com.draw.drawing.paint.painting.relax.paint.by.number/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
    // {
    //     name: 'Neon Brush',
    //     url: 'https://console.firebase.google.com/project/neon-brush/crashlytics/app/android:com.draw.drawing.paint.painting.neon.brush.glow.art/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'String Art',
    //     url: 'https://console.firebase.google.com/project/string-art-maker-diy-studio/crashlytics/app/android:com.draw.drawing.string.art.pin.and.thread.art.filography/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    {
        name: 'Oil Paint',
        url: 'https://console.firebase.google.com/project/oil-paint-670be/crashlytics/app/android:com.draw.drawing.paint.painting.oil.tap.paint.by.number/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
    // {
    //     name: 'Visual Art & Wheel Play',
    //     url: 'https://console.firebase.google.com/project/visual-wheel-art/crashlytics/app/android:com.draw.drawing.visual.art.wheel.play.spin.draw/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Anime Pakuman',
    //     url: 'https://console.firebase.google.com/project/anime-pakuman---draw-and-play/crashlytics/app/android:com.anime.art.pacman.game.draw.play/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Tap Puzzle',
    //     url: 'https://console.firebase.google.com/project/tappuzzle-gallery/crashlytics/app/android:com.tappuzzle.reveal.hidden.art.puzzle.relax/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'AI Face Style',
    //     url: 'https://console.firebase.google.com/project/toonage-50700/crashlytics/app/android:com.aiface.generator.art.style.maker.studio/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Voice Swap',
    //     url: 'https://console.firebase.google.com/project/voice-swap-e07ba/crashlytics/app/android:com.aivoice.voicechanger/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Mochi Alarm',
    //     url: 'https://console.firebase.google.com/project/mochi-alarm---challenge-clock/crashlytics/app/android:alarm.mochi.cute.simple.clock.wakeup.challenge/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Drum Pad',
    //     url: 'https://console.firebase.google.com/project/drum-pad-b68d9/crashlytics/app/android:com.easy.drum.pad.beat.maker.music.dj.piano.tiles/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'AR Trace',
    //     url: 'https://console.firebase.google.com/project/ar-trace---sketch-drawing/crashlytics/app/android:ardrawing.ar.sketch.trace.to.draw.easy.drawing.art/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'WeDraw',
    //     url: 'https://console.firebase.google.com/project/lockscreen-drawing-c7950/crashlytics/app/android:lock.screen.drawing.lockscreen.draw.together.couple.widget/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Zoo Color',
    //     url: 'https://console.firebase.google.com/project/toddler-coloring/crashlytics/app/android:drawing.for.kids.baby.coloring.book.toddler.princess.animal.car/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'LearnToDraw',
    //     // Note: same project as Zoo Color above — verify if intentional
    //     url: 'https://console.firebase.google.com/project/toddler-coloring/crashlytics/app/android:drawing.for.kids.baby.coloring.book.toddler.princess.animal.car/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'EmojiBattery',
    //     url: 'https://console.firebase.google.com/project/emoji-battery--diy-cute-widget/crashlytics/app/android:com.emoji.battery.widget.cute.charging.custom.icon.diy.status.bar.dynamic/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'OS Launcher',
    //     url: 'https://console.firebase.google.com/project/launcher-os-391a5/crashlytics/app/android:com.launcher.os.theme.home.screen.launcherios.widget/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Widgets',
    //     url: 'https://console.firebase.google.com/project/widgets-theme-31b5d/crashlytics/app/android:com.widget.cute.theme.diy.icon.kawaii.wallpaper.aesthetic.custom.homescreen/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // },
    // {
    //     name: 'Tile Jigsaw',
    //     url: 'https://console.firebase.google.com/project/tile-jigsaw/crashlytics/app/android:tile.jigsaw.easy.spin.rotate.block.art.photo/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    // }
    {
        name: 'Cute Keyboard',
        url: 'https://console.firebase.google.com/u/0/project/cute-keyboard-2a90d/crashlytics/app/android:com.emoji.cutekeyboard.themes.fontkeyboard/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
        {
        name: 'Tattoo',
        url: 'https://console.firebase.google.com/u/0/project/diy-tattoo-desgin/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
      {
        name: 'Easy Piano',
        url: 'https://console.firebase.google.com/u/0/project/piano-learn-8976f/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
          {
        name: 'Live Charge Animation',
        url: 'https://console.firebase.google.com/u/0/project/live-charge-animation/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
           {
        name: 'Silly Smile',
        url: 'https://console.firebase.google.com/u/0/project/silly-wallpaper-b10c9/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
            {
        name: 'Wallpaper',
        url: 'https://console.firebase.google.com/u/0/project/live-wallpaper-e958a/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
               {
        name: 'RealGuitar',
        url: 'https://console.firebase.google.com/u/0/project/real-guitar---learn-guitar/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
                {
        name: 'RealGuitar',
        url: 'https://console.firebase.google.com/u/0/project/real-guitar---learn-guitar/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
                  {
        name: 'Mechanical Keyboard',
        url: 'https://console.firebase.google.com/u/0/project/mechanical-keyboard-e77e7/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
                      {
        name: 'Pets On Screen',
        url: 'https://console.firebase.google.com/u/0/project/pets-on-screen/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
                         {
        name: 'Glow Dots Art',
        url: 'https://console.firebase.google.com/u/0/project/glow-dots-art/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
                             {
        name: 'AI Jisaw',
        url: 'https://console.firebase.google.com/u/0/project/ai-jigsaw---classic-and-pixel/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
                               {
        name: 'Animation Maker',
        url: 'https://console.firebase.google.com/u/0/project/animation-maker-cartoon-studio/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
                                 {
        name: 'Prank Sound',
        url: 'https://console.firebase.google.com/u/0/project/prankapp--funny-prank-sound-fx/crashlytics/app/android:com.diy.design.desining.make.making.tattoo.art.ai/issues?state=open&time=24h&types=crash&tag=all&sort=eventCount'
    },
];

async function scrapeFirebase(page, appName, url) {
    console.log(chalk.blue(`[${appName}] Navigating...`));
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

    if (new URL(page.url()).hostname === 'accounts.google.com') throw new Error('Firebase session expired. Run npm run login:cloud and update the encrypted session.');

    console.log(chalk.cyan(`[${appName}] Waiting for data to load...`));
    // Smart wait: detect when % data appears, fallback to 20s timeout
    try {
        await page.waitForFunction(() => {
            return (document.body.innerText.match(/(\d+\.?\d*)\s*%/g) || []).length >= 4;
        }, undefined, { timeout: 20000 });
    } catch {
        console.log(chalk.yellow(`[${appName}] Timed out waiting for data, using current content...`));
    }
    await page.waitForTimeout(2000);

    const data = await page.evaluate(() => {
        const bodyText = document.body.innerText;
        const percentages = [];
        const percentPattern = /(\d+\.?\d*)\s*%/g;
        let m;
        while ((m = percentPattern.exec(bodyText)) !== null) {
            percentages.push(m[0].trim());
        }

        // Primary: search near "Crash-free users" / "Crash-free sessions" labels
        function findPercentNear(label) {
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
            let node;
            while (node = walker.nextNode()) {
                if (node.textContent.includes(label)) {
                    const parent = node.parentElement;
                    const match = parent.textContent.match(/(\d+\.?\d*)\s*%/);
                    if (match) return match[0];
                }
            }
            return null;
        }

        let crashFreeUsers = findPercentNear('Crash-free users');
        let crashFreeSessions = findPercentNear('Crash-free sessions');

        // Fallback: array index heuristic
        if (!crashFreeUsers) crashFreeUsers = percentages.length > 1 ? percentages[1] : 'N/A';
        if (!crashFreeSessions) crashFreeSessions = percentages.length > 3 ? percentages[3] : 'N/A';

        return {
            rawPercentages: percentages,
            crashFreeUsers,
            crashFreeSessions
        };
    });

    console.log(chalk.magenta(`[${appName}] % values:`, data.rawPercentages.join(', ')));
    console.log(chalk.green(`[${appName}] Users: ${data.crashFreeUsers} | Sessions: ${data.crashFreeSessions}`));
    if (data.crashFreeUsers === 'N/A' || data.crashFreeSessions === 'N/A') throw new Error('Missing Crashlytics metrics; check Firebase login.');
    return data;
}

async function writeSecondaryReport(results, serviceAccountAuth, dateStr) {
    const spreadsheetId = process.env.TRACKING_SPREADSHEET_ID || TRACKING_SPREADSHEET_ID;
    const tabId = Number(process.env.TRACKING_SHEET_ID || TRACKING_SHEET_ID);
    const doc = new GoogleSpreadsheet(spreadsheetId, serviceAccountAuth);
    await doc.loadInfo();
    const sheet = doc.sheetsById[tabId];
    if (!sheet) throw new Error('Tracking tab not found: ' + tabId);
    const plan = await writeTrackingSheet(sheet, results, dateStr);
    console.log(chalk.cyan(`Crash-Free Users written to "${sheet.title}": ${plan.updates.length} apps for ${dateStr}${plan.createColumn ? ' (new date column)' : ''}.`));
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit#gid=${tabId}&range=${sheet.getCell(1, plan.column).a1Address}`;
}

async function main() {
    console.log(chalk.bgBlue.white.bold('\n === STARTING REPORT RUN === \n'));

    const userDataDir = path.join(__dirname, 'browser-profile');
    const cloudState = process.env.FIREBASE_STORAGE_STATE;
    let browser;
    let context;
    if (cloudState) {
        // CI uses bundled Chromium and a portable session, never the Windows profile.
        browser = await chromium.launch({ headless: true });
        try {
            context = await browser.newContext({ storageState: cloudState });
        } catch (error) { await browser.close(); throw error; }
    } else {
        context = await chromium.launchPersistentContext(userDataDir, {
            headless: true,
            channel: 'chrome',
            ignoreDefaultArgs: ['--enable-automation'],
            args: ['--disable-blink-features=AutomationControlled']
        });
    }

    const page = await context.newPage();
    const results = [];

    const MAX_RETRIES = 2;

    async function scrapeWithRetry(app, attempt = 1) {
        try {
            const data = await scrapeFirebase(page, app.name, app.url);
            results.push({
                date: reportDate(),
                app: app.name,
                crashFreeUsers: data.crashFreeUsers,
                crashFreeSessions: data.crashFreeSessions
            });
        } catch (err) {
            if (attempt < MAX_RETRIES) {
                console.log(chalk.yellow(`[${app.name}] Retry ${attempt}/${MAX_RETRIES}...`));
                await page.waitForTimeout(3000);
                await scrapeWithRetry(app, attempt + 1);
            } else {
                console.error(chalk.red(`[${app.name}] Failed after ${MAX_RETRIES} attempts:`), err.message || err);
            }
        }
    }

    try {
        for (const app of APPS) {
            await scrapeWithRetry(app);
        }
    } finally {
        console.log(chalk.gray('Closing browser...'));
        try { await context.close(); } finally { await browser?.close(); }
    }

    console.log(chalk.green('\nData scraping completed. Starting to write to Google Sheets...'));

    if (results.length !== APPS.length) throw new Error('Incomplete report: an app could not be scraped.');
    if (!SPREADSHEET_ID) {
        console.warn(chalk.yellow('Skipping Google Sheets writing because SPREADSHEET_ID is not configured.'));
        // We can still try to send to Slack
        await sendSlackNotification(results, '');
        return;
    }

    try {
        const keyFilePath = path.join(__dirname, 'credentials', 'service-account.json');
        if (!fs.existsSync(keyFilePath)) {
            throw new Error('credentials/service-account.json file not found!');
        }

        const creds = JSON.parse(fs.readFileSync(keyFilePath, 'utf8'));
        const serviceAccountAuth = new JWT({
            email: creds.client_email,
            key: creds.private_key,
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });

        const doc = new GoogleSpreadsheet(SPREADSHEET_ID, serviceAccountAuth);
        await doc.loadInfo();
        console.log(chalk.green(`Successfully connected to Sheet: "${doc.title}"`));

        const sheet = SHEET_NAME
            ? (doc.sheetsByTitle[SHEET_NAME] || await doc.addSheet({ title: SHEET_NAME }))
            : doc.sheetsByIndex[0];
        const todayStr = reportDate();
        const requiredRows = APPS.length + 2;

        // Ensure we have enough columns and rows before loading cells
        // Check current dimensions
        let currentCols = sheet.gridProperties.columnCount;
        let currentRows = sheet.gridProperties.rowCount;

        // Load row 0 to find target column
        await sheet.loadCells({ startRowIndex: 0, endRowIndex: 1, startColumnIndex: 0, endColumnIndex: currentCols });

        let targetColIndex = 2; // Starts after A (Index) and B (App Name)
        while (targetColIndex < currentCols) {
            const cell = sheet.getCell(0, targetColIndex);
            if (!cell.value || cell.value === todayStr) {
                break;
            }
            targetColIndex += 2;
        }

        // Resize if needed
        if (targetColIndex + 2 > currentCols || requiredRows > currentRows) {
            await sheet.resize({
                rowCount: Math.max(currentRows, requiredRows),
                columnCount: Math.max(currentCols, targetColIndex + 2)
            });
        }

        // Load all required cells for updating
        await sheet.loadCells({
            startRowIndex: 0,
            endRowIndex: requiredRows,
            startColumnIndex: 0,
            endColumnIndex: targetColIndex + 2
        });

        // Setup Fixed Headers
        const headerIndex = sheet.getCell(0, 0);
        headerIndex.value = 'Số thứ tự';
        headerIndex.horizontalAlignment = 'CENTER';
        headerIndex.textFormat = { bold: true };

        const headerApp = sheet.getCell(0, 1);
        headerApp.value = 'Tên App';
        headerApp.horizontalAlignment = 'CENTER';
        headerApp.textFormat = { bold: true };

        sheet.getCell(1, 0).value = '';
        sheet.getCell(1, 1).value = '';

        // Setup Date Header
        const dateCell = sheet.getCell(0, targetColIndex);
        dateCell.value = todayStr;
        dateCell.textFormat = { bold: true };
        dateCell.horizontalAlignment = 'CENTER';

        // Setup Sub Headers
        const uCell = sheet.getCell(1, targetColIndex);
        uCell.value = 'Crash-Free Users';
        uCell.textFormat = { bold: true };
        uCell.horizontalAlignment = 'CENTER';

        const sCell = sheet.getCell(1, targetColIndex + 1);
        sCell.value = 'Crash-Free Sessions';
        sCell.textFormat = { bold: true };
        sCell.horizontalAlignment = 'CENTER';

        // Fill Data
        let hasData = false;
        for (let i = 0; i < APPS.length; i++) {
            const app = APPS[i];
            const rowIndex = i + 2;

            // Fixed columns
            const indexCell = sheet.getCell(rowIndex, 0);
            indexCell.value = i + 1;
            indexCell.horizontalAlignment = 'CENTER';

            const nameCell = sheet.getCell(rowIndex, 1);
            nameCell.value = app.name;
            nameCell.horizontalAlignment = 'CENTER';

            // App Data
            const result = results.find(r => r.app === app.name);
            if (result) {
                hasData = true;
                const userCell = sheet.getCell(rowIndex, targetColIndex);
                userCell.value = result.crashFreeUsers;
                userCell.horizontalAlignment = 'CENTER';

                // Formatting
                const valUser = parseFloat(result.crashFreeUsers);
                if (!isNaN(valUser)) {
                    if (valUser < 98.00) {
                        userCell.backgroundColor = { red: 0.98, green: 0.82, blue: 0.82 };
                    } else if (valUser < 99.00) {
                        userCell.backgroundColor = { red: 0.99, green: 0.95, blue: 0.8 };
                    } else {
                        userCell.backgroundColor = { red: 1, green: 1, blue: 1 };
                    }
                }

                const sessionCell = sheet.getCell(rowIndex, targetColIndex + 1);
                sessionCell.value = result.crashFreeSessions;
                sessionCell.horizontalAlignment = 'CENTER';
            }
        }

        await sheet.saveUpdatedCells();
        console.log(chalk.cyan('Data and formatting successfully written to Google Sheet!'));

        // Try merging cells for the date header
        try {
            await sheet.mergeCells({
                startRowIndex: 0, endRowIndex: 1,
                startColumnIndex: targetColIndex, endColumnIndex: targetColIndex + 2
            });
            console.log(chalk.cyan('Date cells merged successfully!'));
        } catch (e) {
            // Already merged or error
        }

        const trackingSheetUrl = await writeSecondaryReport(results, serviceAccountAuth, todayStr);

        console.log(chalk.bgGreen.white.bold('\n === COMPLETED ALL GOOGLE SHEET OPERATIONS! === \n'));

        function getColumnLetter(colIndex) {
            let letter = '';
            while (colIndex >= 0) {
                letter = String.fromCharCode(65 + (colIndex % 26)) + letter;
                colIndex = Math.floor(colIndex / 26) - 1;
            }
            return letter;
        }

        const targetColLetter = getColumnLetter(targetColIndex);
        const sheetId = sheet.sheetId;
        const sheetUrl = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/edit#gid=${sheetId}&range=${targetColLetter}1`;

        await sendSlackNotification(results, sheetUrl, todayStr, trackingSheetUrl);

    } catch (err) {
        console.error(chalk.red('MAIN ERROR WHILE WRITING TO GOOGLE SHEET:'), err.message);
        throw err;
    }
}

async function sendSlackNotification(results, sheetUrl, dateStr = reportDate(), trackingSheetUrl = '') {
    if (!SLACK_WEBHOOK_URL) {
        console.log(chalk.yellow('Skipping Slack notification because SLACK_WEBHOOK_URL is not configured.'));
        return;
    }

    if (results.length === 0) {
        console.log(chalk.yellow('No data found to send to Slack.'));
        return;
    }

    let messageText = `*Firebase Crashlytics Report ${dateStr}*\n` + results.map(r => `${r.app}: Users ${r.crashFreeUsers} | Sessions ${r.crashFreeSessions}`).join('\n');

    if (trackingSheetUrl) {
        messageText += `\n📊 <${trackingSheetUrl}|View Crash-free Tracking>`;
    }

    if (sheetUrl) {
        messageText += `\n📄 <${sheetUrl}|View Google Sheet>`;
    }

    try {
        console.log(chalk.cyan('Sending report to Slack/Telegram...'));

        const response = await fetch(SLACK_WEBHOOK_URL, {
            signal: AbortSignal.timeout(30000),
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                text: messageText
            })
        });

        if (response.ok) {
            console.log(chalk.green('Successfully sent report!'));
        } else {
            throw new Error('Slack returned status ' + response.status);
        }
    } catch (err) {
        throw new Error('Slack notification failed. Check webhook and network.');
    }
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
