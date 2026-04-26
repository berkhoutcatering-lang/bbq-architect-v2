/**
 * STAP 1 — Login handmatig, sessie opslaan (stealth-versie)
 * ──────────────────────────────────────────────────────────
 * Makro heeft een agressieve firewall (Metro WAF) die standaard Playwright-
 * Chromium direct detecteert aan "Chrome for Testing". Deze versie:
 *  - Gebruikt je EIGEN geïnstalleerde Chrome (channel: 'chrome'), niet Chromium
 *  - Verbergt navigator.webdriver (belangrijkste fingerprint-flag)
 *  - Stript AutomationControlled feature
 *  - Stuurt natuurlijke User-Agent
 *  - Gebruikt persistent user-data-dir zodat je cookies & fingerprint bewaard
 *    blijven tussen runs (minder verdacht dan telkens vers profiel)
 *
 * Run: npx tsx scripts/scrape-makro/login.ts
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { mkdirSync } from 'fs';
import * as readline from 'readline';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, 'chrome-profile');
const STATE_PATH = join(__dirname, 'storage-state.json');

function waitForEnter(prompt: string): Promise<void> {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    return new Promise(resolve => rl.question(prompt, () => { rl.close(); resolve(); }));
}

async function main() {
    console.log('\n🔐 Makro login flow (stealth mode)');
    console.log('──────────────────────────────────\n');

    mkdirSync(PROFILE_DIR, { recursive: true });

    /* Persistent context = Chrome onthoudt cookies/storage tussen runs.
       Veel natuurlijker dan elke keer vers profiel. */
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        channel: 'chrome',  /* Echte Google Chrome, niet "Chrome for Testing" */
        viewport: { width: 1400, height: 900 },
        locale: 'nl-NL',
        timezoneId: 'Europe/Amsterdam',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    });

    /* Verberg automation-flags voor elk script dat gaat lopen op de page */
    await context.addInitScript(() => {
        /* eslint-disable */
        // @ts-ignore
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // @ts-ignore
        window.chrome = window.chrome || { runtime: {} };
        /* eslint-enable */
    });

    const page = context.pages()[0] || await context.newPage();

    console.log('→ Browser opent producten.makro.nl...');
    console.log('   (als je nog steeds geblokkeerd bent: wacht 30-60 min, probeer dan opnieuw)\n');
    await page.goto('https://producten.makro.nl/', { waitUntil: 'domcontentloaded' });

    console.log('👉 LOG NU IN in de browser.');
    console.log('   Als je de prijzen ziet en bovenin je account-naam staat, is het gelukt.');
    console.log('   Kom dan terug naar deze terminal.\n');

    await waitForEnter('   Druk Enter als je ingelogd bent (of Ctrl-C om te stoppen) ');

    /* Sla storage-state OOK apart op — voor scrape.ts die een nieuwe context
       kan bouwen zonder de hele profile-dir mee te slepen */
    await context.storageState({ path: STATE_PATH });
    console.log(`\n✅ Sessie opgeslagen:`);
    console.log(`   - Persistent profile: ${PROFILE_DIR}`);
    console.log(`   - Storage-state snapshot: ${STATE_PATH}`);
    console.log('   (beide in .gitignore — nooit committen)');
    console.log('\n   Volgende stap: npx tsx scripts/scrape-makro/recon.ts\n');

    await context.close();
}

main().catch(e => {
    console.error('❌ Fout:', e);
    process.exit(1);
});
