/**
 * De kassacatalogus (27 oktober 2026): upsert op slug, voorstelprijzen als
 * concept, btw-regels, null-allergenen blijven null, niet actief in plaats van
 * verwijderen. Draait de echte catalogus mee als die naast de repo staat
 * (KASSA_CATALOGUS of het vaste pad).
 */
import fs from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
    CatalogusFout, STANDAARD_KEUZES, controleer, leesCatalogus, maakPlan,
    type Actie, type KassaArtikel, type LiveArtikel, type LiveProduct, type LiveStand,
} from './kassaCatalogus';

const ORG = '0f8c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f';
const BRON = process.env.KASSA_CATALOGUS
    ?? '/Users/mathi/Documents/Hop&Bites bedrijf/07 Marketing/Website en teksten/websites nieuw makerij/KASSA-CATALOGUS/catalogus.json';

function artikel(over: Partial<KassaArtikel> & { slug: string }): KassaArtikel {
    return {
        naam: over.slug, kassagroep: 'Vers vlees', subgroep: null, eenheid: 'per stuk', verkoopt_per: 'stuk',
        prijs: 2.5, prijs_per_kg: null, prijs_status: 'bevestigd', btw: 9, alcohol_pct: null, leeftijd_18: false,
        bewaren_als: 'koel', allergenen: null, ingredienten: null, bewaren: null, inhoud: null, foto: null, ean: null,
        op_de_website: false, details: {},
        ...over,
    };
}
const bier = (over: Partial<KassaArtikel> & { slug: string }) => artikel({
    kassagroep: 'Bier', eenheid: 'fles 33 cl', btw: 21, alcohol_pct: 8, leeftijd_18: true, bewaren_als: 'kamertemperatuur',
    op_de_website: true, prijs_status: 'op-de-site', details: { brouwerij: 'Achel', stijl: 'tripel', verpakking: { soort: 'fles', cl: 33 } },
    ...over,
});

function liveArtikel(over: Partial<LiveArtikel> & { slug: string }): LiveArtikel {
    return {
        id: `a-${over.slug}`, naam: over.slug, eenheid: 'per stuk', prijs_cents: null, btw_pct: 9, btw_verdeling: null,
        actief: false, kanalen: ['webshop'], toonbank_groep: null, toonbank_volgorde: 0, ...over,
    };
}
function liveProduct(over: Partial<LiveProduct> & { slug: string }): LiveProduct {
    return {
        id: `p-${over.slug}`, naam: over.slug, type: 'vleeswaar', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents: null,
        btw_pct: 9, alcohol_pct: null, allergenen: null, ingredienten: null, bewaren: null, foto: null, statiegeld_cents: 0, ...over,
    };
}
const leeg: LiveStand = { producten: [], artikelen: [], slots: [] };

function vind<S extends Actie['soort']>(acties: Actie[], soort: S, slug: string) {
    return acties.find((a) => a.soort === soort && a.slug === slug) as Extract<Actie, { soort: S }> | undefined;
}

