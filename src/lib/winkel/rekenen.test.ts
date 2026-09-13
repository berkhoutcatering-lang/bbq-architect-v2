import { describe, expect, it } from 'vitest';
import {
    berekenOfferte, btwDeel, dagInWoorden, eenhedenVan, leverkosten, maskeerEmail, verdeelDozen,
    type Artikel, type Instellingen, type MomentRij,
} from './rekenen';
import type { Mand } from './types';

/* ── Vaste testcatalogus, dezelfde slugs als de website ───────────────────── */

const basis: Omit<Artikel, 'id' | 'slug' | 'naam'> = {
    eenheid: 'per stuk', telt: 'stuks', prijs_cents: 100, btw_pct: 9, minimum: 1, maximum: null,
    verzendbaar: true, gekoeld: false, moment_soort: 'geen', moment_groep: null, afhaalmoment_tekst: null,
    capaciteit_soort: 'aantal', doos_klein_max: null, doos_groot: null, voorraad: null, actief: true, publiek: true,
};

const plank: Artikel = {
    ...basis, id: 'a-plank', slug: 'borrel-journey', naam: 'Borrel Journey', eenheid: 'per persoon', telt: 'personen',
    prijs_cents: 1495, minimum: 8, maximum: 80, verzendbaar: false, gekoeld: true,
    moment_soort: 'moment', moment_groep: 'agenda', capaciteit_soort: 'regel',
};
const kerst: Artikel = {
    ...basis, id: 'a-kerst', slug: 'kerst-box', naam: 'Kerst-Box', eenheid: 'per persoon', telt: 'personen',
    prijs_cents: 2350, minimum: 2, verzendbaar: false, gekoeld: true,
    moment_soort: 'dag', moment_groep: 'kerst-box', afhaalmoment_tekst: 'Afhalen op 23 of 24 december',
    capaciteit_soort: 'dozen', doos_klein_max: 3, doos_groot: 5,
};
const kerstVega: Artikel = { ...kerst, id: 'a-kerst-v', slug: 'kerst-box-vegetarisch', naam: 'Kerst-Box vegetarisch', publiek: false };
const amandelen: Artikel = { ...basis, id: 'a-amandel', slug: 'bbq-amandelen', naam: 'BBQ-amandelen', eenheid: 'per zak', prijs_cents: 695, maximum: 20, voorraad: 5 };
const zonderPrijs: Artikel = { ...basis, id: 'a-saus', slug: 'barbecuesaus', naam: 'Barbecuesaus', prijs_cents: null, actief: false };
const bier: Artikel = { ...basis, id: 'a-bier', slug: 'drenthe-bieravond', naam: 'Drenthe bieravond', prijs_cents: 3995, btw_pct: 21, verzendbaar: false };

const momenten: MomentRij[] = [
    { id: 'm-vrij', groep: 'agenda', datum: '2026-10-03', van: '16:00:00', tot: '19:00:00', capaciteit: 6, bestellen_tot: null, actief: true, bezet: 0 },
    { id: 'm-vol', groep: 'agenda', datum: '2026-10-10', van: '16:00:00', tot: '19:00:00', capaciteit: 6, bestellen_tot: null, actief: true, bezet: 6 },
    { id: 'm-voorbij', groep: 'agenda', datum: '2026-09-01', van: '16:00:00', tot: '19:00:00', capaciteit: 6, bestellen_tot: null, actief: true, bezet: 0 },
    { id: 'd-23', groep: 'kerst-box', datum: '2026-12-23', van: null, tot: null, capaciteit: 25, bestellen_tot: null, actief: true, bezet: 24 },
    { id: 'd-24', groep: 'kerst-box', datum: '2026-12-24', van: null, tot: null, capaciteit: 25, bestellen_tot: null, actief: true, bezet: 0 },
];

const instellingen: Instellingen = {
    verzendkosten_cents: 695, gratis_verzenden_vanaf_cents: 5000, verzendkosten_btw_pct: 21,
    reservering_minuten: 30, offerte_geldig_minuten: 15, kassa_open: true,
};

const nu = new Date('2026-09-13T12:00:00Z');
const bron = { artikelen: [plank, kerst, kerstVega, amandelen, zonderPrijs, bier], momenten, instellingen, nu };

function mand(regels: { slug: string; aantal: number; moment?: string | null }[]): Mand {
    return { versie: 1, regels: regels.map((r) => ({ moment: null, ...r })) };
}

