import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { baktotaalAdapter } from '../../../chrome-extension/adapters/baktotaal.js';
import { bidfoodAdapter } from '../../../chrome-extension/adapters/bidfood.js';
import { syntheticAdapter } from '../../../chrome-extension/adapters/synthetic.js';
import { detectAdapter } from '../../../chrome-extension/adapters/registry.js';
import { validateObservation } from './observationSchema';
import { computePricing, type PricingInput } from './pricing';
import { buildCheckpointDecisions, type CheckpointScope } from './checkpoint';

const FIX = 'chrome-extension/adapters/__fixtures__/baktotaal';
const readFix = (f: string) => JSON.parse(readFileSync(resolve(process.cwd(), FIX, f), 'utf8'));

const ctx = {
    supplierId: 42, supplierAccountKey: 'sha256:acct', adapterKey: 'baktotaal', adapterVersion: '1.0.0',
    extractionMethod: 'supplier_api', taxMode: 'ex_vat', currency: 'EUR', capturedAt: '2026-07-23T10:00:00.000Z',
};
function pricingOf(o: ReturnType<typeof validateObservation>['value']) {
    const i = o as NonNullable<typeof o>;
    const input: PricingInput = {
        priceBasis: i.priceBasis, packCount: i.packCount, contentPerItemQuantity: i.contentPerItemQuantity,
        contentPerItemUnit: i.contentPerItemUnit, totalBaseQuantity: i.totalBaseQuantity, baseUnit: i.baseUnit,
        regularPriceExVat: i.regularPriceExVat, promoPriceExVat: i.promoPriceExVat, variableWeight: i.variableWeight,
    };
    return computePricing(input);
}

describe('registry — domeinguard', () => {
    it('herkent Baktotaal, niet willekeurige sites', () => {
        expect(detectAdapter('https://www.baktotaal.nl/c/rookhout')?.key).toBe('baktotaal');
        expect(detectAdapter('https://getadblock.com')).toBeNull();
    });
});

describe('baktotaal.normalize → schema + prijs (fixtures)', () => {
    const page1 = readFix('category-page-1.json').result.products;

    it('BT-10001 (2,5 kg €22,50) → geldig, €9,00/kg', () => {
        const [obs] = baktotaalAdapter.normalize(page1[0], ctx);
        const v = validateObservation(obs);
        expect(v.ok).toBe(true);
        expect(v.value!.supplierSku).toBe('BT-10001');
        expect(v.value!.ean).toBe('8712345678901');
        expect(v.value!.productUrl).toBe('https://zakelijk.baktotaal.nl/beukenhouten-rookmot-2500');
        expect(v.value!.taxMode).toBe('ex_vat');
        expect(v.value!.vatPct).toBe('9');
        const pr = pricingOf(v.value);
        expect(pr.pricePerKg).toBe(9);
    });
    it('BT-10002 (24 × 330 ml €18,96) → €2,393939/L', () => {
        const [obs] = baktotaalAdapter.normalize(page1[1], ctx);
        const pr = pricingOf(validateObservation(obs).value);
        expect(pr.pricePerLiter).toBe(2.393939);
    });
    it('BT-10005 (750 g €8,25) → €11,00/kg', () => {
        const [obs] = baktotaalAdapter.normalize(page1[4], ctx);
        const pr = pricingOf(validateObservation(obs).value);
        expect(pr.pricePerKg).toBe(11);
    });

    const edge = readFix('edge-cases.json').result.products;
    it('variabel gewicht (per kg) → priceBasis kg, geen fictieve pak', () => {
        const [obs] = baktotaalAdapter.normalize(edge[0], ctx);
        const v = validateObservation(obs).value!;
        expect(v.priceBasis).toBe('kg');
        expect(v.variableWeight).toBe(true);
        const pr = pricingOf(v);
        expect(pr.pricePerKg).toBe(32.95);
        expect(pr.totalBaseQuantity).toBeNull();
    });
    it('actie: listPrice €21 > price €15 → regular 21, promo 15', () => {
        const [obs] = baktotaalAdapter.normalize(edge[1], ctx);
        const v = validateObservation(obs).value!;
        expect(v.regularPriceExVat).toBe('21.00');
        expect(v.promoPriceExVat).toBe('15.00');
        expect(v.vatPct).toBe('21');
    });
    it('prijs op aanvraag (null) → geen bruikbare prijs', () => {
        const [obs] = baktotaalAdapter.normalize(edge[2], ctx);
        const pr = pricingOf(validateObservation(obs).value);
        expect(pr.ok).toBe(false);
    });
});

