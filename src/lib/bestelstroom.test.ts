import { describe, it, expect } from 'vitest';
import {
    berekenDozen,
    samenstellingsZin,
    formatteerDatum,
    formatteerAfhaalmoment,
    kortTijd,
    houdbaarTot,
    afleidVoornaam,
    zinsopsomming,
    datumMinMaanden,
    type DoosOnderdeel,
} from './bestelstroom';

/* De Eettocht zoals aanroep A hem straks teruggeeft: vijf gerechten van elk
   twee stuks per persoon, plus bijgerechten die per DOOS gaan en dus niet
   meeschalen met de teller. */
const EETTOCHT: DoosOnderdeel[] = [
    { naam: 'Bavette', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 2, houdbaarheid_dagen: 3 },
    { naam: 'Procureur', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 2, houdbaarheid_dagen: 3 },
    { naam: 'Kipdij', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 2, houdbaarheid_dagen: 2 },
    { naam: 'Gamba', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 2, houdbaarheid_dagen: 2 },
    { naam: 'Zalm', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 2, houdbaarheid_dagen: 2 },
    { naam: 'Chimichurri', soort: 'saus', per: 'doos', aantal_per_persoon: 1 },
    { naam: 'Knoflooksaus', soort: 'saus', per: 'doos', aantal_per_persoon: 1 },
    { naam: 'Barbecuesaus', soort: 'saus', per: 'doos', aantal_per_persoon: 1 },
    { naam: 'Zoetzure ui', soort: 'zuur', per: 'doos', aantal_per_persoon: 1 },
    { naam: 'Augurk', soort: 'zuur', per: 'doos', aantal_per_persoon: 1 },
    { naam: 'Coleslaw', soort: 'salade', per: 'doos', aantal_per_persoon: 1 },
    { naam: 'Aardappelsalade', soort: 'salade', per: 'doos', aantal_per_persoon: 1 },
];

describe('berekenDozen', () => {
    it('schaalt mee tot acht personen', () => {
        expect(berekenDozen(1, 8)).toBe(1);
        expect(berekenDozen(6, 8)).toBe(1);
        expect(berekenDozen(8, 8)).toBe(1);
    });

    it('wordt een tweede doos zodra het niet meer past', () => {
        expect(berekenDozen(9, 8)).toBe(2);
        expect(berekenDozen(12, 8)).toBe(2);
        expect(berekenDozen(16, 8)).toBe(2);
        expect(berekenDozen(17, 8)).toBe(3);
    });

    it('weigert te raden als de doosmaat onbekend is', () => {
        expect(berekenDozen(6, null)).toBeNull();
        expect(berekenDozen(6, undefined)).toBeNull();
        expect(berekenDozen(6, 0)).toBeNull();
    });

    it('weigert een onmogelijk aantal personen', () => {
        expect(berekenDozen(0, 8)).toBeNull();
        expect(berekenDozen(-3, 8)).toBeNull();
    });
});

describe('samenstellingsZin', () => {
    /* De fout die dit hele mechanisme moest voorkomen: in de briefing stond
       twee keer "dertig stukjes" terwijl vijf gerechten × twee stuks × zes
       personen zestig is. Gerekend kan dat niet meer misgaan. */
    it('rekent zestig stukjes bij zes personen, niet dertig', () => {
        const zin = samenstellingsZin(EETTOCHT, 6);
        expect(zin).toContain('60 stukjes vlees en vis');
        expect(zin).not.toContain('30 stukjes');
    });

    it('laat het cijfer meelopen met de teller', () => {
        expect(samenstellingsZin(EETTOCHT, 2)).toContain('20 stukjes');
        expect(samenstellingsZin(EETTOCHT, 8)).toContain('80 stukjes');
    });

    it('laat de bijgerechten NIET meeschalen, want die gaan per doos', () => {
        const zes = samenstellingsZin(EETTOCHT, 6);
        const twee = samenstellingsZin(EETTOCHT, 2);
        expect(zes).toContain('drie sauzen');
        expect(twee).toContain('drie sauzen');
    });

    it('telt gelijksoortige onderdelen op tot één telwoord', () => {
        expect(samenstellingsZin(EETTOCHT, 6))
            .toBe('60 stukjes vlees en vis, drie sauzen, twee zuren en twee salades.');
    });

    it('laat de zin weg zodra soort en per ontbreken', () => {
        /* Zolang die twee velden niet in het contract zitten, is er niets te
           rekenen — en dan hoort er niets te staan in plaats van een gok. */
        const zonder: DoosOnderdeel[] = EETTOCHT.map((o) => ({ naam: o.naam, aantal_per_persoon: o.aantal_per_persoon }));
        expect(samenstellingsZin(zonder, 6)).toBeNull();
    });

    it('telt een onderdeel zonder aantal gewoon niet mee', () => {
        const half: DoosOnderdeel[] = [
            { naam: 'Bavette', soort: 'proteïne', per: 'persoon', aantal_per_persoon: 2 },
            { naam: 'Onbekend', soort: 'proteïne', per: 'persoon', aantal_per_persoon: null },
        ];
        expect(samenstellingsZin(half, 6)).toBe('12 stukjes vlees en vis.');
    });

    it('geeft null bij een lege of ontbrekende lijst', () => {
        expect(samenstellingsZin([], 6)).toBeNull();
        expect(samenstellingsZin(null, 6)).toBeNull();
        expect(samenstellingsZin(EETTOCHT, 0)).toBeNull();
    });
});

