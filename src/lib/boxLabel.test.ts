import { describe, it, expect } from 'vitest';
import {
    stickerGegevens, pasNaamIn, isVolledig, mmNaarPx,
    type DoosSnapshot, type PasOpties,
} from './boxLabel';
import BOX_FIXTURE from '../../docs/contracten/experience-v1-box.json';

/* De fixture is het gedeelde contract met de Experience-app
   (docs/contracten/experience-v1.md). Hier wordt hij LETTERLIJK gebruikt, niet
   nagebouwd: zodra de vorm daar verandert zonder dat hier iets meebeweegt,
   wordt deze kant rood. Dat is het hele doel. */
const SNAPSHOT = BOX_FIXTURE as unknown as DoosSnapshot;

/* Een meetfunctie die zich gedraagt als een lettertype met vaste breedte:
   0,55 × de puntgrootte per teken. Genoeg om het passend maken te toetsen
   zonder canvas, en volstrekt voorspelbaar. */
const meet = (tekst: string, pt: number) => tekst.length * pt * 0.55;
const opties = (maxBreedte: number): PasOpties => ({ maxBreedte, maxPt: 48, minPt: 20, meet });

describe('de fixture is het contract', () => {
    it('draagt token, url, haltes en onderdelen', () => {
        expect(BOX_FIXTURE).toHaveProperty('token');
        expect(BOX_FIXTURE).toHaveProperty('url');
        expect(Array.isArray(BOX_FIXTURE.stops)).toBe(true);
        expect(Array.isArray(BOX_FIXTURE.onderdelen)).toBe(true);
    });

    it('elk onderdeel heeft de velden die de sticker en de zin nodig hebben', () => {
        for (const o of BOX_FIXTURE.onderdelen) {
            expect(o, `onderdeel ${o.naam}`).toMatchObject({
                naam: expect.any(String),
                soort: expect.any(String),
                per: expect.any(String),
                aantal_per_persoon: expect.any(Number),
                houdbaarheid_dagen: expect.any(Number),
            });
            expect(Array.isArray(o.allergenen)).toBe(true);
        }
    });

    it('bevat de aantallen uit de briefing: vijf gerechten, drie sauzen, twee zuren, twee salades', () => {
        const perSoort = (s: string) => BOX_FIXTURE.onderdelen.filter((o) => o.soort === s).length;
        expect(perSoort('proteïne')).toBe(5);
        expect(perSoort('saus')).toBe(3);
        expect(perSoort('zuur')).toBe(2);
        expect(perSoort('salade')).toBe(2);
    });
});

describe('stickerGegevens', () => {
    const basis = { naam: 'Kasper Nijsen', personen: 6, dozen: 1, afhaaldatum: '2026-12-22', startTijd: '16:30:00' };

    it('rekent de THT per onderdeel vanaf de afhaaldatum', () => {
        const g = stickerGegevens({ ...basis, snapshot: SNAPSHOT });
        const gerecht1 = g.onderdelen.find((o) => o.naam === 'Gerecht 1');
        expect(gerecht1?.houdbaarTot).toBe('2026-12-25');       // 22 dec + 3 dagen
        const zuur1 = g.onderdelen.find((o) => o.naam === 'Zuur 1');
        expect(zuur1?.houdbaarTot).toBe('2027-01-01');          // 22 dec + 10 dagen
    });

    it('vat de allergenen samen, ontdubbeld en op alfabet', () => {
        const g = stickerGegevens({ ...basis, snapshot: SNAPSHOT });
        expect(g.allergenen.lijst).toEqual(['ei', 'melk', 'mosterd', 'schaaldieren', 'vis']);
        expect(g.allergenen.onbekendVoor).toEqual([]);
    });

    /* Het gevaarlijkste wat een allergenensticker kan doen is "wij weten het
       niet" tonen als "er zit niets in". */
    it('houdt onbekend en leeg uit elkaar', () => {
        const gemengd: DoosSnapshot = {
            onderdelen: [
                { naam: 'Wel gekeken', allergenen: [] },
                { naam: 'Niet geleverd' },
                { naam: 'Uitdrukkelijk null', allergenen: null },
            ],
        };
        const g = stickerGegevens({ ...basis, snapshot: gemengd });
        expect(g.allergenen.lijst).toEqual([]);
        expect(g.allergenen.onbekendVoor).toEqual(['Niet geleverd', 'Uitdrukkelijk null']);
    });

    it('laat de houdbaarheid weg in plaats van hem te gokken', () => {
        const g = stickerGegevens({ ...basis, snapshot: { onderdelen: [{ naam: 'Zonder datum' }] } });
        expect(g.onderdelen[0].houdbaarTot).toBeNull();
    });

    it('maakt zonder snapshot toch een bruikbare sticker', () => {
        const g = stickerGegevens({ ...basis, snapshot: null });
        expect(g.naam).toBe('Kasper Nijsen');
        expect(g.moment).toBe('dinsdag 22 december, 16:30');
        expect(g.aantal).toBe('6 personen · één doos');
        expect(g.onderdelen).toEqual([]);
        expect(g.haltes).toEqual([]);
    });

    it('leest de haltes voor de kronkelweg', () => {
        const g = stickerGegevens({ ...basis, snapshot: SNAPSHOT });
        expect(g.haltes).toHaveLength(5);
    });

    it('zegt "één doos" en "2 dozen" zoals een mens het zegt', () => {
        expect(stickerGegevens({ ...basis, personen: 1, dozen: 1 }).aantal).toBe('1 persoon · één doos');
        expect(stickerGegevens({ ...basis, personen: 12, dozen: 2 }).aantal).toBe('12 personen · 2 dozen');
    });
});