describe('baktotaal.fetchTask — JSON-eerst, echte paginering', () => {
    const mkCtx = (fixture: string, status = 200) => ({
        ...ctx,
        fetchJson: async () => ({ json: readFix(fixture), status }),
    });
    it('pagina 1 → 5 records + volgende taak (page 2)', async () => {
        const r = await baktotaalAdapter.fetchTask(mkCtx('category-page-1.json'), { sourceCursor: JSON.stringify({ slug: 'rookhout', page: 1 }) });
        expect(r.records.length).toBe(5);
        expect(r.nextTasks.length).toBe(1);
        expect(r.nextTasks[0].sourceCursor).toBe(JSON.stringify({ slug: 'rookhout', page: 2 }));
    });
    it('laatste pagina (3/3) → geen volgende taak', async () => {
        const r = await baktotaalAdapter.fetchTask(mkCtx('edge-cases.json'), { sourceCursor: JSON.stringify({ slug: 'x', page: 3 }) });
        expect(r.nextTasks.length).toBe(0);
    });
    it('lege geldige pagina → 0 records, geen crash', async () => {
        const r = await baktotaalAdapter.fetchTask(mkCtx('empty-page.json'), { sourceCursor: JSON.stringify({ slug: 'x', page: 4 }) });
        expect(r.records.length).toBe(0);
    });
    it('loginfout → errorCode LOGIN_REQUIRED', async () => {
        const r = await baktotaalAdapter.fetchTask(mkCtx('login-required.json', 401), { sourceCursor: JSON.stringify({ slug: 'x', page: 1 }) });
        expect(r.errorCode).toBe('LOGIN_REQUIRED');
    });
});

describe('baktotaal.preflight', () => {
    it('ok met sample van 5 producten', async () => {
        const c = { ...ctx, fetchJson: async () => ({ json: readFix('category-page-1.json'), status: 200 }) };
        const pf = await baktotaalAdapter.preflight(c);
        expect(pf.ok).toBe(true);
        expect(pf.sample.length).toBe(5);
        expect(pf.accountKeyMasked).toBe('sha256…');
    });
    it('login vereist → ok:false LOGIN_REQUIRED', async () => {
        const c = { ...ctx, fetchJson: async () => ({ json: readFix('login-required.json'), status: 401 }) };
        const pf = await baktotaalAdapter.preflight(c);
        expect(pf.ok).toBe(false);
        expect(pf.code).toBe('LOGIN_REQUIRED');
    });
});

