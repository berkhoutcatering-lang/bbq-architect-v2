import { describe, expect, it } from 'vitest';
import { formaatInDots, label, mmNaarDots, parseHqes, pasTekst, qr, qrVergrotingVoor, qrZijde, stroom, tekst, tekstBreedte, zplEscape } from './zpl';
import { STANDAARD_LABEL } from './types';

describe('maten', () => {
    it('60 × 40 mm op 203 dpi is 480 × 320 dots', () => {
        expect(formaatInDots(STANDAARD_LABEL)).toEqual({ breedte: 480, hoogte: 320 });
    });
    it('4 inch op 203 dpi is 812 dots', () => {
        expect(mmNaarDots(101.6, 203)).toBe(812);
    });
});

describe('zplEscape', () => {
    it('maakt stuurtekens onschadelijk', () => {
        expect(zplEscape('a^b~c\\d')).toBe('a\\5Eb\\7Ec\\5Cd');
    });
    it('laat accenten met rust en maakt regelovergangen spaties', () => {
        expect(zplEscape('Renée\nBjörn')).toBe('Renée Björn');
    });
    it('vertaalt tekens die het printerlettertype niet kent', () => {
        expect(zplEscape('≤ -18 °C')).toBe('max. -18 °C');
        expect(zplEscape('≥4 °C')).toBe('min. 4 °C');
        expect(zplEscape('Renée – Björn')).toBe('Renée - Björn');
    });
    it('een productnaam kan nooit een commando worden', () => {
        const veld = tekst({ x: 0, y: 0, hoogte: 20, tekst: '^XZ^XA' });
        expect(veld).not.toContain('^FD^XZ');
        expect(veld).toContain('\\5EXZ\\5EXA');
    });
});

describe('pasTekst', () => {
    it('krimpt eerst, dan twee regels, nooit afkappen', () => {
        const kort = pasTekst('UI', 300, 44, 22);
        expect(kort).toEqual({ hoogte: 44, regels: 1, past: true });

        const lang = pasTekst('GEROOKTE PROCUREUR MET KOFFIERUB', 290, 44, 22);
        expect(lang.past).toBe(true);
        expect(lang.regels).toBe(2);
        expect(lang.hoogte).toBeLessThanOrEqual(44);
        expect(lang.hoogte).toBeGreaterThanOrEqual(22);
    });
    it('meldt het als het echt niet past', () => {
        const r = pasTekst('WOLFESCHLEGELSTEINHAUSENBERGERDORFF', 120, 30, 20);
        expect(r.past).toBe(false);
    });
    it('hoofdletters zijn breder dan kleine letters', () => {
        expect(tekstBreedte('PULLED', 40)).toBeGreaterThan(tekstBreedte('pulled', 40));
    });
});

describe('qr', () => {
    it('kiest de grootste vergroting die in het vak past', () => {
        const url = 'https://app.example.nl/scan/8f3a1c2e-1111-2222-3333-444455556666';
        const v = qrVergrotingVoor(url, 150);
        expect(qrZijde(url, v)).toBeLessThanOrEqual(150);
        expect(qrZijde(url, v + 1)).toBeGreaterThan(150);
        expect(qr(10, 10, url, v)).toContain(`^BQN,2,${v}`);
    });
});

describe('label en stroom', () => {
    it('zet UTF-8, maat en precies één exemplaar', () => {
        const z = label({ breedte: 480, hoogte: 320 }, ['^FO1,1^FDx^FS']);
        expect(z.startsWith('^XA^CI28^PW480^LL320')).toBe(true);
        expect(z).toContain('^MNY');
        expect(z.endsWith('^PQ1^XZ')).toBe(true);
    });
    it('doorlopend materiaal gebruikt ^MNN', () => {
        expect(label({ breedte: 480, hoogte: 320 }, [], { doorlopend: true })).toContain('^MNN');
    });
    it('twaalf labels zijn twaalf ^XA-blokken in één stroom', () => {
        const s = stroom(Array.from({ length: 12 }, () => label({ breedte: 480, hoogte: 320 }, [])));
        expect((s.match(/\^XA/g) ?? []).length).toBe(12);
    });
});

describe('parseHqes', () => {
    it('leest "gereed"', () => {
        const s = parseHqes('\n  PRINTER STATUS\n   ERRORS:         0 00000000 00000000\n   WARNINGS:       0 00000000 00000000\n');
        expect(s.online).toBe(true);
        expect(s.fout).toBe(false);
        expect(s.papierOp).toBe(false);
        expect(s.omschrijving).toBe('Gereed');
    });
    it('leest papier op (bit 0) en klep open (bit 2)', () => {
        expect(parseHqes('ERRORS: 1 00000000 00000001\nWARNINGS: 0 00000000 00000000').papierOp).toBe(true);
        const klep = parseHqes('ERRORS: 1 00000000 00000004\nWARNINGS: 0 00000000 00000000');
        expect(klep.klepOpen).toBe(true);
        expect(klep.omschrijving).toBe('Klep open');
    });
    it('leest pauze uit de waarschuwingen', () => {
        const s = parseHqes('ERRORS: 0 00000000 00000000\nWARNINGS: 1 00000000 00000008');
        expect(s.pauze).toBe(true);
        expect(s.fout).toBe(false);
    });
    it('onbegrijpelijk antwoord is offline, met het ruwe antwoord erbij', () => {
        const s = parseHqes('garbage');
        expect(s.online).toBe(false);
        expect(s.ruw).toBe('garbage');
    });
});