/* ── Dozen ─────────────────────────────────────────────────────────────────── */

describe('verdeelDozen', () => {
    it('verdeelt personen over een kleine en een grote doos', () => {
        expect(verdeelDozen(2, 3, 5)).toEqual({ klein: 1, groot: 0, dozen: 1 });
        expect(verdeelDozen(3, 3, 5)).toEqual({ klein: 1, groot: 0, dozen: 1 });
        expect(verdeelDozen(4, 3, 5)).toEqual({ klein: 0, groot: 1, dozen: 1 });
        expect(verdeelDozen(5, 3, 5)).toEqual({ klein: 0, groot: 1, dozen: 1 });
        expect(verdeelDozen(7, 3, 5)).toEqual({ klein: 1, groot: 1, dozen: 2 });
        expect(verdeelDozen(9, 3, 5)).toEqual({ klein: 0, groot: 2, dozen: 2 });
        expect(verdeelDozen(10, 3, 5)).toEqual({ klein: 0, groot: 2, dozen: 2 });
        expect(verdeelDozen(12, 3, 5)).toEqual({ klein: 1, groot: 2, dozen: 3 });
    });
    it('de grens van de kleine doos is instelbaar', () => {
        expect(verdeelDozen(4, 4, 5)).toEqual({ klein: 1, groot: 0, dozen: 1 });
        expect(verdeelDozen(2, 2, 5)).toEqual({ klein: 1, groot: 0, dozen: 1 });
        expect(verdeelDozen(3, 2, 5)).toEqual({ klein: 0, groot: 1, dozen: 1 });
    });
    it('eenhedenVan volgt de capaciteitssoort', () => {
        expect(eenhedenVan(plank, 24)).toBe(1);
        expect(eenhedenVan(amandelen, 3)).toBe(3);
        expect(eenhedenVan(kerst, 7)).toBe(2);
    });
});

/* ── Geld ──────────────────────────────────────────────────────────────────── */

describe('geld', () => {
    it('btw uit een bedrag inclusief, in hele centen', () => {
        expect(btwDeel(10900, 9)).toBe(900);
        expect(btwDeel(1495, 9)).toBe(123);
        expect(btwDeel(695, 21)).toBe(121);
        expect(btwDeel(1000, 0)).toBe(0);
    });
    it('verzendkosten: tarief, gratis boven de grens, en uit als er geen tarief is', () => {
        expect(leverkosten(instellingen, 'afhalen', 100)).toBe(0);
        expect(leverkosten(instellingen, 'verzenden', 1000)).toBe(695);
        expect(leverkosten(instellingen, 'verzenden', 5000)).toBe(0);
        expect(leverkosten({ ...instellingen, verzendkosten_cents: null }, 'verzenden', 1000)).toBeNull();
        expect(leverkosten({ ...instellingen, gratis_verzenden_vanaf_cents: null }, 'verzenden', 99999)).toBe(695);
    });
    it('maskeert een e-mailadres zoals de website', () => {
        expect(maskeerEmail('test@voorbeeld.nl')).toBe('t•••@voorbeeld.nl');
        expect(maskeerEmail('rommel')).toBe('•••');
    });
    it('dag in woorden', () => {
        expect(dagInWoorden('2026-12-23')).toBe('23 december');
    });
});

/* ── Offerte ───────────────────────────────────────────────────────────────── */

