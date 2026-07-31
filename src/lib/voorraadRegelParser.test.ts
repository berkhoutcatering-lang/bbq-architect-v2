import { describe, it, expect } from 'vitest';
import { parseerRegel, parseerLijst, regelTotaal, regelSom, wisselEenheid } from './voorraadRegelParser';

/* De echte vriezerlijst van Sam, letterlijk overgetypt inclusief typefouten.
   Dit is de maatstaf: wat hier uit komt, komt in zijn voorraad te staan. */
const VRIEZERLIJST = `11x pulled beef 500g
900 gram coppa ham
1,6 kg bavette
Carpaccio vlees 6200 gram
40kg pulled pork
33x zakje Knol a 85 gram
5kg buikspek plak speklap
34x canelle kruidenboter
42 mini brioche calr Sieger
95 mojnksballss
10x langos
185x30gram mini gehaktballetjes
8x zakje gerookte bieten gel
43x wortel 3per zakje a80 gram
9 zakjes passievrucht gel
13zakjes aardbij gel,
1,2 kg diepvries aardbei
900 gram panchetta
500 gram torpedo garnaal`;

describe('parseerRegel — de vormen die echt voorkomen', () => {
    it('leest "11x pulled beef 500g" als 11 pakken van een halve kilo', () => {
        const r = parseerRegel('11x pulled beef 500g')!;
        expect(r.aantal).toBe(11);
        expect(r.inhoud).toBe(0.5);
        expect(r.eenheid).toBe('kg');
        expect(r.naam).toBe('Pulled beef');
        expect(regelTotaal(r)).toBe(5.5);
    });

    it('leest een kaal gewicht als één portie', () => {
        const r = parseerRegel('900 gram coppa ham')!;
        expect(r.aantal).toBe(1);
        expect(r.inhoud).toBe(900);
        expect(r.eenheid).toBe('g');
        expect(r.naam).toBe('Coppa ham');
        expect(r.zeker).toBe(true);
    });

    it('snapt de Nederlandse komma', () => {
        const r = parseerRegel('1,6 kg bavette')!;
        expect(regelTotaal(r)).toBe(1.6);
        expect(r.eenheid).toBe('kg');
        expect(r.naam).toBe('Bavette');
    });

    it('vindt het gewicht ook als het achter de naam staat', () => {
        const r = parseerRegel('Carpaccio vlees 6200 gram')!;
        expect(r.naam).toBe('Carpaccio vlees');
        expect(regelTotaal(r)).toBe(6.2);
        expect(r.eenheid).toBe('kg');
    });

    it('leest getal en eenheid die aan elkaar plakken', () => {
        const r = parseerRegel('40kg pulled pork')!;
        expect(regelTotaal(r)).toBe(40);
        expect(r.eenheid).toBe('kg');
        expect(r.naam).toBe('Pulled pork');
    });

    it('begrijpt "a 85 gram" als inhoud per zakje', () => {
        const r = parseerRegel('33x zakje Knol a 85 gram')!;
        expect(r.aantal).toBe(33);
        expect(r.inhoud).toBe(0.085);
        expect(r.eenheid).toBe('kg');
        expect(r.naam).toBe('Knol');           // "zakje" is verpakking, geen naam
        expect(regelTotaal(r)).toBe(2.805);
    });

    it('telt los spul zonder gewicht gewoon in stuks', () => {
        const r = parseerRegel('34x canelle kruidenboter')!;
        expect(r.aantal).toBe(34);
        expect(r.inhoud).toBeNull();
        expect(r.eenheid).toBe('stuks');
        expect(r.zeker).toBe(true);
        expect(regelSom(r)).toBe('34 stuks');
    });

    it('leest een kaal aantal vooraan als stuks', () => {
        const r = parseerRegel('95 mojnksballss')!;
        expect(r.aantal).toBe(95);
        expect(r.eenheid).toBe('stuks');
        expect(r.naam).toBe('Mojnksballss');   // typefout blijft staan, niet slim doen
    });

    it('laat een getal in de merknaam met rust', () => {
        const r = parseerRegel('42 mini brioche calr Sieger')!;
        expect(r.aantal).toBe(42);
        expect(r.naam).toBe('Mini brioche calr Sieger');
    });

    it('leest "13zakjes aardbij gel" ondanks het vastgeplakte getal', () => {
        const r = parseerRegel('13zakjes aardbij gel,')!;
        expect(r.aantal).toBe(13);
        expect(r.eenheid).toBe('stuks');
        expect(r.naam).toBe('Aardbij gel');
    });
});