describe('upsert op slug', () => {
    it('maakt product, artikel en één slot voor een nieuw los product', () => {
        const plan = maakPlan([artikel({ slug: 'riblap' })], leeg, ORG);
        const n = vind(plan.acties, 'nieuw', 'riblap')!;
        expect(n.product).toMatchObject({ slug: 'riblap', type: 'vleeswaar', pagina_status: 'geen', winkelprijs_incl_cents: 250, btw_pct: 9 });
        expect(n.artikel).toMatchObject({ slug: 'riblap', prijs_cents: 250, actief: true, kanalen: ['toonbank'], toonbank_groep: 'Vers vlees', toonbank_volgorde: 1 });
        expect(n.slot).toMatchObject({ hoeveelheid: 1, eenheid: 'stuk', slot_type: 'vleeswaar' });
    });

    it('werkt een bestaand artikel bij op slug, zonder iets te hernoemen aan het product', () => {
        const live: LiveStand = {
            producten: [liveProduct({ slug: 'rundergehakt', naam: 'Rundergehakt', eenheid: 'gram', prijs_per: 100 })],
            artikelen: [liveArtikel({ slug: 'rundergehakt', naam: 'Rundergehakt', eenheid: 'per 100 gram' })],
            slots: [{ id: 's1', artikel_id: 'a-rundergehakt', standaard_product_id: 'p-rundergehakt' }],
        };
        const plan = maakPlan([artikel({ slug: 'rundergehakt', naam: 'Rundergehakt', eenheid: 'per 100 gram', verkoopt_per: 'gewicht', prijs: 1.99, prijs_per_kg: 19.9 })], live, ORG);
        expect(plan.acties.filter((a) => a.soort === 'nieuw')).toHaveLength(0);
        const b = vind(plan.acties, 'bijwerken', 'rundergehakt')!;
        expect(b.artikelPatch).toMatchObject({ prijs_cents: 199, actief: true, kanalen: ['webshop', 'toonbank'] });
        expect(b.productPatch).toMatchObject({ winkelprijs_incl_cents: 199 });
        expect(b.productPatch).not.toHaveProperty('naam');
        expect(b.slot).toBeNull();
    });

    it('doet niets als alles al gelijk is', () => {
        const live: LiveStand = {
            producten: [liveProduct({ slug: 'riblap', winkelprijs_incl_cents: 250 })],
            artikelen: [liveArtikel({ slug: 'riblap', prijs_cents: 250, actief: true, kanalen: ['webshop', 'toonbank'], toonbank_groep: 'Vers vlees', toonbank_volgorde: 1 })],
            slots: [{ id: 's1', artikel_id: 'a-riblap', standaard_product_id: 'p-riblap' }],
        };
        const plan = maakPlan([artikel({ slug: 'riblap' })], live, ORG);
        expect(plan.acties).toEqual([]);
        expect(plan.regels[0]).toMatchObject({ wat: 'gelijk', opToonbank: true });
    });

    it('laat een foto die er al staat staan, en zet hem alleen bij een product zonder foto', () => {
        const live: LiveStand = {
            producten: [liveProduct({ slug: 'a', foto: { basis: 'x' } }), liveProduct({ slug: 'b' })],
            artikelen: [liveArtikel({ slug: 'a' }), liveArtikel({ slug: 'b' })],
            slots: [{ id: 's1', artikel_id: 'a-a', standaard_product_id: 'p-a' }, { id: 's2', artikel_id: 'a-b', standaard_product_id: 'p-b' }],
        };
        const plan = maakPlan([artikel({ slug: 'a', foto: 'fotos/a.png' }), artikel({ slug: 'b', foto: 'fotos/b.png' })], live, ORG);
        expect(vind(plan.acties, 'bijwerken', 'a')!.foto).toBeNull();
        expect(vind(plan.acties, 'bijwerken', 'b')!.foto).toEqual({ bron: 'fotos/b.png', basis: `${ORG}/b-v1` });
    });

    it('maakt geen tweede kerstartikel: ontbreekt het, dan stopt alles', () => {
        expect(() => maakPlan([artikel({ slug: 'kerst-bierproeverij', verkoopt_per: 'persoon', btw: 21, leeftijd_18: true })], leeg, ORG)).toThrow(CatalogusFout);
    });
});