describe('pasNaamIn — krimpen, dan meer regels, nooit afkappen', () => {
    it('houdt een korte naam op één grote regel', () => {
        const r = pasNaamIn('Kasper', opties(400));
        expect(r.regels).toEqual(['Kasper']);
        expect(r.pt).toBe(48);
    });

    it('krimpt eerst voordat hij afbreekt', () => {
        const r = pasNaamIn('Kasper Nijsen', opties(240));
        expect(r.regels).toHaveLength(1);
        expect(r.pt).toBeLessThan(48);
        expect(isVolledig('Kasper Nijsen', r.regels)).toBe(true);
    });

    it('breekt "Van der Meer-Hendriksen" op zonder één letter kwijt te raken', () => {
        const naam = 'Van der Meer-Hendriksen';
        const r = pasNaamIn(naam, opties(200));
        expect(r.regels.length).toBeGreaterThan(1);
        expect(isVolledig(naam, r.regels)).toBe(true);
        expect(r.regels.join(' ')).not.toContain('…');
        expect(r.regels.join(' ')).not.toContain('..');
    });

    it('mag ná een koppelteken afbreken en houdt het streepje bij het eerste deel', () => {
        const r = pasNaamIn('Meer-Hendriksen', opties(100));
        expect(isVolledig('Meer-Hendriksen', r.regels)).toBe(true);
        const metStreepje = r.regels.find((x) => x.endsWith('-'));
        if (r.regels.length > 1) expect(metStreepje).toBeDefined();
    });

    it('kapt zelfs een absurd lange naam niet af, maar meldt dat het krap is', () => {
        const naam = 'Wolfeschlegelsteinhausenbergerdorff';
        const r = pasNaamIn(naam, opties(60));
        expect(isVolledig(naam, r.regels)).toBe(true);
        expect(r.krap).toBe(true);
    });

    it('gaat goed met accenten en rare tekens', () => {
        for (const naam of ['Renée', 'Björn', 'Ø', 'Renée Ø Björn-Jansen']) {
            const r = pasNaamIn(naam, opties(150));
            expect(isVolledig(naam, r.regels), naam).toBe(true);
        }
    });

    it('doet niets raars met een lege naam', () => {
        expect(pasNaamIn('', opties(300)).regels).toEqual([]);
        expect(pasNaamIn('   ', opties(300)).regels).toEqual([]);
    });
});

describe('mmNaarPx', () => {
    /* De maten uit het plan. Renderen op een vaste maat en daarna schalen geeft
       rafelige letters, dus dpi is een parameter. */
    it('geeft 4 × 6 inch op 203 dpi als 812 × 1218', () => {
        expect(mmNaarPx(101.6, 203)).toBe(812);
        expect(mmNaarPx(152.4, 203)).toBe(1218);
    });

    it('geeft 4 × 6 inch op 300 dpi als 1200 × 1800', () => {
        expect(mmNaarPx(101.6, 300)).toBe(1200);
        expect(mmNaarPx(152.4, 300)).toBe(1800);
    });
});
