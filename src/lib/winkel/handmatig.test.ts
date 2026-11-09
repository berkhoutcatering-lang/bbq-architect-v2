import { describe, expect, it } from 'vitest';
import {
    bouwHandmatig, handmatigeOpmerking, InvoerSchema, isZelfIngevoerd, letOpPunten, OP_MAAT_GROEP, OP_MAAT_SLUG,
    ordergroep, regelgroep, splitsRegels, vulPrijsIn, type HandmatigeBronnen,
} from './handmatig';
import type { Artikel } from './rekenen';

function artikel(p: Partial<Artikel> & Pick<Artikel, 'id' | 'slug' | 'naam'>): Artikel {
    return {
        eenheid: 'per persoon', telt: 'personen', prijs_cents: null, btw_pct: 9, minimum: 1, maximum: null,
        verzendbaar: false, gekoeld: true, moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null,
        capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true,
        ...p,
    };
}

const BOX = artikel({ id: 'a-box', slug: 'kerst-box', naam: 'Kerst-Box', prijs_cents: 2350, moment_soort: 'dag', moment_groep: 'kerst-box' });
const PLANK = artikel({ id: 'a-plank', slug: 'borrelplank', naam: 'Borrelplank', prijs_cents: 1495, moment_soort: 'moment', moment_groep: 'agenda', capaciteit_soort: 'regel' });
const ZONDER_PRIJS = artikel({ id: 'a-x', slug: 'hop-en-bites-plank', naam: 'Hop & Bites plank', prijs_cents: null });
const UIT = artikel({ id: 'a-uit', slug: 'uit', naam: 'Oud pakket', prijs_cents: 1000, actief: false });
const OP_MAAT = artikel({ id: 'a-maat', slug: OP_MAAT_SLUG, naam: 'Op maat', publiek: false, telt: 'stuks', capaciteit_soort: 'regel' });

const BRON: HandmatigeBronnen = { artikelen: [BOX, PLANK, ZONDER_PRIJS, UIT, OP_MAAT], producten: [], slots: [] };

describe('bouwHandmatig', () => {
    it('Nienke: Kerst-Box voor 2 tegen de catalogusprijs, plus een diner op maat zonder prijs', () => {
        const uit = bouwHandmatig({
            regels: [
                { soort: 'artikel', slug: 'kerst-box', aantal: 2, stukCenten: null, toelichting: 'vlees in ovenschaaltjes' },
                { soort: 'op-maat', naam: 'Kerstavonddiner, 3 gangen', toelichting: 'verrassingsmenu', aantal: 2, stukCenten: null, btwPct: 9 },
            ],
        }, BRON);
        expect(uit.ok).toBe(true);
        if (!uit.ok) return;
        const [box, diner] = uit.plan.regels;
        expect(box).toMatchObject({ artikel_id: 'a-box', aantal: 2, stukCenten: 2350, bedragCenten: 4700, groep: 'kerst-box', vasteDag: true, toelichting: 'vlees in ovenschaaltjes', prijs_volgt: false });
        expect(diner).toMatchObject({ artikel_id: 'a-maat', slug: OP_MAAT_SLUG, naam: 'Kerstavonddiner, 3 gangen', bedragCenten: 0, prijs_volgt: true, eenheden: 0 });
        expect(uit.plan.subtotaalCenten).toBe(4700);
        expect(uit.plan.prijsVolgt).toBe(1);
        expect(uit.plan.btwCenten).toEqual({ '9': 388 });
    });

    it('een eigen prijs voor deze bestelling gaat voor de catalogusprijs', () => {
        const uit = bouwHandmatig({ regels: [{ soort: 'artikel', slug: 'borrelplank', aantal: 3, stukCenten: 1200, toelichting: '' }] }, BRON);
        expect(uit.ok && uit.plan.regels[0]).toMatchObject({ stukCenten: 1200, bedragCenten: 3600, groep: OP_MAAT_GROEP, vasteDag: false });
    });

    it('een regel op maat met prijs rekent btw op het gekozen tarief', () => {
        const uit = bouwHandmatig({ regels: [{ soort: 'op-maat', naam: 'Fles wijn', toelichting: '', aantal: 2, stukCenten: 1210, btwPct: 21 }] }, BRON);
        expect(uit.ok && uit.plan).toMatchObject({ subtotaalCenten: 2420, btwCenten: { '21': 420 }, prijsVolgt: 0 });
    });

    it('verzint geen prijs: een product zonder prijs moet er een krijgen', () => {
        const uit = bouwHandmatig({ regels: [{ soort: 'artikel', slug: 'hop-en-bites-plank', aantal: 1, stukCenten: null, toelichting: '' }] }, BRON);
        expect(uit).toEqual({ ok: false, fouten: ['Hop & Bites plank heeft nog geen prijs. Vul voor deze bestelling een prijs in.'] });
    });

    it('meldt alle fouten tegelijk', () => {
        const uit = bouwHandmatig({
            regels: [
                { soort: 'artikel', slug: 'uit', aantal: 1, stukCenten: null, toelichting: '' },
                { soort: 'artikel', slug: 'bestaat-niet', aantal: 1, stukCenten: null, toelichting: '' },
            ],
        }, BRON);
        expect(uit.ok).toBe(false);
        if (uit.ok !== false) return;
        expect(uit.fouten).toHaveLength(2);
    });

    it('zonder het verborgen artikel kan er geen regel op maat in', () => {
        const uit = bouwHandmatig({ regels: [{ soort: 'op-maat', naam: 'x', toelichting: '', aantal: 1, stukCenten: 100, btwPct: 9 }] }, { ...BRON, artikelen: [BOX] });
        expect(uit.ok).toBe(false);
    });
});

