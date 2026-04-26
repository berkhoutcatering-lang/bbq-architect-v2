/**
 * STAP 3 — De echte scrape
 * ─────────────────────────
 * Gebruikt de ontdekte API's (articlesearch/search + betty-variants) om
 * alle producten + prijzen per categorie op te halen. Schrijft output als
 * JSON naar data/makro-{categorie}.json (kun je later uploaden via de UI).
 *
 * Run:
 *   npx tsx scripts/scrape-makro/scrape.ts                 # alle categorieën
 *   npx tsx scripts/scrape-makro/scrape.ts kaas-zuivel     # alleen 1 categorie
 *
 * Flags:
 *   --push        Pusht direct naar /api/pricelist-sync (vereist dev-server)
 *   --limit=N     Stop na N producten (voor testen)
 */
import { chromium, BrowserContext } from 'playwright';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = join(__dirname, 'chrome-profile');
const DATA_DIR = join(__dirname, 'data');
const CATEGORIES_PATH = join(__dirname, 'categories.json');

const BASE = 'https://producten.makro.nl';
const ROWS_PER_PAGE = 24;                /* 24 lijkt de maximum per page */
const DELAY_BETWEEN_REQUESTS_MS = 800;   /* 0.8s random ±400ms = menselijk tempo */
const DELAY_JITTER_MS = 400;
const BATCH_VARIANT_SIZE = 12;           /* hoeveel IDs per betty-variants call */

type Category = { id: string; label: string };
type ScrapeConfig = { storeId: string; customerId: string; locale: string };

function randomDelay(): Promise<void> {
    const ms = DELAY_BETWEEN_REQUESTS_MS + Math.random() * DELAY_JITTER_MS;
    return new Promise(r => setTimeout(r, ms));
}

function chunk<T>(arr: T[], size: number): T[][] {
    const out: T[][] = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
}

