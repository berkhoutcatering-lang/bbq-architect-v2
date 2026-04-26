/**
 * STAP 2 — Recon: onderzoek hoe Makro's webshop werkt (stealth-versie)
 * ─────────────────────────────────────────────────────────────────────
 * Gebruikt dezelfde persistent Chrome-profile als login.ts. Opent de
 * Kaas/Zuivel-categorie en logt alle XHR/fetch-calls + dumpt een product-card.
 *
 * Run: npx tsx scripts/scrape-makro/recon.ts
 */
import { chromium } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { writeFileSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, 'chrome-profile');
const TARGET_URL = 'https://producten.makro.nl/shop/category/vers/kaas-zuivel-eieren';

interface ApiCall {
    url: string;
    method: string;
    status?: number;
    contentType?: string;
    bodyPreview?: string;
    bodySize?: number;
}

async function main() {
    if (!existsSync(PROFILE_DIR)) {
        console.error('❌ Geen Chrome-profile gevonden. Run eerst: npx tsx scripts/scrape-makro/login.ts');
        process.exit(1);
    }

    console.log('\n🔍 Makro recon (stealth)');
    console.log('────────────────────────\n');
    console.log(`Target: ${TARGET_URL}\n`);

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: false,
        channel: 'chrome',
        viewport: { width: 1400, height: 900 },
        locale: 'nl-NL',
        timezoneId: 'Europe/Amsterdam',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    });

    await context.addInitScript(() => {
        /* eslint-disable */
        // @ts-ignore
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        // @ts-ignore
        window.chrome = window.chrome || { runtime: {} };
        /* eslint-enable */
    });

    const page = context.pages()[0] || await context.newPage();
    const apiCalls: ApiCall[] = [];

    page.on('response', async res => {
        const url = res.url();
        const req = res.request();
        const method = req.method();
        const status = res.status();
        const ct = (res.headers()['content-type'] || '').split(';')[0];
        const isInteresting = ct.includes('json') || ct.includes('graphql') || url.includes('/api/') || url.includes('/_next/data/');
        if (!isInteresting) return;
        if (url.includes('analytics') || url.includes('tracking') || url.includes('gtag') || url.includes('/log/')) return;

        let bodyPreview: string | undefined;
        let bodySize: number | undefined;
        try {
            const body = await res.text();
            bodySize = body.length;
            bodyPreview = body.slice(0, 400);
        } catch { /* non-text */ }

        apiCalls.push({ url, method, status, contentType: ct, bodyPreview, bodySize });
        console.log(`  [${method}] ${status} · ${ct} · ${bodySize ?? '?'} bytes · ${url.slice(0, 90)}`);
    });

    console.log('→ Pagina laden + scrollen om lazy-load te triggeren...\n');
    await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(3000);

    for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, 1200);
        await page.waitForTimeout(900 + Math.random() * 600);
    }
    await page.waitForTimeout(2000);

    console.log('\n→ Eerste product-card HTML zoeken...');
    const productHtml = await page.evaluate(() => {
        const priceNodes = Array.from(document.querySelectorAll('*')).filter(n => {
            const t = n.textContent?.trim() || '';
            return /excl\.?\s*btw/i.test(t) && t.length < 200;
        });
        if (priceNodes.length === 0) return null;
        let card: Element | null = priceNodes[0];
        for (let i = 0; i < 8 && card; i++) {
            card = card.parentElement;
            if (card && card.querySelectorAll('*').length > 15) break;
        }
        return card?.outerHTML.slice(0, 4000) || null;
    });

    const links = await page.evaluate(() => {
        return Array.from(document.querySelectorAll('a[href*="/shop/"]'))
            .map(a => (a as HTMLAnchorElement).href)
            .slice(0, 30);
    });

    const summary = {
        targetUrl: TARGET_URL,
        apiCalls: apiCalls.slice(0, 50),
        productCardHtml: productHtml,
        sampleLinks: links,
        pageTitle: await page.title(),
    };

    const outPath = join(__dirname, 'recon-output.json');
    writeFileSync(outPath, JSON.stringify(summary, null, 2));
    console.log(`\n✅ Recon opgeslagen: ${outPath}`);
    console.log(`   → ${apiCalls.length} interessante API-calls gelogd`);
    console.log(`   → Product-card HTML: ${productHtml ? 'gevonden' : 'NIET gevonden'}`);
    console.log(`   → Sample links: ${links.length}`);
    console.log('\n   Browser blijft 60s open — sluit zelf of druk Ctrl-C\n');

    await page.waitForTimeout(60000);
    await context.close();
}

main().catch(e => {
    console.error('❌ Fout:', e);
    process.exit(1);
});