describe('baktotaal DOM-route — echte Magento-structuur (zakelijk portaal)', () => {
    // Simuleert de offscreen-output {records,next} zoals live bevestigd.
    const domCtx = {
        ...ctx, adapterVersion: '1.1.0',
        fetchText: async () => '<html><body>prijzen zichtbaar, ingelogd</body></html>',
        parseHtml: async () => ({
            records: [
                { name: 'Franse Tarwebloem T65 1kg (Emilie Girardeau)', priceText: '13.62', url: 'https://zakelijk.baktotaal.nl/franse-tarwebloem-t65-1kg-emilie-girardeau', sku: '16811' },
                { name: 'Tarwebloem 405 (10 kg)', priceText: '13.20', url: 'https://zakelijk.baktotaal.nl/tarwebloem-405-10-kg', sku: '16812' },
            ],
            next: 'https://zakelijk.baktotaal.nl/grondstoffen-en-ingredienten/bloem-en-meel?p=2',
        }),
    };
    const cursor = JSON.stringify({ slug: 'grondstoffen-en-ingredienten/bloem-en-meel', page: 1 });

    it('fetchTask leest kaarten + echte ?p=2 next-taak', async () => {
        const r = await baktotaalAdapter.fetchTask(domCtx, { sourceCursor: cursor });
        expect(r.records.length).toBe(2);
        expect(r.nextTasks.length).toBe(1);
        expect(r.nextTasks[0].sourceUrl).toContain('?p=2');
        expect(r.diagnostics.method).toBe('dom');
    });

    it('normalize: SKU=data-product-id, verpakking uit naam, €13,62/kg', () => {
        const [obs] = baktotaalAdapter.normalize({ name: 'Franse Tarwebloem T65 1kg (Emilie Girardeau)', priceText: '13.62', url: 'https://zakelijk.baktotaal.nl/franse-tarwebloem-t65-1kg-emilie-girardeau', sku: '16811' }, domCtx);
        const v = validateObservation(obs).value!;
        expect(v.supplierSku).toBe('16811');
        expect(v.productUrl).toBe('https://zakelijk.baktotaal.nl/franse-tarwebloem-t65-1kg-emilie-girardeau');
        expect(v.taxMode).toBe('ex_vat');
        expect(pricingOf(v).pricePerKg).toBe(13.62);
    });

    it('normalize: "(10 kg)" uit naam → €1,32/kg', () => {
        const [obs] = baktotaalAdapter.normalize({ name: 'Tarwebloem 405 (10 kg)', priceText: '13.20', url: 'https://zakelijk.baktotaal.nl/tarwebloem-405-10-kg', sku: '16812' }, domCtx);
        expect(pricingOf(validateObservation(obs).value).pricePerKg).toBe(1.32);
    });

    it('DOM-actie: oldPrice > finalPrice → regulier 6,00 + promo 4,50', () => {
        const [obs] = baktotaalAdapter.normalize({ name: 'BBQ-saus 1 kg', priceText: '4.50', regularPriceText: '6.00', url: 'https://zakelijk.baktotaal.nl/bbq-saus', sku: '999' }, domCtx);
        const v = validateObservation(obs).value!;
        expect(v.regularPriceExVat).toBe('6.00');
        expect(v.promoPriceExVat).toBe('4.50');
        expect(pricingOf(v).pricePerKg).toBe(4.5); // effectief = promo, 1 kg
    });

    it('niet ingelogd ("om prijzen te bekijken") → LOGIN_REQUIRED', async () => {
        const loginCtx = { ...domCtx, fetchText: async () => '<div class="loginlink">Registreer/Log in om prijzen te bekijken</div>' };
        const r = await baktotaalAdapter.fetchTask(loginCtx, { sourceCursor: cursor });
        expect(r.errorCode).toBe('LOGIN_REQUIRED');
    });

    it('discover volgt scope-categorieën', async () => {
        const tasks = await baktotaalAdapter.discover({ ...domCtx, categories: ['zuivel', 'vlees'] });
        expect(tasks.map((t) => t.sourceCursor)).toEqual([
            JSON.stringify({ slug: 'zuivel', page: 1 }),
            JSON.stringify({ slug: 'vlees', page: 1 }),
        ]);
    });

    it('preflight (DOM) → ok met sample', async () => {
        const pf = await baktotaalAdapter.preflight(domCtx);
        expect(pf.ok).toBe(true);
        expect(pf.sample.length).toBe(2);
        expect(pf.taxMode).toBe('ex_vat');
    });
});

