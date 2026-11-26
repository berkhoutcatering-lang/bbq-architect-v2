import { describe, expect, it } from 'vitest';
import { bouwBriefingVraag, leesBriefing, type BriefingArtikel } from './bestelBriefing';

const ARTIKELEN: BriefingArtikel[] = [
    { slug: 'kerst-box', naam: 'Kerst-Box', eenheid: 'per persoon' },
    { slug: 'droge-worst', naam: 'Droge worst', eenheid: 'per stuk' },
];
const VANDAAG = '2026-11-26';

describe('leesBriefing', () => {
    it('neemt een nette briefing over', () => {
        const b = leesBriefing({
            briefing: 'Tuns, 10 personen gourmet, afhalen 24 december.',
            vragen: ['Achternaam?'],
            klant: { naam: 'Tuns', email: null, telefoon: '+31650554877' },
            bron: 'telefoon',
            datum: '2026-12-24',
            tijd: '14.30',
            regels: [
                { soort: 'op-maat', naam: 'Gourmetpakket', aantal: 10, prijs_per_stuk: 9.95, toelichting: '' },
                { soort: 'artikel', slug: 'droge-worst', aantal: '2', prijs_per_stuk: null, toelichting: 'gerookt' },
            ],
            vegetarisch: 1,
            allergenen: ['Noten', 'kokos'],
            harde_regels: ['geen alcohol'],
            opmerking: '',
        }, ARTIKELEN, VANDAAG);
        expect(b).not.toBeNull();
        expect(b!.klant.telefoon).toBe('+31650554877');
        expect(b!.bron).toBe('telefoon');
        expect(b!.datum).toBe('2026-12-24');
        expect(b!.tijd).toBe('14:30');
        expect(b!.regels).toEqual([
            { soort: 'op-maat', slug: '', naam: 'Gourmetpakket', aantal: 10, stukCenten: 995, toelichting: '' },
            { soort: 'artikel', slug: 'droge-worst', naam: 'Droge worst', aantal: 2, stukCenten: null, toelichting: 'gerookt' },
        ]);
        expect(b!.allergenen).toEqual(['noten']);
        expect(b!.andereAllergenen).toEqual(['kokos']);
        expect(b!.vegetarisch).toBe(1);
    });

    it('maakt van een onbekende slug een regel op maat', () => {
        const b = leesBriefing({ regels: [{ soort: 'artikel', slug: 'bestaat-niet', naam: 'Spareribs', aantal: 3 }] }, ARTIKELEN, VANDAAG);
        expect(b!.regels[0]).toMatchObject({ soort: 'op-maat', naam: 'Spareribs', aantal: 3 });
    });

    it('gooit onzin weg: datum in het verleden, slecht e-mailadres, rare bron, rare prijs', () => {
        const b = leesBriefing({
            klant: { email: 'geen-mail' },
            bron: 'whatsapp',
            datum: '2026-11-01',
            tijd: '25:00',
            regels: [{ soort: 'artikel', slug: 'kerst-box', aantal: 0, prijs_per_stuk: 'gratis' }],
        }, ARTIKELEN, VANDAAG);
        expect(b!.klant.email).toBe('');
        expect(b!.bron).toBe('anders');
        expect(b!.datum).toBeNull();
        expect(b!.tijd).toBeNull();
        expect(b!.regels[0]).toMatchObject({ slug: 'kerst-box', aantal: null, stukCenten: null });
    });

    it('geeft null bij geen object', () => {
        expect(leesBriefing(null, ARTIKELEN, VANDAAG)).toBeNull();
        expect(leesBriefing('tekst', ARTIKELEN, VANDAAG)).toBeNull();
    });
});

describe('bouwBriefingVraag', () => {
    it('zet datum, assortiment en de woorden van Mathijs erin', () => {
        const v = bouwBriefingVraag({ artikelen: ARTIKELEN, beschrijving: '10 pers gourmet', vandaag: VANDAAG, weekdag: 'donderdag', fotoAantal: 1 });
        expect(v).toContain('donderdag 2026-11-26');
        expect(v).toContain('- kerst-box — Kerst-Box (per persoon)');
        expect(v).toContain('Mathijs zegt: 10 pers gourmet');
        expect(v).toContain('1 screenshot hierboven');
    });
});