describe('voorstelprijzen zijn een concept', () => {
    it('een nieuw artikel met een voorstel krijgt de prijs, maar is niet actief', () => {
        const plan = maakPlan([artikel({ slug: 'pulled-pork', kassagroep: 'Uit de vriezer', prijs: 12.95, prijs_status: 'voorstel', bewaren_als: 'diepvries' })], leeg, ORG);
        const n = vind(plan.acties, 'nieuw', 'pulled-pork')!;
        expect(n.artikel).toMatchObject({ prijs_cents: 1295, actief: false });
        expect(plan.regels[0].wijzigingen.join()).toMatch(/concept/);
    });

    it('een voorstel overschrijft nooit een prijs die er al staat', () => {
        const live: LiveStand = { ...leeg, artikelen: [liveArtikel({ slug: 'kerst-wijnproeverij', prijs_cents: 3500, btw_pct: 21, actief: true })] };
        const plan = maakPlan([artikel({ slug: 'kerst-wijnproeverij', kassagroep: 'Kerst', verkoopt_per: 'pakket', prijs: 49.5, prijs_status: 'voorstel', btw: 21, leeftijd_18: true })], live, ORG);
        const b = vind(plan.acties, 'bijwerken', 'kerst-wijnproeverij');
        expect(b?.artikelPatch.prijs_cents).toBeUndefined();
        expect(b?.artikelPatch.actief).toBeUndefined();
        expect(plan.meldingen.map((m) => m.tekst).join()).toMatch(/blijft € 35,00/);
    });

    it('een voorstel vult een lege prijs, maar zet het artikel niet aan', () => {
        const live: LiveStand = { ...leeg, artikelen: [liveArtikel({ slug: 'barbecuesaus' })] };
        const plan = maakPlan([artikel({ slug: 'barbecuesaus', kassagroep: 'Borrel', prijs: 7.5, prijs_status: 'voorstel' })], live, ORG);
        const b = vind(plan.acties, 'bijwerken', 'barbecuesaus')!;
        expect(b.artikelPatch.prijs_cents).toBe(750);
        expect(b.artikelPatch.actief).toBeUndefined();
    });

    it('een bevestigde prijs wint wel van wat er staat', () => {
        const live: LiveStand = { ...leeg, artikelen: [liveArtikel({ slug: 'riblap', prijs_cents: 200, actief: true })] };
        const plan = maakPlan([artikel({ slug: 'riblap' })], live, ORG);
        expect(vind(plan.acties, 'bijwerken', 'riblap')!.artikelPatch.prijs_cents).toBe(250);
    });
});

