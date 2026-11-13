import { describe, expect, it } from 'vitest';
import type { Dagboeking } from './dagboeking';
import type { PeriodeMarge } from './verkoop';
import { dagKop, inkoopOnderschrift, kasVakje, kassaCijfers, lijstStaat, pinVakje } from './weergave';

const dag = (x: Partial<Dagboeking>): Dagboeking => ({
    datum: '2026-11-28', binnen: { pin: 0, contant: 0, cadeaubon: 0, totaal: 0 }, hokjes: [], totaal_hokjes: 0,
    sluit: true, stand: 'geboekt', aantal_bonnen: 64, gesloten_at: '2026-11-28T17:07:00Z', punten: [], ...x,
});
const marge: PeriodeMarge = { omzet_cents: 10000, inkoop_cents: 5220, marge_cents: 3780, marge_pct: 42, dekking_pct: 100, zonder_inkoopprijs: 0, geschat: 0 };

describe('kassaCijfers', () => {
    it('zet de dagen op datum, laat proefdagen weg en rekent om naar centen', () => {
        const uit = kassaCijfers(
            [{ datum: '2026-11-25', btw_pct: 9, omzet: 380, btw: 34.2 }, { datum: '2026-11-24', btw_pct: 9, omzet: 412, btw: 37.08 }],
            [
                { datum: '2026-11-25', orders: 16, betaald: 16, omzet: 380, btw: 34.2, uitgesloten: false },
                { datum: '2026-10-27', orders: 3, betaald: 3, omzet: 9, btw: 0.81, uitgesloten: true },
                { datum: '2026-11-24', orders: 18, betaald: 18, omzet: 412, btw: 37.08, uitgesloten: false },
            ]);
        expect(uit).toEqual({ omzet_cents: 79200, btw_cents: 7128, bonnen: 34, dagen: [{ datum: '2026-11-24', cents: 41200 }, { datum: '2026-11-25', cents: 38000 }] });
    });
});

describe('inkoopOnderschrift', () => {
    it('zegt over welk deel van de omzet de inkoopwaarde gaat zodra dat niet alles is', () => {
        expect(inkoopOnderschrift({ ...marge, dekking_pct: 93 })).toBe('Over 93% van de omzet');
        expect(inkoopOnderschrift(marge)).toBe('Van wat je verkocht');
        expect(inkoopOnderschrift({ ...marge, dekking_pct: 93, geschat: 1 })).toBe('Over 93% van de omzet · 1 artikel met de inkoopprijs van nu');
        expect(inkoopOnderschrift({ ...marge, geschat: 2 })).toBe('2 artikelen met de inkoopprijs van nu');
    });
});

describe('dagKop', () => {
    it('een laadfout geeft nooit een groen vinkje', () => {
        expect(dagKop(dag({}), { proefdag: false, fout: 'Kassabonnen niet te lezen: timeout' })).toMatchObject({ soort: 'fout', titel: 'Niet te laden' });
    });
    it('volgt anders de stand van de dag', () => {
        expect(dagKop(dag({}), { proefdag: false, fout: null })).toMatchObject({ soort: 'geboekt', titel: 'Dag geboekt', regel: 'Alles klopt, je hoeft niets te doen.' });
        expect(dagKop(dag({ stand: 'te_controleren', punten: ['a', 'b'] }), { proefdag: false, fout: null })).toMatchObject({ soort: 'te_controleren', regel: '2 punten om naar te kijken.' });
        expect(dagKop(dag({ stand: 'open' }), { proefdag: false, fout: null }).soort).toBe('open');
        expect(dagKop(dag({ stand: 'geen_verkoop' }), { proefdag: false, fout: null }).soort).toBe('geen_verkoop');
        expect(dagKop(dag({}), { proefdag: true, fout: null }).soort).toBe('proefdag');
    });
});

describe('kasVakje', () => {
    const basis = { afgesloten: true, in_de_la_cents: 14948, onverklaard: [] as number[], verklaard_open: false, goedgekeurd: false };
    it('niet afgesloten: geen oordeel', () => {
        expect(kasVakje({ ...basis, afgesloten: false })).toMatchObject({ toon: 'neutraal', waarde: 'Nog niet afgesloten' });
    });
    it('geteld gelijk aan verwacht: groen', () => {
        expect(kasVakje(basis)).toMatchObject({ toon: 'goed', kop: 'Kas klopt', onder: 'Geteld gelijk aan verwacht' });
    });
    it('twee verschillen die elkaar opheffen zijn nog steeds een verschil', () => {
        expect(kasVakje({ ...basis, onverklaard: [500, -500] })).toMatchObject({ toon: 'let_op', kop: 'Kasverschil' });
    });
    it('verklaard maar nog niet goedgekeurd: geen groen', () => {
        expect(kasVakje({ ...basis, verklaard_open: true })).toMatchObject({ toon: 'neutraal', kop: 'Kas verklaard', onder: 'Verschil verklaard door je kasregel, nog goedkeuren' });
    });
    it('een goedgekeurd verschil heet niet "gelijk aan verwacht"', () => {
        expect(kasVakje({ ...basis, goedgekeurd: true })).toMatchObject({ toon: 'goed', onder: 'Verschil goedgekeurd' });
    });
});

describe('pinVakje', () => {
    const basis = { afgesloten: true, pin_cents: 140250, verschillen: [] as number[], goedgekeurd: false };
    it('kassa en myPOS gelijk: groen', () => {
        expect(pinVakje(basis)).toMatchObject({ toon: 'goed', kop: 'Pin klopt', onder: 'Kassa en myPOS geven hetzelfde bedrag' });
    });
    it('verschillen die elkaar opheffen zijn nog steeds een verschil', () => {
        expect(pinVakje({ ...basis, verschillen: [300, -300] })).toMatchObject({ toon: 'let_op', kop: 'Pinverschil' });
    });
    it('goedgekeurd of niet afgesloten', () => {
        expect(pinVakje({ ...basis, goedgekeurd: true })).toMatchObject({ toon: 'goed', onder: 'Verschil goedgekeurd' });
        expect(pinVakje({ ...basis, afgesloten: false })).toMatchObject({ toon: 'neutraal', waarde: 'Nog niet afgesloten' });
    });
});

describe('lijstStaat', () => {
    it('een laadfout wint van "leeg": dan weten we niet of er niets is', () => {
        expect(lijstStaat(0, 'Dagstaten niet te lezen: timeout')).toBe('fout');
        expect(lijstStaat(0, null)).toBe('leeg');
        expect(lijstStaat(3, null)).toBe('lijst');
    });
});
