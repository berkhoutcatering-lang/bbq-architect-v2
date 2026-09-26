import { describe, expect, it } from 'vitest';
import { afstandLabel, bouwVakjes, capaciteitEenheid, dagenTot, datumLang, groepLabel, leesEuro, vakjeNaam, type ArtikelRij, type MomentRij, type OrderRij, type RegelRij } from './vakjes';

const basis: Omit<ArtikelRij, 'id' | 'slug' | 'naam'> = {
    eenheid: 'per stuk', telt: 'stuks', prijs_cents: 100, btw_pct: 9, minimum: 1, maximum: null, verzendbaar: true, gekoeld: false,
    moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null, capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null,
    voorraad: null, actief: true, publiek: true, gerecht_id: null, inventory_id: null, inkoop_per_stuk: null, dieet: null, koppel_voorstel: null,
    segment: null, vast: true, alcohol: false, schaal_verdeling: false, btw_verdeling: null, verpakking_klein_cents: null, verpakking_groot_cents: null,
};
const artikelen: ArtikelRij[] = [
    { ...basis, id: 'a-kerst', slug: 'kerst-box', naam: 'Kerst-Box', telt: 'personen', moment_soort: 'dag', moment_groep: 'kerst-box', capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5, gerecht_id: 'g-1' },
    { ...basis, id: 'a-vega', slug: 'kerst-box-vegetarisch', naam: 'Kerst-Box vegetarisch', telt: 'personen', moment_soort: 'dag', moment_groep: 'kerst-box', capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5, gerecht_id: 'g-2', dieet: 'vegetarisch' },
    { ...basis, id: 'a-plank', slug: 'borrel-journey', naam: 'Borrel Journey', telt: 'personen', moment_soort: 'moment', moment_groep: 'agenda', capaciteit_soort: 'regel' },
    { ...basis, id: 'a-bier', slug: 'bier', naam: 'Speciaalbier', inventory_id: 7 },
];
const momenten: MomentRij[] = [
    { id: 'd-23', groep: 'kerst-box', datum: '2026-12-23', van: null, tot: null, capaciteit: 25, bestellen_tot: null, sluit_op: null, actief: true },
    { id: 'm-1', groep: 'agenda', datum: '2026-10-16', van: '12:00:00', tot: '13:00:00', capaciteit: 4, bestellen_tot: null, sluit_op: null, actief: true },
];

let regelId = 0;
function regel(artikel: ArtikelRij, aantal: number, moment: string | null, extra: Partial<RegelRij> = {}): RegelRij {
    return { id: ++regelId, artikel_id: artikel.id, slug: artikel.slug, naam: artikel.naam, aantal, eenheid: artikel.eenheid, stuk_cents: 100, bedrag_cents: 100 * aantal, moment_id: moment, eenheden: 1, klaar_op: moment === 'd-23' ? '2026-12-23' : moment === 'm-1' ? '2026-10-16' : '2026-09-25', event_id: null, klaargezet_at: null, afhaalmoment_tekst: null, ...extra };
}
function order(id: number, regels: RegelRij[], extra: Partial<OrderRij> = {}): OrderRij {
    return {
        id, nummer: `HB-2026-${String(id).padStart(4, '0')}`, status: 'betaald', status_reden: null, leverwijze: 'afhalen', moment_id: null,
        contact_naam: `Klant ${id}`, contact_email: 'k@v.nl', contact_telefoon: null, adres: null, opmerking: null,
        subtotaal_cents: 0, leverkosten_cents: 0, totaal_cents: regels.reduce((s, r) => s + r.bedrag_cents, 0), reservering_tot: '2026-09-25T10:30:00Z',
        betaald_at: '2026-09-25T10:00:00Z', betaalmethode: '2', created_at: '2026-09-25T09:55:00Z', refund_status: null, refund_fout: null,
        mail_status: 'verstuurd', mail_fout: null, wensen: null, wensen_bron: null, plaatsing_status: 'geplaatst', plaatsing_fout: null,
        betaalwijze: 'volledig', nu_te_betalen_cents: 0, rest_cents: 0, rest_betaald_at: null, rest_betaalmethode: null,
        winkel_order_regels: regels, ...extra,
    };
}

describe('datums', () => {
    it('schrijft de dag voluit', () => {
        expect(datumLang('2026-12-23')).toBe('woensdag 23 december');
        expect(dagenTot('2026-12-23', '2026-09-25')).toBe(89);
        expect(afstandLabel(0)).toBe('Vandaag');
        expect(afstandLabel(1)).toBe('Morgen');
        expect(afstandLabel(21)).toBe('Over 21 dagen');
        expect(afstandLabel(-2)).toBe('2 dagen geleden');
    });
});

