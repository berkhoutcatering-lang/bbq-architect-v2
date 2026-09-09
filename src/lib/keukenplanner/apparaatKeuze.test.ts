import { describe, it, expect } from 'vitest';
import { kiesApparaat, leesBereidingswijze, HOP_EN_BITES } from './apparaatKeuze';

describe('kiesApparaat — een boekrecept landt op jouw spullen', () => {
    it('stuurt indirect en roken naar de pelletgrill', () => {
        expect(kiesApparaat('indirect').materieelId).toBe(21);
        expect(kiesApparaat('roken').materieelId).toBe(21);
    });

    it('stuurt direct grillen naar de houtskoolgrill', () => {
        expect(kiesApparaat('direct').materieelId).toBe(1);
        expect(kiesApparaat('plancha').materieelId).toBe(1);
    });

    it('laat het rookhout vervallen op de pelletgrill', () => {
        /* "Voeg de hickory chunks toe aan de gloeiende kolen" heeft op een
           pelletgrill geen betekenis. Die stap gaat eruit, niet als taak van
           nul minuten erin. */
        const keuze = kiesApparaat('roken');
        expect(keuze.rookhoutVervalt).toBe(true);
        expect(keuze.reden).toContain('eigen rook');
    });

    it('houdt het rookhout op de houtskoolgrill', () => {
        expect(kiesApparaat('direct').rookhoutVervalt).toBe(false);
    });

    it('vraagt geen toezicht bij pellets en wel bij houtskool', () => {
        /* De ACS-controller houdt zelf temperatuur; een houtskoolvuur niet.
           Dat scheelt een bewaakte stap — en een bewaakte stap is een gat dat
           je niet kunt vullen. */
        expect(kiesApparaat('roken').toezichtNodig).toBe(false);
        expect(kiesApparaat('direct').toezichtNodig).toBe(true);
    });

    it('wijst binnenwerk niet aan een vast toestel toe', () => {
        /* Welke pan of oven het wordt hangt af van wat er vrij staat; dat
           kiest de planner, niet deze tabel. */
        expect(kiesApparaat('fornuis').materieelId).toBeNull();
        expect(kiesApparaat('oven').materieelId).toBeNull();
        expect(kiesApparaat('fornuis').reden).toContain('vuur');
    });

    it('zegt het eerlijk als het toestel er niet is', () => {
        const keuze = kiesApparaat('roken', { ...HOP_EN_BITES, smokerId: null });
        expect(keuze.materieelId).toBeNull();
        expect(keuze.reden).toContain('geen smoker');
    });
});

describe('leesBereidingswijze — uit de recepttekst', () => {
    it('herkent roken', () => {
        expect(leesBereidingswijze('rook de rundernek 3 uur op 120 °C')).toBe('roken');
    });

    it('herkent indirect', () => {
        expect(leesBereidingswijze('Bereid een BBQ voor op indirect grillen')).toBe('indirect');
    });

    it('herkent direct grillen', () => {
        expect(leesBereidingswijze('Gril de spiesen op heet vuur')).toBe('direct');
    });

    it('herkent een pan op het vuur', () => {
        expect(leesBereidingswijze('Kook de rode wijn in een pan op het fornuis in')).toBe('fornuis');
        /* "pannetje" matchte niet op `\bpan\b` — dat was een echt gat. */
        expect(leesBereidingswijze('Kook in tot een stroperige glaze in een pannetje')).toBe('fornuis');
        expect(leesBereidingswijze('Rooster droog in een sauspannetje')).toBe('fornuis');
    });

    it('houdt oven en fornuis uit elkaar', () => {
        /* Een pannetje is geen oven; dat waren twee verschillende apparaten
           die ik op één hoop gooide. */
        expect(leesBereidingswijze('Zet hem in de combisteamer op 110 °C')).toBe('oven');
        expect(leesBereidingswijze('in de oven')).toBe('oven');
    });

    it('geeft niets terug bij twijfel in plaats van te gokken', () => {
        /* Een verkeerd geraden toestel verschuift de hele tijdlijn zonder dat
           iemand het merkt. Een vraag is dan beter. */
        expect(leesBereidingswijze('Meng de draadjes met de warme saus')).toBeNull();
        expect(leesBereidingswijze('Laat 15 minuten rusten')).toBeNull();
    });
});