describe('bidfood DOM-route (ATG/Endeca, server-rendered)', () => {
    const bctx = { ...ctx, adapterKey: 'bidfood', adapterVersion: '1.0.0' };

    it('registry herkent Bidfood', () => {
        expect(detectAdapter('https://www.bidfood.nl/webshop/assortiment/vlees')?.key).toBe('bidfood');
    });

    it('normalize: SKU=data-sku-id, jsessionid gestript uit URL', () => {
        const [obs] = bidfoodAdapter.normalize({
            name: 'Kipfilet 5 kg', priceText: '42.00', sku: '125163DJ',
            url: 'https://www.bidfood.nl/webshop/product/kipfilet-5-kg/_/A-productId-1-125163DJ;jsessionid_jboss=abc.worker10prodwebshop',
        }, bctx);
        const v = validateObservation(obs).value!;
        expect(v.supplierSku).toBe('125163DJ');
        expect(v.productUrl).toBe('https://www.bidfood.nl/webshop/product/kipfilet-5-kg/_/A-productId-1-125163DJ');
        expect(v.taxMode).toBe('ex_vat');
        expect(pricingOf(v).pricePerKg).toBe(8.4); // 42,00 / 5 kg
    });

    it('normalize: "80 gr per stuk, doosje 10 stuks" → 10 × 80 g → €/kg klopt', () => {
        const [obs] = bidfoodAdapter.normalize({
            name: 'Rundercarpaccio 80 gr per stuk, doosje 10 stuks', priceText: '18.40', sku: '125163DJ',
            url: 'https://www.bidfood.nl/webshop/product/rundercarpaccio/_/A-productId-1-125163DJ',
        }, bctx);
        const v = validateObservation(obs).value!;
        expect(v.packCount).toBe('10');
        expect(v.contentPerItemQuantity).toBe('80');
        expect(v.contentPerItemUnit).toBe('g');
        expect(pricingOf(v).pricePerKg).toBe(23); // 18,40 / 0,8 kg
    });

    it('onduidelijke verpakking → geen gegokte prijs (naar review)', () => {
        const [obs] = bidfoodAdapter.normalize({
            name: 'Rundercarpaccio (vers)', priceText: '18.40', sku: '999DJ',
            url: 'https://www.bidfood.nl/webshop/product/x/_/A-productId-1-999DJ',
        }, bctx);
        const pr = pricingOf(validateObservation(obs).value);
        expect(pr.ok).toBe(false); // priceBasis unknown → review, nooit auto-geprijsd
    });

    it('normalize: "/Kilo"-prijs → priceBasis kg, per kg direct', () => {
        const [obs] = bidfoodAdapter.normalize({
            name: 'Entrecote (vers)', priceText: '13,70', priceUnit: 'kilo', sku: 'E1DJ',
            url: 'https://www.bidfood.nl/webshop/product/e/_/A-productId-1-E1DJ',
        }, bctx);
        const v = validateObservation(obs).value!;
        expect(v.priceBasis).toBe('kg');
        expect(pricingOf(v).pricePerKg).toBe(13.7);
    });

    it('discover start bij pagina 0 (No=0) en stript de pagineer-parameters', async () => {
        const dctx = { ...bctx, getTabUrl: async () => 'https://www.bidfood.nl/webshop/assortiment/vlees/_/N-8o7?No=96&Nrpp=96&currentPage=2' };
        const tasks = await bidfoodAdapter.discover(dctx);
        expect(tasks.length).toBe(1);
        const cur = JSON.parse(tasks[0].sourceCursor);
        expect(cur.No).toBe(0);
        expect(cur.base).toBe('https://www.bidfood.nl/webshop/assortiment/vlees/_/N-8o7'); // paging weg
        expect(tasks[0].sourceUrl).toContain('No=0');
    });

    it('fetchTask leest één pagina (readPage) en zet de volgende pagina uit', async () => {
        const pageCtx = {
            ...bctx,
            readPage: async () => ({ records: [
                { name: 'A 1 kg', priceText: '5,00', priceUnit: '', sku: 'A1DJ', url: '/webshop/product/a/_/A-productId-1-A1DJ' },
                { name: 'B 2 kg', priceText: '6,00', priceUnit: '', sku: 'B1DJ', url: '/webshop/product/b/_/A-productId-1-B1DJ' },
            ], total: 5 }),
        };
        const task = { sourceCursor: JSON.stringify({ No: 0, Nrpp: 96, base: 'https://www.bidfood.nl/webshop/assortiment/vlees/_/N-8o7' }) };
        const r = await bidfoodAdapter.fetchTask(pageCtx, task);
        expect(r.records.length).toBe(2);
        expect(r.nextTasks.length).toBe(1);
        expect(JSON.parse(r.nextTasks[0].sourceCursor).No).toBe(2); // stapt met werkelijk getoonde aantal
        expect(r.nextTasks[0].sourceUrl).toContain('No=2');
        expect(r.diagnostics.method).toBe('url-page');
    });

    it('fetchTask stopt (geen next-taak) zodra het totaal bereikt is', async () => {
        const pageCtx = {
            ...bctx,
            readPage: async () => ({ records: [
                { name: 'A 1 kg', priceText: '5,00', priceUnit: '', sku: 'A1DJ', url: '/x' },
                { name: 'B 2 kg', priceText: '6,00', priceUnit: '', sku: 'B1DJ', url: '/y' },
            ], total: 2 }),
        };
        const task = { sourceCursor: JSON.stringify({ No: 0, Nrpp: 96, base: 'https://www.bidfood.nl/webshop/assortiment/vlees/_/N-8o7' }) };
        const r = await bidfoodAdapter.fetchTask(pageCtx, task);
        expect(r.records.length).toBe(2);
        expect(r.nextTasks).toEqual([]); // 0 + 2 >= totaal(2) → klaar
    });

    it('preflight (readTab): producten zonder prijs → PERSONAL_PRICE_NOT_VISIBLE', async () => {
        const tabCtx = { ...bctx, readTab: async () => ({ records: [{ name: 'A 1 kg', priceText: '', priceUnit: '', sku: 'A1DJ', url: '/x' }] }) };
        const pf = await bidfoodAdapter.preflight(tabCtx);
        expect(pf.ok).toBe(false);
        expect(pf.code).toBe('PERSONAL_PRICE_NOT_VISIBLE');
    });

    it('preflight (readTab): met prijzen → ok + sample', async () => {
        const tabCtx = { ...bctx, readTab: async () => ({ records: [{ name: 'Kipfilet 5 kg', priceText: '42,00', priceUnit: '', sku: 'K1DJ', url: 'https://www.bidfood.nl/webshop/product/k/_/A-productId-1-K1DJ' }] }) };
        const pf = await bidfoodAdapter.preflight(tabCtx);
        expect(pf.ok).toBe(true);
        expect(pf.sample.length).toBe(1);
    });
});