describe('groepen', () => {
    it('leest de capaciteitseenheid en het label uit de artikelen', () => {
        expect(capaciteitEenheid('kerst-box', artikelen)).toBe('dozen');
        expect(capaciteitEenheid('agenda', artikelen)).toBe('planken');
        expect(groepLabel('agenda', artikelen)).toBe('Agenda · planken');
        expect(groepLabel('kerst-box', artikelen)).toBe('Kerst-box · afhaaldagen');
    });
});

describe('bouwVakjes', () => {
    it('zet Kerst op zijn dag, de plank op zijn moment en bier in de vaste bak van vandaag', () => {
        const orders = [
            order(1, [regel(artikelen[0], 4, 'd-23', { event_id: 9 })], { opmerking: '4 personen waarvan 1 vega, geen noten', wensen: { vegetarisch: 1, veganistisch: 0, glutenvrij: 0, allergenen: ['noten'], overig: [] }, wensen_bron: 'ai' }),
            order(2, [regel(artikelen[1], 3, 'd-23', { event_id: 9 })], { opmerking: 'graag bellen' }),
            order(3, [regel(artikelen[2], 8, 'm-1', { event_id: 10 })], { moment_id: 'm-1' }),
            order(4, [regel(artikelen[3], 5, null)], { plaatsing_status: 'vaste_bak' }),
            order(5, [regel(artikelen[3], 2, null)], { status: 'wacht' }),
        ];
        const v = bouwVakjes(orders, artikelen, momenten, '2026-09-25', new Date('2026-09-25T10:00:00Z'));
        expect(v.map((x) => [x.soort, x.datum])).toEqual([['vaste_bak', '2026-09-25'], ['moment', '2026-10-16'], ['dag', '2026-12-23']]);

        const vandaag = v[0];
        expect(vandaag.stuks).toBe(5);
        expect(vandaag.orders.map((o) => o.id)).toEqual([4]);
        expect(vandaag.klaargezet).toEqual({ klaar: 0, totaal: 1 });
        expect(vandaag.eventId).toBeNull();

        const plank = v[1];
        expect(plank.personen).toBe(8);
        expect(plank.eventId).toBe(10);
        expect(plank.capaciteit).toEqual({ bezet: 1, totaal: 4, eenheid: 'planken' });
        expect(vakjeNaam(plank, artikelen)).toBe('Borrel Journey');

        const kerst = v[2];
        expect(kerst.personen).toBe(7);
        expect(kerst.vegetarisch).toBe(4); // 3 vega-artikel + 1 uit de opmerking van order 1
        expect(kerst.dozen).toEqual({ totaal: 2, groot: 1, klein: 1 });
        expect(kerst.allergenen).toEqual([{ naam: 'noten', aantal: 1 }]);
        expect(kerst.nietGelezen).toBe(1);
        expect(kerst.nietGeplaatst).toBe(0);
        expect(kerst.perArtikel.map((p) => [p.naam, p.aantal])).toEqual([['Kerst-Box', 4], ['Kerst-Box vegetarisch', 3]]);
        expect(vakjeNaam(kerst, artikelen)).toBe('Kerst-Box + Kerst-Box vegetarisch');
    });

    it('een betaalde regel zonder event op een moment is niet geplaatst', () => {
        const v = bouwVakjes([order(1, [regel(artikelen[0], 4, 'd-23')], { plaatsing_status: 'mislukt', plaatsing_fout: 'x' })], artikelen, momenten, '2026-09-25');
        expect(v.find((x) => x.soort === 'dag')?.nietGeplaatst).toBe(1);
    });

    it('een oude losse regel schuift naar vandaag; klaargezet en oud verdwijnt', () => {
        const oud = regel(artikelen[3], 1, null, { klaar_op: '2026-09-20' });
        const oudKlaar = regel(artikelen[3], 1, null, { klaar_op: '2026-09-20', klaargezet_at: '2026-09-20T12:00:00Z' });
        const v = bouwVakjes([order(1, [oud]), order(2, [oudKlaar])], artikelen, momenten, '2026-09-25');
        expect(v).toHaveLength(1);
        expect(v[0].regels.map((r) => r.regel.id)).toEqual([oud.id]);
    });

    it('een losse regel voor later krijgt zijn eigen vaste bak op die dag', () => {
        const v = bouwVakjes([order(1, [regel(artikelen[3], 1, null, { klaar_op: '2026-10-02' })])], artikelen, momenten, '2026-09-25');
        expect(v.map((x) => [x.soort, x.datum, x.regels.length])).toEqual([['vaste_bak', '2026-09-25', 0], ['vaste_bak', '2026-10-02', 1]]);
    });
});

describe('leesEuro', () => {
    it('leest komma en euroteken, leeg is null, onzin is undefined', () => {
        expect(leesEuro('€ 6,50')).toBe(650);
        expect(leesEuro('23.5')).toBe(2350);
        expect(leesEuro('')).toBeNull();
        expect(leesEuro('abc')).toBeUndefined();
    });
});