describe('groepen', () => {
    it('met een Kerst-Box staat de hele bestelling in het Kerst-vakje; regels op maat volgen', () => {
        const regels = [
            { slug: 'kerst-box', groep: 'kerst-box', vasteDag: true },
            { slug: OP_MAAT_SLUG, groep: OP_MAAT_GROEP, vasteDag: false },
        ];
        const order = ordergroep(regels);
        expect(order).toEqual({ groep: 'kerst-box', vasteDag: true });
        expect(regelgroep(regels[1]!, order)).toEqual({ groep: 'kerst-box', vasteDag: true });
    });

    it('zonder vaste dag: alles in op-maat', () => {
        expect(ordergroep([{ slug: 'borrelplank', groep: OP_MAAT_GROEP, vasteDag: false }])).toEqual({ groep: OP_MAAT_GROEP, vasteDag: false });
    });
});

describe('let op', () => {
    it('allergenen en harde regels krijgen een uitroepteken, dieet niet', () => {
        expect(letOpPunten({ allergenen: ['noten', ' lactose '], overig: ['geen geitenkaas', 'geen olijven', ' '] })).toEqual([
            '! allergie: noten, lactose', '! geen geitenkaas', '! geen olijven',
        ]);
        expect(letOpPunten(null)).toEqual([]);
        expect(letOpPunten({ allergenen: [], overig: [] })).toEqual([]);
    });

    it('splitst harde regels op puntkomma of nieuwe regel', () => {
        expect(splitsRegels('geen geitenkaas; geen olijven\ngeen alcohol\n')).toEqual(['geen geitenkaas', 'geen olijven', 'geen alcohol']);
    });

    it('de opmerking draagt de toelichting en "prijs volgt"', () => {
        expect(handmatigeOpmerking([
            { naam: 'Kerst-Box', aantal: 2, toelichting: 'vlees in ovenschaaltjes', prijs_volgt: false },
            { naam: 'Kerstavonddiner', aantal: 2, toelichting: null, prijs_volgt: true },
            { naam: 'Borrelplank', aantal: 1, toelichting: null, prijs_volgt: false },
        ], 'Belt nog over de tijd')).toBe('2× Kerst-Box: vlees in ovenschaaltjes\n2× Kerstavonddiner: prijs volgt\nBelt nog over de tijd');
    });
});

describe('vulPrijsIn', () => {
    const regel = { id: 1, aantal: 2, bedrag_cents: 0, btw_pct: 9, btw_cents: {}, prijs_volgt: true };
    const order = { subtotaal_cents: 4700, totaal_cents: 4700, btw_cents: { '9': 388 }, rest_cents: 4700 };

    it('in de kassa: totaal en rest gaan omhoog, btw telt op', () => {
        const uit = vulPrijsIn(regel, 4500, { ...order, inDeKassa: true });
        expect(uit.regel).toEqual({ stuk_cents: 4500, bedrag_cents: 9000, btw_cents: { '9': 743 }, prijs_volgt: false });
        expect(uit.order).toEqual({ subtotaal_cents: 13700, totaal_cents: 13700, btw_cents: { '9': 1131 }, rest_cents: 13700 });
    });

    it('buiten de kassa: de rest blijft wat hij was', () => {
        const uit = vulPrijsIn(regel, 4500, { ...order, rest_cents: 0, inDeKassa: false });
        expect(uit.order.rest_cents).toBe(0);
        expect(uit.order.totaal_cents).toBe(13700);
    });
});

describe('invoer', () => {
    it('accepteert een telefonische bestelling zonder e-mail', () => {
        const r = InvoerSchema.safeParse({
            sleutel: '6f1c2c55-6f0a-4c3f-9a55-0c6d3d0b9a11',
            klant: { naam: 'Nienke', email: '', telefoon: '' },
            bron: 'telefoon',
            datum: '2026-12-24',
            regels: [{ soort: 'op-maat', naam: 'Diner', aantal: 2 }],
            wensen: {},
            inDeKassa: true,
        });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.regels[0]).toMatchObject({ stukCenten: null, btwPct: 9 });
    });

    it('website telt niet als zelf ingevoerd', () => {
        expect(isZelfIngevoerd('telefoon')).toBe(true);
        expect(isZelfIngevoerd('website')).toBe(false);
        expect(isZelfIngevoerd(null)).toBe(false);
    });
});
