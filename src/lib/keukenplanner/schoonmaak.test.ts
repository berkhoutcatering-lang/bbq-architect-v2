import { describe, it, expect } from 'vitest';
import { schoonmaakDuur, zachteMarge, loontSchoonmakenNu } from './schoonmaak';

/* De Robot Coupe: acht minuten als je hem meteen doet, twintig als de
   mayonaise is ingedroogd, en dat begint na een half uur. */
const robotCoupe = {
    naam: 'Robot Coupe CL50',
    schoonmaakMin: 8,
    schoonmaakVervalNaMin: 30,
    schoonmaakKoudMin: 20,
};

describe('schoonmaakDuur — schoonmaken vervalt', () => {
    it('is goedkoop direct na gebruik', () => {
        const o = schoonmaakDuur(robotCoupe, 0);
        expect(o.duurMin).toBe(8);
        expect(o.ingedroogd).toBe(false);
        expect(o.winstMin).toBe(12);
        expect(o.nogGoedkoopMin).toBe(30);
    });

    it('telt af naar het moment dat het duurder wordt', () => {
        expect(schoonmaakDuur(robotCoupe, 25).nogGoedkoopMin).toBe(5);
    });

    it('wordt duur zodra je te laat bent', () => {
        const o = schoonmaakDuur(robotCoupe, 120);
        expect(o.duurMin).toBe(20);
        expect(o.ingedroogd).toBe(true);
        expect(o.winstMin).toBe(0);
        expect(o.reden).toContain('staat al 120 min');
    });

    it('doet niet alsof het verval bekend is als dat niet zo is', () => {
        /* Alleen een vaste schoonmaaktijd: dan is dat het beste wat we hebben
           en verzinnen we er geen krommere waarheid bij. */
        const o = schoonmaakDuur({ naam: 'Yoder', schoonmaakMin: 20 }, 200);
        expect(o.duurMin).toBe(20);
        expect(o.ingedroogd).toBe(false);
        expect(o.nogGoedkoopMin).toBeNull();
    });

    it('geeft onbekend terug zonder schoonmaaktijd', () => {
        expect(schoonmaakDuur({ naam: 'Iets', schoonmaakMin: null }, 0).duurMin).toBeNull();
    });

    it('negeert een verval dat goedkoper zou zijn dan vers — dat is invoerfout', () => {
        const raar = { naam: 'X', schoonmaakMin: 20, schoonmaakVervalNaMin: 30, schoonmaakKoudMin: 10 };
        expect(schoonmaakDuur(raar, 120).duurMin).toBe(20);
    });
});

describe('zachteMarge — mag een harde deadline nooit inhalen', () => {
    it('wordt nul maar nooit negatief', () => {
        /* Wie zijn uitlevering mist omdat de keukenmachine anders moeilijker
           schoon te maken was, heeft het verkeerde probleem opgelost. */
        expect(zachteMarge(schoonmaakDuur(robotCoupe, 200))).toBe(0);
    });

    it('telt af zolang je nog op tijd bent', () => {
        expect(zachteMarge(schoonmaakDuur(robotCoupe, 10))).toBe(20);
    });

    it('is oneindig als er geen verval bekend is', () => {
        expect(zachteMarge(schoonmaakDuur({ naam: 'Yoder', schoonmaakMin: 20 }, 5)))
            .toBe(Number.MAX_SAFE_INTEGER);
    });
});

describe('loontSchoonmakenNu', () => {
    it('doet het als het past en tijd bespaart', () => {
        const uit = loontSchoonmakenNu({
            oordeel: schoonmaakDuur(robotCoupe, 0), gatMin: 60, volgendGebruikOverMin: null,
        });
        expect(uit.doen).toBe(true);
        expect(uit.reden).toContain('scheelt 12 min');
    });

    it('doet het niet als het apparaat straks alweer nodig is', () => {
        /* Een schone machine die je tien minuten later weer vies maakt is
           weggegooide tijd. */
        const uit = loontSchoonmakenNu({
            oordeel: schoonmaakDuur(robotCoupe, 0), gatMin: 60, volgendGebruikOverMin: 5,
        });
        expect(uit.doen).toBe(false);
        expect(uit.reden).toContain('alweer nodig');
    });

    it('doet het niet als het niet in het gat past', () => {
        const uit = loontSchoonmakenNu({
            oordeel: schoonmaakDuur(robotCoupe, 120), gatMin: 10, volgendGebruikOverMin: null,
        });
        expect(uit.doen).toBe(false);
        expect(uit.reden).toContain('past niet');
    });
});
