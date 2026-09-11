import { describe, it, expect } from 'vitest';
import {
    actieveDuurMin,
    passieveDuurMin,
    aandachtVan,
    vrijeRuimteMin,
    formatDuur,
    formatKort,
} from './duur';

describe('actieveDuurMin — vast plus per eenheid', () => {
    it('telt opzetten en tarief bij elkaar op', () => {
        /* Pullen: 5 min de kom klaarzetten, 5 min per kilo, 4 kg → 25 min. */
        expect(actieveDuurMin({ duur_vast_min: 5, duur_per_eenheid_min: 5 }, 4)).toBe(25);
    });

    it('valt terug op de oude losse duur als er niets gesplitst is', () => {
        expect(actieveDuurMin({ duur_actief_min: 15 }, 8)).toBe(15);
    });

    it('geeft onbekend als er een tarief is maar geen hoeveelheid', () => {
        /* Alleen het vaste deel teruggeven zou systematisch te laag zijn. */
        expect(actieveDuurMin({ duur_vast_min: 5, duur_per_eenheid_min: 5 }, null)).toBeNull();
    });

    it('geeft onbekend als er niets bekend is — niet nul', () => {
        expect(actieveDuurMin({}, 4)).toBeNull();
    });

    it('werkt met alleen een vaste tijd', () => {
        expect(actieveDuurMin({ duur_vast_min: 8 }, null)).toBe(8);
    });
});

describe('passieveDuurMin — schaalt met het stuk, niet met het aantal', () => {
    it('rekent evenredig met het stukgewicht', () => {
        /* 5 uur bij 5 kg → 8 kg wordt 8 uur. */
        expect(passieveDuurMin({ duur_passief_min: 300, passief_ref_kg: 5 }, 8)).toBe(480);
    });

    it('laat de referentieduur staan als het stukgewicht onbekend is', () => {
        expect(passieveDuurMin({ duur_passief_min: 300, passief_ref_kg: 5 }, null)).toBe(300);
    });

    it('laat de referentieduur staan als er geen referentiegewicht is', () => {
        expect(passieveDuurMin({ duur_passief_min: 180 }, 8)).toBe(180);
    });

    it('geeft onbekend terug als er geen passieve tijd is', () => {
        expect(passieveDuurMin({}, 8)).toBeNull();
    });
});

describe('aandachtVan — ben ik bezig of ben ik vrij', () => {
    it('actief werk is actief', () => {
        expect(aandachtVan({}, 25, 0)).toBe('actief');
    });

    it('wachten zonder meer is vrij', () => {
        expect(aandachtVan({}, 0, 300)).toBe('passief_vrij');
    });

    it('elk half uur natspuiten bindt je aan de plek', () => {
        expect(aandachtVan({ herhaal_interval_min: 30, herhaal_duur_min: 1 }, 0, 150))
            .toBe('passief_gebonden');
    });

    it('toezicht wint van herhaling', () => {
        expect(aandachtVan({ toezicht_nodig: true, herhaal_interval_min: 30, herhaal_duur_min: 1 }, 0, 150))
            .toBe('passief_bewaakt');
    });

    it('een stap met werk én wachten telt als actief — het wachten komt erna', () => {
        expect(aandachtVan({}, 15, 20)).toBe('actief');
    });
});

describe('vrijeRuimteMin — hoeveel van het gat echt vrij is', () => {
    it('bij vrij passief is dat het hele blok', () => {
        expect(vrijeRuimteMin({ passiefMin: 300, herhaalIntervalMin: null, herhaalDuurMin: null, toezichtNodig: false }))
            .toBe(300);
    });

    it('bij natspuiten elk half uur is het hooguit het interval', () => {
        expect(vrijeRuimteMin({ passiefMin: 150, herhaalIntervalMin: 30, herhaalDuurMin: 1, toezichtNodig: false }))
            .toBe(29);
    });

    it('bij toezicht is er geen vrije ruimte', () => {
        expect(vrijeRuimteMin({ passiefMin: 300, herhaalIntervalMin: null, herhaalDuurMin: null, toezichtNodig: true }))
            .toBe(0);
    });

    it('een blok korter dan het interval blijft zijn eigen lengte', () => {
        expect(vrijeRuimteMin({ passiefMin: 12, herhaalIntervalMin: 30, herhaalDuurMin: 1, toezichtNodig: false }))
            .toBe(12);
    });
});

describe('formatteren', () => {
    it('toont minuten en seconden onder het uur', () => {
        expect(formatDuur(11.8)).toBe('11:48');
    });
    it('toont uren erboven', () => {
        expect(formatDuur(125)).toBe('2:05:00');
    });
    it('kort blijft kort', () => {
        expect(formatKort(20)).toBe('20m');
        expect(formatKort(60)).toBe('1u');
        expect(formatKort(90)).toBe('1u30');
    });
});
