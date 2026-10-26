/**
 * Keuzevakken — een combideal waarin de klant zelf kiest.
 * Plan: docs/context/winkel-aanbod-en-vloer-plan.md, fase 2.
 *
 * Het voorbeeld van Mathijs: "twee biertjes, twee soorten worst en een blokje
 * kaas, en de klant mag zelf kiezen wat het wordt" — één vaste prijs, de btw
 * volgt wat er écht gekozen is.
 */
import { describe, expect, it } from 'vitest';
import {
    berekenOfferte, btwVerdeling, componentenVan, meerprijzenVan, overschrijvingPast, valideerKeuzes, verkoopbaar,
    type Artikel, type Product, type Slot, type SlotOptie,
} from './rekenen';
import type { Mand } from './types';
import { MYPOS_TEST } from '@/lib/mypos/ipc';
import { maakGeheugenStore, type GeheugenStore } from './geheugenStore';
import { _resetControleKlok, haalKeuzes, plaatsOrder, type KassaContext, type KeuzeArtikel } from './kassa';
import { vrijArtikel, type VrijProduct } from './vrij';

const product = (id: string, naam: string, btw_pct: number, winkelprijs_incl_cents: number, extra: Partial<Product> = {}): Product =>
    ({ id, naam, type: 'overig', eenheid: 'stuk', prijs_per: 1, winkelprijs_incl_cents, inkoop_excl_cents: null, btw_pct, alcohol: false, voorraad: null, actief: true, ...extra });

const lijst: Product[] = [
    product('p-ipa', 'IPA', 21, 395, { alcohol: true }),
    product('p-stout', 'Stout', 21, 450, { alcohol: true }),
    product('p-tripel', 'Tripel', 21, 495, { alcohol: true }),
    product('p-nul', 'Alcoholvrij 0.0', 9, 295),
    product('p-worst-appel', 'Droge worst appel & calvados', 9, 595),
    product('p-worst-peper', 'Droge worst peper & jeneverbes', 9, 595),
    product('p-worst-bock', 'Droge worst bockbier & mosterd', 9, 595, { actief: false }),
    product('p-kaas-jong', 'Jonge kaas', 9, 450),
    product('p-kaas-oud', 'Oude kaas', 9, 550),
];
const producten = new Map(lijst.map((p) => [p.id, p]));

const combi: Artikel = {
    id: 'a-combi', slug: 'combideal-bier-worst-kaas', naam: 'Combideal', eenheid: 'per stuk', telt: 'stuks',
    prijs_cents: 2500, btw_pct: 21, minimum: 1, maximum: null, verzendbaar: false, gekoeld: false,
    moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null, capaciteit_soort: 'regel',
    doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true,
};

const vak = (id: string, volgorde: number, naam: string, keuzes: number, extra: Partial<Slot> = {}): Slot =>
    ({ id, artikel_id: 'a-combi', volgorde, slot_type: 'overig', naam, hoeveelheid: 1, eenheid: 'stuk', per: 'stuk', standaard_product_id: null, wisselbaar: false, alternatieven: [], keuze: 'kies', keuzes, ...extra });
const slots: Slot[] = [
    vak('s-bier', 1, 'Bier', 2),
    vak('s-worst', 2, 'Worst', 2, { verschillend: true }),
    vak('s-kaas', 3, 'Kaas', 1, { standaard_product_id: 'p-kaas-jong' }),
];
const optie = (slot_id: string, product_id: string, volgorde: number, meerprijs_cents = 0): SlotOptie =>
    ({ id: `o-${slot_id}-${product_id}`, slot_id, product_id, meerprijs_cents, volgorde });
const opties: SlotOptie[] = [
    optie('s-bier', 'p-ipa', 1), optie('s-bier', 'p-stout', 2), optie('s-bier', 'p-nul', 3), optie('s-bier', 'p-tripel', 4, 150),
    optie('s-worst', 'p-worst-appel', 1), optie('s-worst', 'p-worst-peper', 2), optie('s-worst', 'p-worst-bock', 3),
    optie('s-kaas', 'p-kaas-jong', 1), optie('s-kaas', 'p-kaas-oud', 2),
];