describe('synthetic adapter — deterministische paginering', () => {
    it('discover + fetchTask doorlopen 3 pagina’s, 12 records', async () => {
        const sctx = { ...ctx, adapterKey: 'synthetic' };
        const tasks = await syntheticAdapter.discover();
        expect(tasks.length).toBe(1);
        let all: unknown[] = [];
        let queue = [...tasks];
        const seen = new Set<string>();
        while (queue.length) {
            const t = queue.shift()!;
            if (seen.has(t.idempotencyKey)) continue;
            seen.add(t.idempotencyKey);
            const r = await syntheticAdapter.fetchTask(sctx, t);
            all = all.concat(r.records);
            queue = queue.concat(r.nextTasks);
        }
        expect(all.length).toBe(12);
    });
});

describe('einde-tot-eind: extensie-adapter → server-canon', () => {
    it('Baktotaal-pagina volledig door buildCheckpointDecisions', () => {
        const page1 = readFix('category-page-1.json').result.products;
        const observations = page1.flatMap((rec: unknown) => baktotaalAdapter.normalize(rec, ctx));
        const scope: CheckpointScope = { organizationId: 'org-1', supplierId: 42, supplierAccountKey: 'sha256:acct', adapterKnownActive: true };
        const { decisions, summary } = buildCheckpointDecisions(observations, scope);
        expect(summary.accepted).toBe(5); // alle 5 met SKU, bekende BTW, volledige verpakking
        const rookmot = decisions.find((d) => (d.observation.supplier_sku as string) === 'BT-10001')!;
        expect(rookmot.validation_status).toBe('accepted');
        expect(rookmot.price!.price_per_kg_ex_vat).toBe(9);
        expect(rookmot.price!.effective_price_cents).toBe(2250);
    });
});
