import { describe, it, expect } from 'vitest';
import { naarContract, kortTijd, type BijsturingRij } from './websiteBijsturing';

const NU = new Date('2026-09-11T12:00:00+02:00');

const LEEG: BijsturingRij = {
    sluiting_reden: null,
    sluiting_tot: null,
    sluiting_actief: false,
    weekaanbod_van: null,
    weekaanbod_tot: null,
    weekaanbod_titel: null,
    weekaanbod_tekst: null,
    weekaanbod_producten: [],
    uitverkocht: [],
};

describe('naarContract — niets bijgestuurd', () => {
    it('geen rij is de normale toestand, geen fout', () => {
        expect(naarContract(null, [], NU)).toEqual({
            sluiting: null, openingstijden: [], weekaanbod: null, uitverkocht: [],
        });
    });

    it('een lege rij geeft hetzelfde als geen rij', () => {
        expect(naarContract(LEEG, [], NU)).toEqual(naarContract(null, [], NU));
    });
});

describe('naarContract — sluiting', () => {
    it('telt alleen als hij aan staat', () => {
        const rij = { ...LEEG, sluiting_reden: 'Op locatie', sluiting_tot: null, sluiting_actief: false };
        expect(naarContract(rij, [], NU).sluiting).toBeNull();
    });

    it('zonder einde is het tot nader bericht', () => {
        const rij = { ...LEEG, sluiting_reden: 'Op locatie', sluiting_actief: true };
        expect(naarContract(rij, [], NU).sluiting).toEqual({ reden: 'Op locatie', tot: null });
    });

    it('een verlopen sluiting wordt niet meer doorgegeven', () => {
        const rij = { ...LEEG, sluiting_reden: 'Op locatie', sluiting_tot: '2026-09-11T11:00:00+02:00', sluiting_actief: true };
        expect(naarContract(rij, [], NU).sluiting).toBeNull();
    });

    it('een sluiting die nog loopt gaat mee, met einde', () => {
        const rij = { ...LEEG, sluiting_reden: null, sluiting_tot: '2026-09-11T18:00:00+02:00', sluiting_actief: true };
        expect(naarContract(rij, [], NU).sluiting).toEqual({ reden: null, tot: '2026-09-11T18:00:00+02:00' });
    });
});

describe('naarContract — openingstijden', () => {
    it('dagen van vóór vandaag vallen weg, de rest op volgorde', () => {
        const uit = naarContract(LEEG, [
            { datum: '2026-09-13', van: null, tot: null, gesloten: true },
            { datum: '2026-09-10', van: '10:00:00', tot: '17:00:00', gesloten: false },
            { datum: '2026-09-11', van: '10:00:00', tot: '17:00:00', gesloten: false },
        ], NU);
        expect(uit.openingstijden).toEqual([
            { datum: '2026-09-11', van: '10:00', tot: '17:00', gesloten: false },
            { datum: '2026-09-13', van: null, tot: null, gesloten: true },
        ]);
    });

    it('kloktijden gaan zonder seconden de deur uit', () => {
        expect(kortTijd('09:30:00')).toBe('09:30');
        expect(kortTijd('09:30')).toBe('09:30');
        expect(kortTijd(null)).toBeNull();
    });
});

describe('naarContract — weekaanbod', () => {
    it('zonder periode is er geen aanbod, ook niet met tekst', () => {
        const rij = { ...LEEG, weekaanbod_titel: 'Deze week', weekaanbod_tekst: 'Zalm' };
        expect(naarContract(rij, [], NU).weekaanbod).toBeNull();
    });

    it('een voorbij aanbod bestaat niet meer', () => {
        const rij = { ...LEEG, weekaanbod_van: '2026-08-31', weekaanbod_tot: '2026-09-06', weekaanbod_titel: 'Vorige week' };
        expect(naarContract(rij, [], NU).weekaanbod).toBeNull();
    });

    it('een aanbod dat nog moet beginnen gaat wél mee', () => {
        const rij = { ...LEEG, weekaanbod_van: '2026-09-14', weekaanbod_tot: '2026-09-20', weekaanbod_producten: ['borrel-journey'] };
        expect(naarContract(rij, [], NU).weekaanbod).toEqual({
            van: '2026-09-14', tot: '2026-09-20', titel: null, tekst: null, producten: ['borrel-journey'],
        });
    });
});

describe('naarContract — uitverkocht', () => {
    it('gaat ongewijzigd door; de site filtert wat niet te koop is', () => {
        const rij = { ...LEEG, uitverkocht: ['borrel-journey', 'iets-onbekends'] };
        expect(naarContract(rij, [], NU).uitverkocht).toEqual(['borrel-journey', 'iets-onbekends']);
    });
});