const instellingen = { verzendkosten_cents: 695, gratis_verzenden_vanaf_cents: null, verzendkosten_btw_pct: 21, reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true, site_url: 'https://hopbites.nl', reservering_bedrag_cents: 250, qr_basis_url: null };
const bron = (a: Artikel = combi) => ({ artikelen: [a], momenten: [], producten: lijst, slots, opties, instellingen, nu: new Date('2026-11-25T12:00:00Z') });
const mand = (keuzes: unknown, aantal = 1, slug = combi.slug): Mand => ({ versie: 1, regels: [{ slug, aantal, moment: null, keuzes }] } as Mand);
const standaard = [
    { slot: 's-bier', producten: ['p-ipa', 'p-stout'] },
    { slot: 's-worst', producten: ['p-worst-appel', 'p-worst-peper'] },
];

describe('verkoopbaar met kies-vakken', () => {
    it('een kies-vak met opties is te koop, zonder opties niet', () => {
        expect(verkoopbaar('a-combi', slots, opties, producten)).toBe(true);
        expect(verkoopbaar('a-combi', slots, opties.filter((o) => o.slot_id !== 's-kaas'), producten)).toBe(false);
    });

    it('"elk een andere" vraagt genoeg actieve opties; een uitgezet product telt niet mee', () => {
        const alleenAppelEnBock = opties.filter((o) => o.slot_id !== 's-worst' || o.product_id !== 'p-worst-peper');
        expect(verkoopbaar('a-combi', slots, alleenAppelEnBock, producten)).toBe(false);
    });
});

describe('valideerKeuzes', () => {
    it('het voorbeeld: twee bier, twee verschillende worsten, de kaas valt terug op zijn standaard', () => {
        const uit = valideerKeuzes(combi, slots, opties, producten, standaard);
        expect(uit.ok).toBe(true);
        if (uit.ok) expect([...uit.gekozen]).toEqual([['s-bier', ['p-ipa', 'p-stout']], ['s-worst', ['p-worst-appel', 'p-worst-peper']], ['s-kaas', ['p-kaas-jong']]]);
    });

    it('twee keer hetzelfde bier mag; twee keer dezelfde worst niet', () => {
        expect(valideerKeuzes(combi, slots, opties, producten, [standaard[1], { slot: 's-bier', producten: ['p-ipa', 'p-ipa'] }]).ok).toBe(true);
        expect(valideerKeuzes(combi, slots, opties, producten, [standaard[0], { slot: 's-worst', producten: ['p-worst-appel', 'p-worst-appel'] }]))
            .toEqual({ ok: false, fouten: ['Combideal: kies bij Worst 2 verschillende.'] });
    });

    it('elke fout in gewone taal, alle tegelijk', () => {
        const uit = valideerKeuzes(combi, slots, opties, producten, [
            { slot: 's-bier', producten: ['p-ipa'] },
            { slot: 's-kaas', producten: ['p-worst-appel'] },
        ]);
        expect(uit).toEqual({ ok: false, fouten: [
            'Combideal: kies 2 × Bier (nu 1).',
            'Combideal: kies 2 × Worst.',
            'Combideal: Droge worst appel & calvados hoort niet bij Kaas.',
        ] });
    });

    it('een uitgezet product kan niet gekozen worden', () => {
        expect(valideerKeuzes(combi, slots, opties, producten, [standaard[0], { slot: 's-worst', producten: ['p-worst-appel', 'p-worst-bock'] }]))
            .toEqual({ ok: false, fouten: ['Combideal: Droge worst bockbier & mosterd is op dit moment niet beschikbaar.'] });
    });

    it('een onbekend vak, een vak twee keer, of een rare vorm: de keuzes kloppen niet', () => {
        const fout = { ok: false, fouten: ['De keuzes voor Combideal kloppen niet.'] };
        expect(valideerKeuzes(combi, slots, opties, producten, [{ slot: 's-onbekend', producten: [] }])).toEqual(fout);
        expect(valideerKeuzes(combi, slots, opties, producten, [standaard[0], standaard[0]])).toEqual(fout);
        expect(valideerKeuzes(combi, slots, opties, producten, { bier: 'ipa' })).toEqual(fout);
    });
});