describe('btw', () => {
    it('21 % bij alcohol, 9 % tot en met 0,5 %', () => {
        expect(controleer(bier({ slug: 'x' }))).toEqual([]);
        expect(controleer(bier({ slug: 'x', btw: 9 }))).toEqual([expect.stringMatching(/moet 21/)]);
        expect(controleer(bier({ slug: 'x', alcohol_pct: 0.5, leeftijd_18: false, btw: 9 }))).toEqual([]);
        expect(controleer(bier({ slug: 'x', alcohol_pct: 0.3, leeftijd_18: false, btw: 21 }))).toEqual([expect.stringMatching(/moet 9/)]);
    });

    it('18+ moet bij het alcoholpercentage passen', () => {
        expect(controleer(bier({ slug: 'x', leeftijd_18: false }))).toEqual([expect.stringMatching(/18\+/)]);
    });

    it('gemengd kan alleen bij een pakket, en laat btw_pct en de verdeling staan', () => {
        expect(controleer(artikel({ slug: 'x', btw: 'gemengd' }))).toEqual([expect.stringMatching(/pakket/)]);
        const live: LiveStand = {
            ...leeg,
            artikelen: [liveArtikel({ slug: 'bierpakket-20', prijs_cents: 2000, btw_pct: 21, eenheid: 'per stuk' })],
            slots: [{ id: 's', artikel_id: 'a-bierpakket-20', standaard_product_id: 'p' }],
        };
        const plan = maakPlan([artikel({
            slug: 'bierpakket-20', kassagroep: 'Geschenkpakketten', verkoopt_per: 'pakket', eenheid: 'per pakket', prijs: 20, btw: 'gemengd',
            leeftijd_18: true, allergenen: ['gluten'], inhoud: ['Drie bieren'],
        })], live, ORG);
        const b = vind(plan.acties, 'bijwerken', 'bierpakket-20');
        expect(b?.artikelPatch).not.toHaveProperty('btw_pct');
        expect(b?.artikelPatch).not.toHaveProperty('btw_verdeling');
        expect(b?.artikelPatch).not.toHaveProperty('eenheid');
        expect(b?.slot ?? null).toBeNull();
    });

    it('de catalogus wordt geweigerd als één regel niet klopt', () => {
        const json = { artikelen: [bier({ slug: 'goed' }), bier({ slug: 'fout', btw: 9 })] };
        expect(() => leesCatalogus(json)).toThrow(/fout: btw 9/);
    });

    it('gewicht: de kiloprijs moet bij de prijs per 100 gram passen', () => {
        expect(controleer(artikel({ slug: 'x', eenheid: 'per 100 gram', verkoopt_per: 'gewicht', prijs: 2.79, prijs_per_kg: 27.9 }))).toEqual([]);
        expect(controleer(artikel({ slug: 'x', eenheid: 'per kilo', verkoopt_per: 'gewicht', prijs: 12.5, prijs_per_kg: 12.5 }))).toEqual([]);
        expect(controleer(artikel({ slug: 'x', eenheid: 'per 100 gram', verkoopt_per: 'gewicht', prijs: 2.79, prijs_per_kg: 28 }))).toHaveLength(1);
    });

    it('verkoop per kilo wordt een product per 1000 gram', () => {
        const plan = maakPlan([artikel({ slug: 'gekruid-gehakt', eenheid: 'per kilo', verkoopt_per: 'gewicht', prijs: 12.5, prijs_per_kg: 12.5 })], leeg, ORG);
        const n = vind(plan.acties, 'nieuw', 'gekruid-gehakt')!;
        expect(n.product).toMatchObject({ eenheid: 'gram', prijs_per: 1000, winkelprijs_incl_cents: 1250 });
        expect(n.slot).toMatchObject({ hoeveelheid: 1000, eenheid: 'gram' });
    });
});

describe('allergenen: null blijft null', () => {
    it('een nieuw product zonder allergenen krijgt null, geen lege lijst', () => {
        const n = vind(maakPlan([artikel({ slug: 'riblap', allergenen: null })], leeg, ORG).acties, 'nieuw', 'riblap')!;
        expect(n.product!.allergenen).toBeNull();
    });

    it('een null in de catalogus overschrijft nooit wat er staat', () => {
        const live: LiveStand = {
            producten: [liveProduct({ slug: 'riblap', allergenen: ['selderij'] })],
            artikelen: [liveArtikel({ slug: 'riblap' })],
            slots: [{ id: 's', artikel_id: 'a-riblap', standaard_product_id: 'p-riblap' }],
        };
        const b = vind(maakPlan([artikel({ slug: 'riblap', allergenen: null })], live, ORG).acties, 'bijwerken', 'riblap')!;
        expect(b.productPatch).not.toHaveProperty('allergenen');
    });

    it('"geen" is een bevestigd antwoord en wordt geschreven', () => {
        const live: LiveStand = {
            producten: [liveProduct({ slug: 'runderpoulet' })],
            artikelen: [liveArtikel({ slug: 'runderpoulet' })],
            slots: [{ id: 's', artikel_id: 'a-runderpoulet', standaard_product_id: 'p-runderpoulet' }],
        };
        const b = vind(maakPlan([artikel({ slug: 'runderpoulet', allergenen: ['geen'] })], live, ORG).acties, 'bijwerken', 'runderpoulet')!;
        expect(b.productPatch.allergenen).toEqual(['geen']);
    });

    it('een lege lijst is geen geldig antwoord', () => {
        expect(() => leesCatalogus({ artikelen: [artikel({ slug: 'x', allergenen: [] as unknown as string[] })] })).toThrow(CatalogusFout);
    });
});

