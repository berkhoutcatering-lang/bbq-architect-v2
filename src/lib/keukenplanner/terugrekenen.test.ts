import { describe, it, expect } from 'vitest';
import { terugrekenen, moetOpwarmen, duurMs, opMarge, STANDAARD_BUFFER_MIN } from './terugrekenen';
import type { Apparaat, Taak } from './types';

const NU = '2026-09-12T08:00:00.000Z';
const UITLEVERING = '2026-09-12T16:00:00.000Z';

const yoder: Apparaat = {
    id: 12, naam: 'Yoder 1500', aanzetMin: 1, opwarmMin: 35, warmBlijftMin: null,
    schoonmaakMin: 20, exclusiefBezet: true, concurrentJobs: 4, capaciteitWaarde: 20,
    capaciteitEenheid: 'kg', kookoppervlakCm2: 9677, stationId: 2,
};

function taak(over: Partial<Taak> & { id: number }): Taak {
    return {
        titel: 'Taak', actiefMin: 10, passiefMin: 0, duurBron: 'geschat',
        toezichtNodig: false, hangtAfVan: [], status: 'planned', eventId: 1, ...over,
    };
}

describe('de buffer — nooit op spanning werken', () => {
    it('legt de laatste taak twee uur vóór de uitlevering, niet ertegenaan', () => {
        /* Klaar om 14:00 voor een uitlevering van 16:00. Alle veiligheid op
           één plek in plaats van uitgesmeerd over de taken, want uitgesmeerde
           ruimte wordt opgegeten. */
        const taken = [taak({ id: 1, actiefMin: 30 })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.uiterlijkKlaar).toBe('2026-09-12T14:00:00.000Z');
        expect(r.get(1)!.uiterlijkStart).toBe('2026-09-12T13:30:00.000Z');
        expect(STANDAARD_BUFFER_MIN).toBe(120);
    });

    it('kan uitgezet worden, en dan werk je tot op de minuut', () => {
        const taken = [taak({ id: 1, actiefMin: 30 })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU, bufferMin: 0 });
        expect(r.get(1)!.uiterlijkKlaar).toBe(UITLEVERING);
    });

    it('raakt een eigen deadline niet — die is al een echt moment', () => {
        const eigen = '2026-09-12T12:00:00.000Z';
        const taken = [taak({ id: 1, actiefMin: 30, deadline: eigen })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.uiterlijkKlaar).toBe(eigen);
    });
});

describe('vroegste start en speling', () => {
    it('kan niet eerder dan nu', () => {
        const r = terugrekenen({ taken: [taak({ id: 1, actiefMin: 30 })], uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.vroegsteStart).toBe(NU);
    });

    it('schuift op achter zijn voorganger', () => {
        /* Pullen kan pas als het garen klaar is: 8:00 + 5 uur = 13:00. */
        const taken = [
            taak({ id: 1, titel: 'Garen', actiefMin: 0, passiefMin: 300 }),
            taak({ id: 2, titel: 'Pullen', actiefMin: 25, hangtAfVan: [1] }),
        ];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(2)!.vroegsteStart).toBe('2026-09-12T13:00:00.000Z');
    });

    it('rekent speling uit als het verschil tussen vroegst en uiterlijk', () => {
        /* Eén taak van 30 min, uitlevering 16:00 min 2 uur buffer = klaar om
           14:00, dus uiterlijk starten om 13:30. Vroegst kan om 08:00.
           Speling: vijfeneenhalf uur. */
        const r = terugrekenen({ taken: [taak({ id: 1, actiefMin: 30 })], uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.spelingMin).toBe(330);
        expect(r.get(1)!.kritiek).toBe(false);
    });

    it('noemt een taak zonder speling kritiek', () => {
        /* Zes uur werk, en tussen nu en de bufferdeadline zit precies zes uur. */
        const r = terugrekenen({ taken: [taak({ id: 1, actiefMin: 360 })], uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.spelingMin).toBe(0);
        expect(r.get(1)!.kritiek).toBe(true);
    });

    it('geeft geen speling bij een taak zonder deadline', () => {
        const r = terugrekenen({ taken: [taak({ id: 1, eventId: null })], uitlevering: {}, nu: NU });
        expect(r.get(1)!.spelingMin).toBeNull();
        expect(r.get(1)!.kritiek).toBe(false);
    });

    it('houdt een lopende taak op zijn echte starttijd', () => {
        const taken = [taak({ id: 1, actiefMin: 30, gestartOp: '2026-09-12T07:40:00.000Z', status: 'in_progress' })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.vroegsteStart).toBe('2026-09-12T07:40:00.000Z');
    });
});

describe('terugrekenen — vanaf het uitlevermoment terug', () => {

    it('schuift een voorganger op naar voren via de keten', () => {
        /* pullen (25) hangt aan garen (300); garen moet dus 325 min voor 16:00
           beginnen, en pullen om 15:35. */
        const taken = [
            taak({ id: 1, titel: 'Garen', actiefMin: 0, passiefMin: 300 }),
            taak({ id: 2, titel: 'Pullen', actiefMin: 25, hangtAfVan: [1] }),
        ];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU, bufferMin: 0 });
        expect(r.get(2)!.uiterlijkStart).toBe('2026-09-12T15:35:00.000Z');
        expect(r.get(1)!.uiterlijkKlaar).toBe('2026-09-12T15:35:00.000Z');
        expect(r.get(1)!.uiterlijkStart).toBe('2026-09-12T10:35:00.000Z');
    });

    it('rekent de opwarmtijd van een koud apparaat mee', () => {
        /* 35 min opwarmen + 1 min aanzetten telt in de keten mee. */
        const taken = [taak({ id: 1, actiefMin: 10, apparaat: yoder })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU, bufferMin: 0 });
        expect(r.get(1)!.uiterlijkStart).toBe('2026-09-12T15:14:00.000Z');
    });

    it('geeft de marge tot nu', () => {
        const taken = [taak({ id: 1, actiefMin: 60 })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU, bufferMin: 0 });
        expect(r.get(1)!.margeMin).toBe(7 * 60);
        expect(r.get(1)!.teLaat).toBe(false);
    });

    it('merkt op dat een taak al te laat is', () => {
        const taken = [taak({ id: 1, actiefMin: 600 })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.teLaat).toBe(true);
    });

    it('loopt niet vast op een cykel', () => {
        const taken = [
            taak({ id: 1, hangtAfVan: [2] }),
            taak({ id: 2, hangtAfVan: [1] }),
        ];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.size).toBe(2);
    });

    it('een eigen deadline wint van die van de klus', () => {
        const eigen = '2026-09-12T12:00:00.000Z';
        const taken = [taak({ id: 1, actiefMin: 30, deadline: eigen })];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.uiterlijkKlaar).toBe(eigen);
    });
});