describe('componentenVan met keuzes', () => {
    it('de gekozen producten worden de inhoud; dezelfde keuze telt op, × aantal', () => {
        const gekozen = new Map([['s-bier', ['p-ipa', 'p-ipa']], ['s-worst', ['p-worst-appel', 'p-worst-peper']], ['s-kaas', ['p-kaas-oud']]]);
        expect(componentenVan('a-combi', slots, 3, { gekozen, producten }).map((c) => `${c.naam} ${c.hoeveelheid} ${c.slot_id} ${c.gekozen}`)).toEqual([
            'IPA 6 s-bier true',
            'Droge worst appel & calvados 3 s-worst true',
            'Droge worst peper & jeneverbes 3 s-worst true',
            'Oude kaas 3 s-kaas true',
        ]);
    });
});

describe('btw en meerprijs', () => {
    it('de btw volgt de écht gekozen producten', () => {
        const uit = berekenOfferte(bron(), mand(standaard), 'afhalen', null);
        expect(uit.ok).toBe(true);
        if (uit.ok !== true) return;
        const r = uit.intern.regels[0]!;
        /* 21 %: IPA 395 + Stout 450 = 845 · 9 %: twee worsten 1190 + kaas 450 = 1640 — naar rato over € 25. */
        const v = btwVerdeling(combi, r.componenten, producten, 2500);
        expect(v.delen).toEqual({ '9': 1650, '21': 850 });
        expect(r.btw_cents).toEqual(v.btw);
        expect(r.stukCenten).toBe(2500);
        expect(r.keuzes).toEqual([...standaard, { slot: 's-kaas', producten: ['p-kaas-jong'] }]);
        expect(r.alcohol).toBe(true);
    });

    it('een meerprijs komt op de stukprijs en telt tegen het tarief van zijn eigen product', () => {
        const uit = berekenOfferte(bron(), mand([standaard[1], { slot: 's-bier', producten: ['p-tripel', 'p-tripel'] }], 2), 'afhalen', null);
        expect(uit.ok).toBe(true);
        if (uit.ok !== true) return;
        const r = uit.intern.regels[0]!;
        expect(r.stukCenten).toBe(2800);
        expect(r.bedragCenten).toBe(5600);
        /* € 50 naar rato (21 %: 4 × Tripel 1980 · 9 %: 3280), daarna 4 × € 1,50 meerprijs op 21 %. */
        const v = btwVerdeling(combi, r.componenten, producten, 5600, [{ product_id: 'p-tripel', cents: 600 }]);
        expect(v.delen).toEqual({ '9': 3118, '21': 2482 });
        expect(r.btw_cents).toEqual(v.btw);
        expect(meerprijzenVan(new Map([['s-bier', ['p-tripel', 'p-ipa']]]), opties)).toEqual([{ product_id: 'p-tripel', cents: 150 }]);
    });

    it('een vaste btw-verdeling past niet bij een vak met gemengde tarieven: dan naar rato', () => {
        expect(overschrijvingPast('a-combi', slots, opties, producten)).toBe(false);
        const metOverschrijving = { ...combi, btw_verdeling: { '21': 50, '9': 50 } };
        const uit = berekenOfferte(bron(metOverschrijving), mand([standaard[1], { slot: 's-bier', producten: ['p-nul', 'p-nul'] }]), 'afhalen', null);
        expect(uit.ok).toBe(true);
        if (uit.ok !== true) return;
        /* Alleen 0.0 gekozen: alles valt onder 9 %, en 18+ is niet nodig. */
        expect(Object.keys(uit.intern.regels[0]!.btw_cents)).toEqual(['9']);
        expect(uit.intern.regels[0]!.alcohol).toBe(false);
    });
});