describe('niet actief in plaats van verwijderen', () => {
    const live: LiveStand = {
        ...leeg,
        artikelen: [
            liveArtikel({ slug: 'maubet-rose', actief: true }),
            liveArtikel({ slug: 'roeg-naober', actief: false }),
            liveArtikel({ slug: 'kerst-cremant', actief: true }),
        ],
    };

    it('wat live actief staat en niet in de lijst zit, gaat op niet actief', () => {
        const plan = maakPlan([], live, ORG);
        expect(plan.acties).toEqual([{ soort: 'niet-actief', slug: 'maubet-rose', artikelId: 'a-maubet-rose', naam: 'maubet-rose' }]);
        expect(plan.alUit).toEqual(['roeg-naober']);
        expect(plan.behouden).toEqual(['kerst-cremant']);
    });

    it('er is geen actie die iets verwijdert', () => {
        const soorten = new Set(maakPlan([], live, ORG, { ...STANDAARD_KEUZES, behoud: [] }).acties.map((a) => a.soort));
        expect([...soorten].sort()).toEqual(['niet-actief']);
    });
});

describe('alcohol pas als Mathijs het aanzet', () => {
    it('bier krijgt zijn prijs, maar gaat niet actief en niet op de Toonbank', () => {
        const live: LiveStand = {
            producten: [liveProduct({ slug: 'achel-tripel', type: 'bier', btw_pct: 21 })],
            artikelen: [liveArtikel({ slug: 'achel-tripel', btw_pct: 21 })],
            slots: [{ id: 's', artikel_id: 'a-achel-tripel', standaard_product_id: 'p-achel-tripel' }],
        };
        const b = vind(maakPlan([bier({ slug: 'achel-tripel', prijs: 3.2 })], live, ORG).acties, 'bijwerken', 'achel-tripel')!;
        expect(b.artikelPatch.prijs_cents).toBe(320);
        expect(b.artikelPatch).not.toHaveProperty('actief');
        expect(b.artikelPatch).not.toHaveProperty('kanalen');
        const aan = vind(maakPlan([bier({ slug: 'achel-tripel', prijs: 3.2 })], live, ORG, { ...STANDAARD_KEUZES, alcohol: true }).acties, 'bijwerken', 'achel-tripel')!;
        expect(aan.artikelPatch).toMatchObject({ actief: true, kanalen: ['webshop', 'toonbank'] });
    });

    it('statiegeld op blik, niet op fles', () => {
        const blik = vind(maakPlan([bier({ slug: 'b', details: { brouwerij: 'X', stijl: 'IPA', verpakking: { soort: 'blik', cl: 44 } } })], leeg, ORG).acties, 'nieuw', 'b')!;
        const fles = vind(maakPlan([bier({ slug: 'f' })], leeg, ORG).acties, 'nieuw', 'f')!;
        expect(blik.product!.statiegeld_cents).toBe(15);
        expect(fles.product!.statiegeld_cents).toBe(0);
    });
});

describe.skipIf(!fs.existsSync(BRON))('de echte catalogus', () => {
    const cat = leesCatalogus(JSON.parse(fs.readFileSync(BRON, 'utf8')));

    it('139 artikelen, zonder fouten', () => {
        expect(cat).toHaveLength(139);
    });

    it('niemand krijgt een verzonnen allergeen of EAN', () => {
        const kerst = cat.filter((c) => c.slug.startsWith('kerst-')).map((c) => liveArtikel({ slug: c.slug }));
        const plan = maakPlan(cat, { ...leeg, artikelen: kerst }, ORG);
        for (const a of plan.acties) {
            if (a.soort !== 'nieuw' || !a.product) continue;
            const bron = cat.find((c) => c.slug === a.slug)!;
            expect(a.product.allergenen).toEqual(bron.allergenen);
            expect(a.product.ean).toBeNull();
        }
    });
});