describe('berekenOfferte', () => {
    it('rekent een plank uit op de server, in centen, met het moment erbij', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 12, moment: 'm-vrij' }]), 'afhalen', null);
        expect(uit.ok).toBe(true);
        if (!uit.ok) return;
        expect(uit.intern.offerte.regels[0]).toMatchObject({ slug: 'borrel-journey', aantal: 12, stukCenten: 1495, bedragCenten: 17940, eenheid: 'per persoon', afhaalmoment: null });
        expect(uit.intern.offerte.subtotaalCenten).toBe(17940);
        expect(uit.intern.offerte.leverkostenCenten).toBe(0);
        expect(uit.intern.offerte.totaalCenten).toBe(17940);
        expect(uit.intern.offerte.moment).toEqual({ id: 'm-vrij', datum: '2026-10-03', van: '16:00:00', tot: '19:00:00', vrij: 6 });
        expect(uit.intern.regels[0]).toMatchObject({ moment_id: 'm-vrij', eenheden: 1, voorraad_eenheden: 0 });
        expect(uit.intern.btwCenten).toEqual({ '9': btwDeel(17940, 9) });
        expect(uit.intern.offerte.geldigTot).toBe('2026-09-13T12:15:00.000Z');
    });

    it('het ordermoment mag ook als momentId meekomen', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8 }]), 'afhalen', 'm-vrij');
        expect(uit.ok).toBe(true);
    });

    it('een lege mand, een onbekend product en een product zonder prijs zijn validatiefouten', () => {
        expect(berekenOfferte(bron, mand([]), 'afhalen', null)).toEqual({ ok: false, soort: 'validatie', fouten: ['Je mand is leeg.'] });
        const uit = berekenOfferte(bron, mand([{ slug: 'bestaat-niet', aantal: 1 }, { slug: 'barbecuesaus', aantal: 1 }]), 'afhalen', null);
        expect(uit).toEqual({ ok: false, soort: 'validatie', fouten: ['Dit product bestaat niet meer in ons aanbod.', 'Barbecuesaus kan op dit moment niet besteld worden.'] });
    });

    it('bewaakt minimum en maximum', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 4, moment: 'm-vrij' }, { slug: 'bbq-amandelen', aantal: 21 }]), 'afhalen', null);
        expect(uit).toEqual({ ok: false, soort: 'validatie', fouten: ['Borrel Journey gaat vanaf 8 personen.', 'BBQ-amandelen gaat tot 20 stuks per bestelling.'] });
    });

    it('een plank zonder moment, op een verlopen moment, of op een vol moment', () => {
        const zonder = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8 }]), 'afhalen', null);
        expect(zonder).toEqual({ ok: false, soort: 'validatie', fouten: ['Kies een afhaalmoment voor Borrel Journey.'] });
        const voorbij = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8, moment: 'm-voorbij' }]), 'afhalen', null);
        expect(voorbij).toMatchObject({ ok: false, soort: 'moment-verlopen' });
        const onbekend = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8, moment: 'x' }]), 'afhalen', null);
        expect(onbekend).toMatchObject({ ok: false, soort: 'moment-verlopen' });
        const vol = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8, moment: 'm-vol' }]), 'afhalen', null);
        expect(vol).toMatchObject({ ok: false, soort: 'moment-vol' });
        const kerstdag = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8, moment: 'd-24' }]), 'afhalen', null);
        expect(kerstdag).toMatchObject({ ok: false, soort: 'moment-verlopen' });
    });

    it('twee planken op twee momenten is één afspraak te veel', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8, moment: 'm-vrij' }, { slug: 'borrel-journey', aantal: 8, moment: 'm-vol' }]), 'afhalen', null);
        expect(uit).toEqual({ ok: false, soort: 'validatie', fouten: ['Kies één afhaalmoment voor de hele bestelling.'] });
    });

    it('een plank kan niet per post', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8, moment: 'm-vrij' }]), 'verzenden', null);
        expect(uit).toEqual({ ok: false, soort: 'validatie', fouten: ['Borrel Journey kan niet per post: gekoeld, en dat overleeft de reis niet. Deze bestelling haal je op in Schoonoord.'] });
    });

    it('verzenden: tarief erbij, gratis boven de grens, 21% btw over de verzendkosten', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'bbq-amandelen', aantal: 2 }]), 'verzenden', null);
        expect(uit.ok).toBe(true);
        if (!uit.ok) return;
        expect(uit.intern.offerte.leverkostenCenten).toBe(695);
        expect(uit.intern.offerte.totaalCenten).toBe(2 * 695 + 695);
        expect(uit.intern.offerte.moment).toBeNull();
        expect(uit.intern.btwCenten).toEqual({ '9': btwDeel(1390, 9), '21': btwDeel(695, 21) });
        expect(uit.intern.regels[0]).toMatchObject({ moment_id: null, eenheden: 0, voorraad_eenheden: 2 });

        const gratis = berekenOfferte({ ...bron, artikelen: [{ ...amandelen, voorraad: null }] }, mand([{ slug: 'bbq-amandelen', aantal: 10 }]), 'verzenden', null);
        expect(gratis.ok && gratis.intern.offerte.leverkostenCenten).toBe(0);
    });

    it('verzenden zonder tarief is nog niet beschikbaar', () => {
        const uit = berekenOfferte({ ...bron, instellingen: { ...instellingen, verzendkosten_cents: null } }, mand([{ slug: 'bbq-amandelen', aantal: 1 }]), 'verzenden', null);
        expect(uit).toEqual({ ok: false, soort: 'validatie', fouten: ['Verzenden is nog niet beschikbaar. Kies afhalen.'] });
    });

    it('voorraad: meer vragen dan er is', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'bbq-amandelen', aantal: 6 }]), 'afhalen', null);
        expect(uit).toEqual({ ok: false, soort: 'validatie', fouten: ['BBQ-amandelen is nog maar 5 keer beschikbaar.'] });
    });

    it('Kerst-Box: dag kiezen, dozen tellen, tekst met de dag erin', () => {
        const zonder = berekenOfferte(bron, mand([{ slug: 'kerst-box', aantal: 4 }]), 'afhalen', null);
        expect(zonder).toEqual({ ok: false, soort: 'validatie', fouten: ['Kies een afhaaldag voor Kerst-Box (23 december of 24 december).'] });

        const uit = berekenOfferte(bron, mand([{ slug: 'kerst-box', aantal: 7, moment: 'd-24' }]), 'afhalen', null);
        expect(uit.ok).toBe(true);
        if (!uit.ok) return;
        expect(uit.intern.offerte.regels[0]).toMatchObject({ bedragCenten: 7 * 2350, afhaalmoment: 'Afhalen op 24 december' });
        expect(uit.intern.regels[0]).toMatchObject({ moment_id: 'd-24', eenheden: 2 });
        expect(uit.intern.offerte.moment).toEqual({ id: 'd-24', datum: '2026-12-24', van: null, tot: null, vrij: 25 });
        expect(uit.intern.momentId).toBe('d-24');
    });

    it('Kerst-Box: geen maximum, en een volle dag is vol in dozen', () => {
        const groot = berekenOfferte(bron, mand([{ slug: 'kerst-box', aantal: 40, moment: 'd-24' }]), 'afhalen', null);
        expect(groot.ok).toBe(true);
        // d-23 heeft nog 1 doos vrij: 3 personen (één kleine) past, 4 (één grote) past ook, 7 (twee dozen) niet.
        expect(berekenOfferte(bron, mand([{ slug: 'kerst-box', aantal: 3, moment: 'd-23' }]), 'afhalen', null).ok).toBe(true);
        const vol = berekenOfferte(bron, mand([{ slug: 'kerst-box', aantal: 7, moment: 'd-23' }]), 'afhalen', null);
        expect(vol).toEqual({ ok: false, soort: 'moment-vol', melding: 'Deze afhaaldag (23 december) is inmiddels vol. Kies een andere dag.' });
    });

    it('de vegetarische Kerst-Box deelt de dagen en de capaciteit', () => {
        const samen = berekenOfferte(bron, mand([{ slug: 'kerst-box', aantal: 4, moment: 'd-23' }, { slug: 'kerst-box-vegetarisch', aantal: 2, moment: 'd-23' }]), 'afhalen', null);
        expect(samen).toMatchObject({ ok: false, soort: 'moment-vol' });
        const apart = berekenOfferte(bron, mand([{ slug: 'kerst-box', aantal: 4, moment: 'd-24' }, { slug: 'kerst-box-vegetarisch', aantal: 2, moment: 'd-24' }]), 'afhalen', null);
        expect(apart.ok).toBe(true);
        if (!apart.ok) return;
        expect(apart.intern.offerte.totaalCenten).toBe(6 * 2350);
    });

    it('plank én Kerst-Box: het ordermoment is het plankmoment, de dag staat in de regel', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'borrel-journey', aantal: 8, moment: 'm-vrij' }, { slug: 'kerst-box', aantal: 2, moment: 'd-24' }]), 'afhalen', null);
        expect(uit.ok).toBe(true);
        if (!uit.ok) return;
        expect(uit.intern.offerte.moment?.id).toBe('m-vrij');
        expect(uit.intern.offerte.regels[1]?.afhaalmoment).toContain('24 december');
    });

    it('21% btw op een doos met bier', () => {
        const uit = berekenOfferte(bron, mand([{ slug: 'drenthe-bieravond', aantal: 1 }]), 'afhalen', null);
        expect(uit.ok && uit.intern.btwCenten).toEqual({ '21': btwDeel(3995, 21) });
    });

    it('een dichte kassa neemt niets aan', () => {
        const uit = berekenOfferte({ ...bron, instellingen: { ...instellingen, kassa_open: false } }, mand([{ slug: 'bbq-amandelen', aantal: 1 }]), 'afhalen', null);
        expect(uit).toMatchObject({ ok: false, soort: 'niet-beschikbaar' });
    });
});
