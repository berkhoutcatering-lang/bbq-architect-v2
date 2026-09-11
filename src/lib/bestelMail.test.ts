import { describe, it, expect } from 'vitest';
import { bestelMailTekst, bestelMailHtml, gerechtenZin, ONDERWERP, type BestelMailGegevens } from './bestelMail';
import type { DoosOnderdeel } from './bestelstroom';
import BOX_FIXTURE from '../../docs/contracten/experience-v1-box.json';

const ONDERDELEN = (BOX_FIXTURE as unknown as { onderdelen: DoosOnderdeel[] }).onderdelen;

/* Het voorbeeld uit briefing §4, met de gecorrigeerde zestig. */
const KASPER: BestelMailGegevens = {
    voornaam: 'Kasper',
    titel: 'De Eettocht',
    personen: 6,
    afhaaldatum: '2026-12-22',
    startTijd: '16:30:00',
    adres: 'Sleedoorn 12, Schoonoord',
    url: 'https://example.invalid/k/PLAATSHOUDER-TOKEN-0000',
    onderdelen: ONDERDELEN,
    afzender: 'Mathijs',
    bedrijfsregel: 'Hop & Bites · Schoonoord',
};

describe('de platte tekst is woordelijk de briefing', () => {
    const tekst = bestelMailTekst(KASPER);

    it('opent zoals afgesproken', () => {
        expect(tekst.startsWith('Hoi Kasper,\n')).toBe(true);
        expect(tekst).toContain('Je gourmetbox is genoteerd. Hieronder staat wat erin gaat en wanneer je\nhem ophaalt.');
    });

    it('heeft de vier kopjes in de goede volgorde', () => {
        const posities = ['WAT JE KRIJGT', 'OPHALEN', 'JE EIGEN ROUTE', 'ALLERGENEN'].map((k) => tekst.indexOf(k));
        expect(posities.every((p) => p > -1)).toBe(true);
        expect([...posities].sort((a, b) => a - b)).toEqual(posities);
    });

    it('neemt de zinnen letterlijk over', () => {
        expect(tekst).toContain('Zet hem thuis meteen in de koeling. Op de sticker onderop de doos staat\nper onderdeel tot wanneer het goed is.');
        expect(tekst).toContain('Bewaar deze mail. Raakt het deksel weg, dan kom je er hiermee ook.');
        expect(tekst).toContain('bel ons even — we zoeken het na\nen verzinnen niets.');
        expect(tekst).toContain('Iedereen aan tafel scant op zijn eigen telefoon en loopt zijn eigen\nroute.');
    });

    it('rekent de samenstelling in plaats van hem in te tikken', () => {
        expect(tekst).toContain('Vijf gerechten, van elk twee stuks per persoon.');
        expect(tekst).toContain('60 stukjes vlees en vis, drie sauzen, twee zuren en twee salades.');
        expect(tekst).not.toContain('Dertig');
        expect(tekst).not.toContain('30 stukjes');
    });

    it('rekent de weekdag en de afsluiting uit de datum', () => {
        expect(tekst).toContain('Dinsdag 22 december, 16:30');
        expect(tekst).toContain('Tot de 22e,');
    });

    it('sluit af met afzender en bedrijfsregel', () => {
        expect(tekst.trimEnd().endsWith('Mathijs\nHop & Bites · Schoonoord')).toBe(true);
    });

    it('bevat de persoonlijke link', () => {
        expect(tekst).toContain('Jouw persoonlijke link: https://example.invalid/k/PLAATSHOUDER-TOKEN-0000');
    });
});

describe('wat er NIET in mag', () => {
    const tekst = bestelMailTekst(KASPER);

    it('noemt geen prijs of betaling', () => {
        expect(tekst).not.toMatch(/€|EUR|prijs|betaal/i);
    });

    it('noemt geen bereidingstijden — signaal in plaats van tijd', () => {
        expect(tekst).not.toMatch(/\d+\s*(minuten|minuut)/i);
    });

    it('tutoyeert', () => {
        expect(tekst).not.toMatch(/\bU\b|\buw\b/);
    });

    it('gebruikt geen uitroeptekens', () => {
        expect(tekst).not.toContain('!');
    });
});

describe('weglaten in plaats van verzinnen', () => {
    it('laat de adresregel weg als er geen adres is', () => {
        const tekst = bestelMailTekst({ ...KASPER, adres: null });
        expect(tekst).toContain('OPHALEN\nDinsdag 22 december, 16:30\n');
        expect(tekst).not.toContain('[adres]');
        /* Geen lege regel waar het adres had moeten staan. */
        expect(tekst).not.toMatch(/OPHALEN\n[^\n]*\n\n\n/);
    });

    it('laat de samenstelling weg zolang soort en per ontbreken', () => {
        const kaal = ONDERDELEN.map((o) => ({ naam: o.naam, aantal_per_persoon: o.aantal_per_persoon }));
        const tekst = bestelMailTekst({ ...KASPER, onderdelen: kaal });
        expect(tekst).toContain('De Eettocht · 6 personen');
        expect(tekst).not.toContain('stukjes vlees en vis');
    });
});

describe('gerechtenZin', () => {
    it('zegt "Vijf gerechten, van elk twee stuks per persoon."', () => {
        expect(gerechtenZin(ONDERDELEN)).toBe('Vijf gerechten, van elk twee stuks per persoon.');
    });

    /* "van elk twee stuks" is alleen waar als het écht van elk twee zijn. */
    it('zwijgt zodra de gerechten niet hetzelfde aantal hebben', () => {
        const ongelijk: DoosOnderdeel[] = [
            { naam: 'A', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 2 },
            { naam: 'B', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 3 },
        ];
        expect(gerechtenZin(ongelijk)).toBeNull();
    });

    it('zwijgt zonder onderdelen', () => {
        expect(gerechtenZin(null)).toBeNull();
        expect(gerechtenZin([])).toBeNull();
    });
});

describe('de HTML-versie', () => {
    const html = bestelMailHtml(KASPER);

    it('is licht, niet donker — Outlook keert donker onvoorspelbaar om', () => {
        expect(html).toContain('#EDE7D8');
        expect(html).toContain('#141311');
    });

    it('is 600 px breed en met tabellen opgebouwd', () => {
        expect(html).toContain('width="600"');
        expect(html).toContain('<table role="presentation"');
    });

    it('heeft alle opmaak inline, geen stylesheet', () => {
        expect(html).not.toContain('<style');
        expect(html).not.toContain('class=');
    });

    it('draagt dezelfde inhoud als de platte versie', () => {
        expect(html).toContain('Hoi Kasper,');
        expect(html).toContain('60 stukjes vlees en vis');
        expect(html).toContain('Dinsdag 22 december, 16:30');
        expect(html).toContain(KASPER.url);
    });

    it('ontsnapt tekens die de opmaak zouden breken', () => {
        const stout = bestelMailHtml({ ...KASPER, voornaam: 'Renée <script>' });
        expect(stout).toContain('Renée &lt;script&gt;');
        expect(stout).not.toContain('<script>');
    });
});

describe('het onderwerp', () => {
    it('is de regel uit de briefing', () => {
        expect(ONDERWERP('De Eettocht')).toBe('Je bestelling staat genoteerd — De Eettocht');
    });
});