describe('berekenOfferte met kies-vakken', () => {
    it('een fout in de keuzes is een validatie, net als een vast pakket met keuzes', () => {
        expect(berekenOfferte(bron(), mand([{ slot: 's-bier', producten: ['p-ipa'] }]), 'afhalen', null)).toMatchObject({
            ok: false, soort: 'validatie', fouten: ['Combideal: kies 2 × Bier (nu 1).', 'Combideal: kies 2 × Worst.'],
        });
    });

    it('zonder opties is het combideal niet te bestellen', () => {
        expect(berekenOfferte({ ...bron(), opties: [] }, mand(standaard), 'afhalen', null)).toMatchObject({
            ok: false, soort: 'validatie', fouten: ['Combideal kan op dit moment niet besteld worden.'],
        });
    });
});

/* ── Van mand tot order, tegen de geheugen-opslag ──────────────────────────── */
describe('een order met keuzes', () => {
    const tenant = { orgId: 'org-kv', slug: 'kv-hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
    const nieuweStore = (voorraadStout: number | null) => maakGeheugenStore({
        tenant, artikelen: [combi], momenten: [], instellingen, nu: new Date('2026-11-25T12:00:00Z'), slots, opties,
        producten: lijst.map((p) => (p.id === 'p-stout' ? { ...p, voorraad: voorraadStout } : p)),
    });
    const bestel = (ctx: KassaContext, sleutel: string, keuzes: unknown, totaal: number) => plaatsOrder(ctx, 'kv-hop-en-bites', {
        mand: { versie: 1, regels: [{ slug: combi.slug, aantal: 1, moment: null, keuzes }] }, leverwijze: 'afhalen', momentId: null,
        contact: { naam: 'Jansen', email: 'jansen@voorbeeld.nl', telefoon: '' }, adres: null, opmerking: '', sleutel,
        terugUrl: '/bestelling', verwachtTotaalCenten: totaal,
    });
    const ctxVan = (store: GeheugenStore): KassaContext => ({ store, mypos: MYPOS_TEST, appUrl: 'http://localhost:3000', mail: async () => ({ success: true }), nu: () => new Date('2026-11-25T12:00:00Z') });

    it('de inhoud onthoudt het vak en dat de klant koos', async () => {
        _resetControleKlok();
        const store = nieuweStore(null);
        const keuzes = [{ slot: 's-bier', producten: ['p-tripel', 'p-stout'] }, standaard[1]];
        const uit = await bestel(ctxVan(store), 'sleutel-keuzevak-een', keuzes, 2650);
        expect(uit.status).toBe(200);
        expect(store.componenten.map((c) => `${c.product_id} ${c.hoeveelheid} ${c.slot_id} ${c.gekozen}`)).toEqual([
            'p-tripel 1 s-bier true', 'p-stout 1 s-bier true',
            'p-worst-appel 1 s-worst true', 'p-worst-peper 1 s-worst true',
            'p-kaas-jong 1 s-kaas true',
        ]);
        expect(store.orders[0]!.totaal_cents).toBe(2650);
    });

    it('een gekozen product dat op is, houdt de order tegen; een ander bier gaat wel', async () => {
        _resetControleKlok();
        const store = nieuweStore(0);
        const metStout = [{ slot: 's-bier', producten: ['p-stout', 'p-ipa'] }, standaard[1]];
        expect((await bestel(ctxVan(store), 'sleutel-keuzevak-twee', metStout, 2500)).status).not.toBe(200);
        const zonder = [{ slot: 's-bier', producten: ['p-ipa', 'p-ipa'] }, standaard[1]];
        expect((await bestel(ctxVan(store), 'sleutel-keuzevak-drie', zonder, 2500)).status).toBe(200);
    });
});

describe('beschikbaarheid van een kies-vak', () => {
    const vrij = (id: string, ligt_er: number | null): VrijProduct =>
        ({ product_id: id, naam: id, eenheid: 'stuk', ligt_er, gereserveerd: 0, vrij: ligt_er, bijgehouden: ligt_er != null });
    const bijgehouden = (stout: number, ipa: number) =>
        lijst.map((p) => vrij(p.id, p.id === 'p-stout' ? stout : p.id === 'p-ipa' ? ipa : null));

    it('één niet-bijgehouden optie: het vak begrenst niets', () => {
        expect(vrijArtikel(combi, slots, bijgehouden(1, 1), opties)).toMatchObject({ vrij: null, bijgehouden: false });
    });

    it('alle opties bijgehouden: samen ÷ (hoeveelheid × keuzes), zonder beperkend product', () => {
        const alleenStoutEnIpa = opties.filter((o) => o.slot_id !== 's-bier' || ['p-stout', 'p-ipa'].includes(o.product_id));
        expect(vrijArtikel(combi, slots, bijgehouden(3, 2), alleenStoutEnIpa)).toMatchObject({ vrij: 2, beperkend_product_id: null });
        expect(vrijArtikel(combi, slots, bijgehouden(1, 0), alleenStoutEnIpa)).toMatchObject({ vrij: 0 });
    });

    it('een kies-vak zonder opties is leeg: 0', () => {
        expect(vrijArtikel(combi, slots, bijgehouden(9, 9), opties.filter((o) => o.slot_id !== 's-kaas'))).toMatchObject({ vrij: 0 });
    });
});

/* ── Wat de website te zien krijgt ────────────────────────────────────────── */
describe('haalKeuzes — de keuzes voor de website', () => {
    const tenant = { orgId: 'org-kz', slug: 'kz-hop-en-bites', bedrijfsnaam: 'Hop & Bites', email: null, telefoon: null, brandColor: null, ondertitel: null };
    const ctx = (): KassaContext => ({
        store: maakGeheugenStore({
            tenant, artikelen: [combi], momenten: [], instellingen, nu: new Date('2026-11-25T12:00:00Z'), slots, opties,
            producten: lijst.map((p) => (p.id === 'p-stout' ? { ...p, voorraad: 0 } : p.id === 'p-ipa' ? { ...p, voorraad: 12 } : p)),
        }),
        mypos: MYPOS_TEST, appUrl: 'http://localhost:3000', mail: async () => ({ success: true }), nu: () => new Date('2026-11-25T12:00:00Z'),
    });

    it('vakken met id\'s, meerprijs en een stand zonder getal; een uitgezet product staat er niet in', async () => {
        const uit = await haalKeuzes(ctx(), 'kz-hop-en-bites');
        expect(uit.status).toBe(200);
        const a = (uit.body as { artikelen: KeuzeArtikel[] }).artikelen[0]!;
        expect(a).toMatchObject({ slug: combi.slug, prijsCenten: 2500, verkoopbaar: true });
        const bier = a.vakken.find((v) => v.slot === 's-bier')!;
        expect(bier).toMatchObject({ keuze: 'kies', keuzes: 2, verschillend: false, voorkeuze: null });
        expect(bier.opties.map((o) => `${o.naam} ${o.meerprijsCenten} ${o.stand}`)).toEqual([
            'IPA 0 ja', 'Stout 0 op', 'Alcoholvrij 0.0 0 onbeperkt', 'Tripel 150 onbeperkt',
        ]);
        const worst = a.vakken.find((v) => v.slot === 's-worst')!;
        expect(worst.opties.map((o) => o.product)).not.toContain('p-worst-bock');
        expect(a.vakken.find((v) => v.slot === 's-kaas')!.voorkeuze).toBe('p-kaas-jong');
        expect(JSON.stringify(uit.body)).not.toMatch(/voorraad|inkoop/);
    });

    it('een onbekende winkel is 404', async () => {
        expect((await haalKeuzes(ctx(), 'bestaat-niet')).status).toBe(404);
    });
});