describe('parseerRegel — waar hij zijn mond moet houden', () => {
    it('vraagt na bij aantal én gewicht in één regel', () => {
        /* 185 balletjes van 30 gram: 185 stuks of 5,55 kg? Dat hangt af van hoe
           het recept ze gebruikt — geen parser-beslissing. */
        const r = parseerRegel('185x30gram mini gehaktballetjes')!;
        expect(r.zeker).toBe(true);
        expect(r.tip).toContain('stuks');
        expect(regelTotaal(r)).toBe(5.55);
    });

    it('vraagt na bij de wortel-regel, die op twee manieren te lezen is', () => {
        /* "43x wortel 3per zakje a80 gram" — 43 zakjes van 80 g, of 43 zakjes
           van 3 stuks? Niet raden. */
        const r = parseerRegel('43x wortel 3per zakje a80 gram')!;
        expect(r.zeker).toBe(false);
    });

    it('meldt het als er helemaal geen aantal in staat', () => {
        const r = parseerRegel('doosje kruidenboter')!;
        expect(r.aantal).toBe(0);
        expect(r.zeker).toBe(false);
        expect(r.opmerking).toContain('hoeveel');
    });

    it('slaat lege regels en streepjes over', () => {
        expect(parseerRegel('')).toBeNull();
        expect(parseerRegel('   ')).toBeNull();
        expect(parseerRegel('---')).toBeNull();
    });
});

describe('de hele vriezerlijst', () => {
    const regels = parseerLijst(VRIEZERLIJST);

    it('leest alle 19 regels, zonder er stilletjes eentje te laten vallen', () => {
        expect(regels).toHaveLength(19);
    });

    it('geeft elke regel een naam en een hoeveelheid', () => {
        for (const r of regels) {
            expect(r.naam.length).toBeGreaterThan(0);
            expect(Number.isFinite(regelTotaal(r))).toBe(true);
        }
    });

    it('zet precies de twijfelgevallen apart', () => {
        const onzeker = regels.filter((r) => !r.zeker).map((r) => r.naam);
        expect(onzeker).toEqual(['Wortel 3per zakje']);
    });

    it('rekent de zware posten goed uit', () => {
        const kg = (naam: string) => {
            const r = regels.find((x) => x.naam.toLowerCase().includes(naam))!;
            return { totaal: regelTotaal(r), eenheid: r.eenheid };
        };
        expect(kg('pulled pork')).toEqual({ totaal: 40, eenheid: 'kg' });
        expect(kg('pulled beef')).toEqual({ totaal: 5.5, eenheid: 'kg' });
        expect(kg('carpaccio')).toEqual({ totaal: 6.2, eenheid: 'kg' });
        expect(kg('buikspek')).toEqual({ totaal: 5, eenheid: 'kg' });
        expect(kg('torpedo')).toEqual({ totaal: 500, eenheid: 'g' });
    });

    it('houdt de twee verschillende hammen uit elkaar', () => {
        const namen = regels.map((r) => r.naam);
        expect(namen).toContain('Coppa ham');
        expect(namen).toContain('Panchetta');
    });
});

describe('wisselEenheid — de correctie die het scherm aanbiedt', () => {
    it('zet balletjes van kilo naar stuks zonder het aantal te verliezen', () => {
        const r = parseerRegel('185x30gram mini gehaktballetjes')!;
        const s = wisselEenheid(r, 'stuks');
        expect(s.aantal).toBe(185);
        expect(s.inhoud).toBeNull();
        expect(regelTotaal(s)).toBe(185);
        expect(s.zeker).toBe(true);
    });

    it('rekent kilo netjes om naar gram', () => {
        const r = parseerRegel('11x pulled beef 500g')!;
        const s = wisselEenheid(r, 'g');
        expect(s.inhoud).toBe(500);
        expect(regelTotaal(s)).toBe(5500);
    });
});