/** Parse naar YYYYMMDD voor de API's deliveryDate param */
function today(): string {
    const d = new Date();
    return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

/** Haal customerId + storeId uit de live sessie-context (via homepage) */
async function detectConfig(context: BrowserContext): Promise<ScrapeConfig> {
    const res = await context.request.get(`${BASE}/cia/businessaccounts/accountSwitchData/country/NL`, {
        headers: { accept: 'application/json' },
    });
    if (!res.ok()) throw new Error(`accountSwitchData: ${res.status()}`);
    const body = await res.json() as any;
    /* Het customer ID zit in de JWT die bij login wordt opgehaald, maar hier halen
       we het uit de customer data endpoint — eenvoudiger. */
    const customerRes = await context.request.get(
        `${BASE}/ordercapture/checkout/customer/NL/0/1?__t=${Date.now()}`,
        { headers: { accept: 'application/json' } }
    );
    /* Als eerste path faalt proberen we uit account data te trekken */
    let customerId: string | null = null;
    if (customerRes.ok()) {
        const cd = await customerRes.json() as any;
        customerId = cd?.data?.customerId || null;
    }
    /* Fallback: uit storage-state via een GET op een andere endpoint */
    if (!customerId) {
        /* Laatste redmiddel: uit het eerste beschikbare cart */
        const cartsRes = await context.request.get(`${BASE}/ordercapture/customercart/carts/alias/current?country=NL&__t=${Date.now()}`);
        if (cartsRes.ok()) {
            const cd = await cartsRes.json() as any;
            customerId = cd?.data?.customerId || null;
        }
    }
    if (!customerId) throw new Error('Kon customerId niet detecteren — opnieuw inloggen?');

    /* storeId lezen we uit de eerste account */
    const account = body?.accountData?.[0] || {};
    const storeId = account?.homeStore || account?.storeId || '00010';

    return { storeId, customerId, locale: 'nl-NL' };
}

/** Pagineer articlesearch voor één categorie, verzamel alle article-IDs */
async function fetchAllArticleIds(context: BrowserContext, cfg: ScrapeConfig, category: Category, limit?: number): Promise<string[]> {
    const ids: string[] = [];
    let page = 1;
    let total = Infinity;

    while (ids.length < total) {
        const url = new URL(`${BASE}/searchdiscover/articlesearch/search`);
        url.searchParams.set('storeId', cfg.storeId);
        url.searchParams.set('language', cfg.locale);
        url.searchParams.set('country', 'NL');
        url.searchParams.set('query', '*');
        url.searchParams.set('rows', String(ROWS_PER_PAGE));
        url.searchParams.set('page', String(page));
        url.searchParams.set('filter', `category:${category.id}`);
        url.searchParams.set('facets', 'false');
        url.searchParams.set('categories', 'false');
        url.searchParams.set('customerId', cfg.customerId);
        url.searchParams.set('__t', String(Date.now()));

        const res = await context.request.get(url.toString(), { headers: { accept: 'application/json' } });
        if (!res.ok()) throw new Error(`articlesearch ${category.id} page ${page}: HTTP ${res.status()}`);
        const body = await res.json() as any;

        total = body.amount || 0;
        const resultIds: string[] = body.resultIds || [];
        if (resultIds.length === 0) break;
        ids.push(...resultIds);

        process.stdout.write(`\r    → ${category.label}: ${ids.length}/${total} IDs`);
        if (limit && ids.length >= limit) { ids.length = limit; break; }
        if (ids.length >= total) break;
        page++;
        await randomDelay();
    }
    process.stdout.write('\n');
    return ids;
}

/** Haal voor een batch van 12 article-IDs alle variant-details op */
async function fetchVariants(context: BrowserContext, cfg: ScrapeConfig, ids: string[]): Promise<any[]> {
    const url = new URL(`${BASE}/evaluate.article.v1/betty-variants`);
    url.searchParams.set('storeIds', cfg.storeId);
    for (const id of ids) url.searchParams.append('ids', id);
    url.searchParams.set('country', 'NL');
    url.searchParams.set('locale', cfg.locale);
    url.searchParams.set('customerId', cfg.customerId);
    url.searchParams.set('deliveryDate', today());
    url.searchParams.set('__t', String(Date.now()));

    const res = await context.request.get(url.toString(), { headers: { accept: 'application/json' } });
    if (!res.ok()) throw new Error(`betty-variants: HTTP ${res.status()}`);
    const body = await res.json() as any;
    const result = body?.result || {};
    return Object.values(result);
}

interface MakroProduct {
    product_naam: string;
    prijs: number;
    eenheid: string;
    categorie: string;
    _raw?: any;
}

/** Transformeer ruwe betty-variant naar onze format */
function transform(variantRoot: any, categoryLabel: string): MakroProduct[] {
    const out: MakroProduct[] = [];
    const variants = variantRoot?.variants || {};
    for (const [, variant] of Object.entries<any>(variants)) {
        const description = variant?.description || '';
        if (!description) continue;

        /* Prijs: zoek in verschillende mogelijke velden — de API heeft meerdere
           price-types. unitNet / listNet zijn typisch de "prijs per stuk excl BTW". */
        let prijs: number | null = null;
        const priceCandidates = [
            variant?.price?.sellingPrice?.unitNet?.amount,
            variant?.price?.listPrice?.unitNet?.amount,
            variant?.price?.unitNet?.amount,
            variant?.prices?.selling?.amount,
            variant?.prices?.list?.amount,
            variant?.basePrice?.amount,
        ];
        for (const c of priceCandidates) {
            if (typeof c === 'number' && c > 0) { prijs = c; break; }
        }
        if (prijs === null) {
            /* Deep-fallback: walk the object for een numeric "amount" naast "net"/"selling" */
            const walk = (obj: any, depth = 0): number | null => {
                if (!obj || depth > 6) return null;
                if (typeof obj === 'object') {
                    for (const [k, v] of Object.entries(obj)) {
                        if (k === 'unitNet' && v && typeof (v as any).amount === 'number') return (v as any).amount;
                        const rec = walk(v, depth + 1);
                        if (rec !== null) return rec;
                    }
                }
                return null;
            };
            prijs = walk(variant);
        }
        if (prijs === null || prijs <= 0) continue;

        /* Eenheid: uit baseUnit / saleUnit / orderUnit */
        let eenheid = variant?.baseUnit?.description
            || variant?.saleUnit?.description
            || variant?.orderUnit?.description
            || variant?.bundle?.description
            || 'stuks';
        eenheid = String(eenheid).toLowerCase().trim();

        /* Categorie: groep-naam of de user-label */
        const categorie = variant?.group?.groupName
            || variant?.group?.mainGroupName
            || categoryLabel;

        out.push({
            product_naam: description.trim(),
            prijs: Number(prijs),
            eenheid,
            categorie: String(categorie).trim(),
            _raw: process.env.SCRAPE_DEBUG ? variant : undefined,
        });
    }
    return out;
}

async function scrapeCategory(
    context: BrowserContext,
    cfg: ScrapeConfig,
    category: Category,
    limit?: number,
): Promise<MakroProduct[]> {
    console.log(`\n📦 ${category.label}  (${category.id})`);
    const ids = await fetchAllArticleIds(context, cfg, category, limit);
    if (ids.length === 0) {
        console.log('   (geen producten gevonden)');
        return [];
    }

    const products: MakroProduct[] = [];
    const batches = chunk(ids, BATCH_VARIANT_SIZE);
    let done = 0;
    for (const batch of batches) {
        try {
            const variants = await fetchVariants(context, cfg, batch);
            for (const v of variants) {
                products.push(...transform(v, category.label));
            }
        } catch (e: any) {
            console.log(`\n   ⚠️  batch fout: ${e?.message}`);
        }
        done += batch.length;
        process.stdout.write(`\r    → ${category.label}: ${done}/${ids.length} details opgehaald (${products.length} prijzen)`);
        await randomDelay();
    }
    process.stdout.write('\n');
    return products;
}

async function pushToSync(
    leverancier: string,
    producten: MakroProduct[],
    syncUrl: string,
): Promise<void> {
    /* Strip _raw voor push */
    const clean = producten.map(p => ({
        product_naam: p.product_naam,
        prijs: p.prijs,
        eenheid: p.eenheid,
        categorie: p.categorie,
    }));

    const res = await fetch(syncUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leverancier, producten: clean }),
    });
    if (!res.ok) {
        const txt = await res.text();
        throw new Error(`Sync failed: HTTP ${res.status} — ${txt.slice(0, 500)}`);
    }
    const body = await res.json();
    console.log(`   ✅ Sync: ${JSON.stringify(body.stats || body)}`);
}