describe('zinsopsomming', () => {
    it('zet geen komma voor "en"', () => {
        expect(zinsopsomming(['a', 'b', 'c'])).toBe('a, b en c');
        expect(zinsopsomming(['a', 'b'])).toBe('a en b');
        expect(zinsopsomming(['a'])).toBe('a');
        expect(zinsopsomming([])).toBe('');
    });
});

describe('formatteerDatum', () => {
    /* 22 december 2026 is een dinsdag. Dat is precies waarom de weekdag
       gerekend wordt: dezelfde datum in 2025 is een maandag. */
    it('rekent de weekdag uit de datum', () => {
        expect(formatteerDatum('2026-12-22')).toBe('dinsdag 22 december');
        expect(formatteerDatum('2025-12-22')).toBe('maandag 22 december');
        expect(formatteerDatum('2026-12-14')).toBe('maandag 14 december');
    });

    it('verschuift niet door een tijdzone', () => {
        /* Met new Date('2026-01-01') en een negatieve offset zou dit
           31 december worden. */
        expect(formatteerDatum('2026-01-01')).toBe('donderdag 1 januari');
        expect(formatteerDatum('2026-12-31')).toBe('donderdag 31 december');
    });

    it('weigert onzin in plaats van iets te verzinnen', () => {
        expect(formatteerDatum('2026-02-31')).toBeNull();
        expect(formatteerDatum('22-12-2026')).toBeNull();
        expect(formatteerDatum('')).toBeNull();
    });
});

describe('formatteerAfhaalmoment', () => {
    it('zet datum en tijd op één regel', () => {
        expect(formatteerAfhaalmoment('2026-12-22', '16:30:00')).toBe('dinsdag 22 december, 16:30');
    });

    it('laat de tijd weg als die er niet is', () => {
        expect(formatteerAfhaalmoment('2026-12-22', null)).toBe('dinsdag 22 december');
    });
});

describe('kortTijd', () => {
    it('haalt de seconden eraf', () => {
        expect(kortTijd('16:30:00')).toBe('16:30');
        expect(kortTijd('09:05')).toBe('09:05');
        expect(kortTijd(null)).toBeNull();
    });
});

describe('houdbaarTot', () => {
    it('rekent vanaf de afhaaldatum', () => {
        expect(houdbaarTot('2026-12-22', 3)).toBe('2026-12-25');
    });

    it('rolt netjes over de maandgrens', () => {
        expect(houdbaarTot('2026-12-30', 3)).toBe('2027-01-02');
    });

    it('geeft null als de houdbaarheid onbekend is', () => {
        expect(houdbaarTot('2026-12-22', null)).toBeNull();
        expect(houdbaarTot('2026-12-22', undefined)).toBeNull();
    });
});

describe('afleidVoornaam', () => {
    it('pakt het eerste woord', () => {
        expect(afleidVoornaam('Kasper Nijsen')).toBe('Kasper');
        expect(afleidVoornaam('Renée van der Meer')).toBe('Renée');
    });

    it('gaat mis bij een familienaam — en dat is waarom het veld corrigeerbaar is', () => {
        /* Dit is geen bug maar de reden dat de hub dit veld toont naast de
           stickervoorbeeldweergave: "Welkom Fam." mag niet op tafel komen. */
        expect(afleidVoornaam('Fam. Berkhout')).toBe('Fam.');
    });

    it('overleeft rommelige invoer', () => {
        expect(afleidVoornaam('   Björn   Ø  ')).toBe('Björn');
        expect(afleidVoornaam('')).toBe('');
    });
});

describe('datumMinMaanden', () => {
    it('telt gewoon terug', () => {
        expect(datumMinMaanden('2027-06-22', 6)).toBe('2026-12-22');
        expect(datumMinMaanden('2028-06-01', 18)).toBe('2026-12-01');
    });

    it('verspringt niet over een jaargrens heen', () => {
        expect(datumMinMaanden('2027-02-15', 6)).toBe('2026-08-15');
    });

    /* 31 augustus min zes maanden is 31 februari — die bestaat niet. Dan de
       laatste dag van februari, nooit doorrollen naar maart: eerder wissen dan
       afgesproken mag niet. */
    it('rolt niet door bij een maand die de dag niet heeft', () => {
        expect(datumMinMaanden('2027-08-31', 6)).toBe('2027-02-28');
        expect(datumMinMaanden('2028-08-31', 6)).toBe('2028-02-29');
    });

    it('weigert onzin', () => {
        expect(datumMinMaanden('22-06-2027', 6)).toBeNull();
        expect(datumMinMaanden('', 6)).toBeNull();
        expect(datumMinMaanden('2027-06-22', -1)).toBeNull();
    });
});