describe('geen deadline is geen haast', () => {
    /* Gevonden op de eerste demo-dag: een losse schoonmaaktaak zonder event
       stond groot op het wandscherm terwijl de brisket lag te wachten. Zonder
       deadline was de marge negatief, en negatief is het meest urgent. */
    it('geeft een taak zonder event en zonder deadline geen marge', () => {
        const taken = [taak({ id: 1, titel: 'Robot Coupe schoonmaken', actiefMin: 8, eventId: null })];
        const r = terugrekenen({ taken, uitlevering: {}, nu: NU });
        expect(r.get(1)!.margeMin).toBeNull();
        expect(r.get(1)!.teLaat).toBe(false);
    });

    it('zet zulke taken achteraan in plaats van vooraan', () => {
        const taken = [
            taak({ id: 1, titel: 'Schoonmaken', actiefMin: 8, eventId: null }),
            taak({ id: 2, titel: 'Brisket opleggen', actiefMin: 30 }),
        ];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect([...taken].sort(opMarge(r))[0].id).toBe(2);
    });

    it('erft de deadline wel via de keten', () => {
        /* Een taak zonder eigen event die wél iets blokkeert dat een deadline
           heeft, heeft indirect ook haast. */
        const taken = [
            taak({ id: 1, titel: 'Voorbereiden', actiefMin: 10, eventId: null }),
            taak({ id: 2, titel: 'Uitleveren', actiefMin: 10, hangtAfVan: [1] }),
        ];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        expect(r.get(1)!.margeMin).not.toBeNull();
    });
});

describe('opMarge — wie het meest haast heeft wint', () => {
    it('sorteert de krapste vooraan', () => {
        const taken = [
            taak({ id: 1, actiefMin: 30 }),
            taak({ id: 2, actiefMin: 400 }),
        ];
        const r = terugrekenen({ taken, uitlevering: { 1: UITLEVERING }, nu: NU });
        const gesorteerd = [...taken].sort(opMarge(r));
        expect(gesorteerd[0].id).toBe(2);
    });
});

describe('moetOpwarmen — de Yoder aanhouden kost pellets', () => {
    const t = (app: Apparaat) => ({ ...taak({ id: 1 }), apparaat: app });

    it('warmt op als het apparaat nog niet gebruikt is', () => {
        expect(moetOpwarmen(t(yoder), null, '2026-09-12T10:00:00.000Z')).toBe(true);
    });

    it('warmt opnieuw op als warm_blijft_min leeg is — de veilige kant', () => {
        expect(moetOpwarmen(t(yoder), '2026-09-12T09:50:00.000Z', '2026-09-12T10:00:00.000Z')).toBe(true);
    });

    it('slaat het opwarmen over binnen het venster van die machine', () => {
        const rational = { ...yoder, id: 3, naam: 'Rational', warmBlijftMin: 45 };
        expect(moetOpwarmen(t(rational), '2026-09-12T09:50:00.000Z', '2026-09-12T10:00:00.000Z')).toBe(false);
    });

    it('warmt weer op bij een groot gat', () => {
        const rational = { ...yoder, id: 3, naam: 'Rational', warmBlijftMin: 45 };
        expect(moetOpwarmen(t(rational), '2026-09-12T08:00:00.000Z', '2026-09-12T10:00:00.000Z')).toBe(true);
    });

    it('doet niets bij een apparaat zonder opwarmtijd', () => {
        const koud = { ...yoder, opwarmMin: null };
        expect(moetOpwarmen(t(koud), null, '2026-09-12T10:00:00.000Z')).toBe(false);
    });
});

describe('duurMs', () => {
    it('telt aanzetten, opwarmen, werk en wachten bij elkaar', () => {
        const t = taak({ id: 1, actiefMin: 10, passiefMin: 20, apparaat: yoder });
        expect(duurMs(t)).toBe((1 + 35 + 10 + 20) * 60000);
    });
    it('telt een onbekende duur als nul zodat de keten niet omvalt', () => {
        expect(duurMs(taak({ id: 1, actiefMin: null, passiefMin: null }))).toBe(0);
    });
});