async function main() {
    const args = process.argv.slice(2);
    const doPush = args.includes('--push');
    const limitArg = args.find(a => a.startsWith('--limit='));
    const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) : undefined;
    const categoryFilter = args.find(a => !a.startsWith('--'));
    const syncUrl = process.env.SCRAPE_SYNC_URL || 'http://localhost:3000/api/pricelist-sync';

    if (!existsSync(PROFILE_DIR)) {
        console.error('❌ Geen chrome-profile. Run eerst: npx tsx scripts/scrape-makro/login.ts');
        process.exit(1);
    }
    mkdirSync(DATA_DIR, { recursive: true });

    const allCategories: Category[] = JSON.parse(readFileSync(CATEGORIES_PATH, 'utf8'));
    const categories = categoryFilter
        ? allCategories.filter(c => c.id.includes(categoryFilter) || c.label.toLowerCase().includes(categoryFilter.toLowerCase()))
        : allCategories;

    if (categories.length === 0) {
        console.error(`❌ Geen categorie gevonden voor '${categoryFilter}'. Beschikbaar:`);
        allCategories.forEach(c => console.error(`   - ${c.id}  (${c.label})`));
        process.exit(1);
    }

    console.log('\n🛒 Makro scraper');
    console.log('─────────────────');
    console.log(`Categorieën: ${categories.length} × · Limit: ${limit ?? 'geen'} · Push: ${doPush}`);

    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,   /* Geen UI meer nodig — alle calls via request-API */
        channel: 'chrome',
        locale: 'nl-NL',
        timezoneId: 'Europe/Amsterdam',
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        args: [
            '--disable-blink-features=AutomationControlled',
            '--disable-features=IsolateOrigins,site-per-process',
        ],
    });
    /* Warm-up: haal homepage op zodat session-cookies ingesteld zijn */
    const warmupPage = await context.newPage();
    await warmupPage.goto(`${BASE}/`, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await warmupPage.waitForTimeout(2000);
    await warmupPage.close();

    const cfg = await detectConfig(context);
    console.log(`\n⚙️  Config: storeId=${cfg.storeId} customerId=${cfg.customerId}`);

    const allProducts: Record<string, MakroProduct[]> = {};
    for (const cat of categories) {
        try {
            const prods = await scrapeCategory(context, cfg, cat, limit);
            allProducts[cat.id] = prods;
            const outPath = join(DATA_DIR, `makro-${cat.id.replace(/\//g, '_')}.json`);
            writeFileSync(outPath, JSON.stringify(prods, null, 2));
            console.log(`   💾 ${prods.length} producten → ${outPath}`);
        } catch (e: any) {
            console.log(`\n   ❌ ${cat.label}: ${e?.message}`);
        }
    }

    /* Totaal-dump */
    const flatAll = Object.values(allProducts).flat();
    writeFileSync(join(DATA_DIR, 'makro-all.json'), JSON.stringify(flatAll, null, 2));
    console.log(`\n📊 Totaal: ${flatAll.length} producten over ${categories.length} categorieën`);
    console.log(`   → data/makro-all.json`);

    if (doPush) {
        console.log('\n📤 Pushen naar /api/pricelist-sync...');
        await pushToSync('Makro Nederland', flatAll, syncUrl);
    } else {
        console.log('\n💡 Tip: voeg --push toe om direct naar je bbq-architect-v2 te syncen');
        console.log('   (vereist dat je lokaal op http://localhost:3000 draait + ingelogd bent)');
    }

    await context.close();
}

main().catch(e => {
    console.error('\n❌ Fout:', e);
    process.exit(1);
});
