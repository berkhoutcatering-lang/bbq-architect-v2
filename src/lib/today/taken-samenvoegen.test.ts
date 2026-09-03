import { describe, it, expect } from 'vitest';
import { voegTakenSamen, onderwerpVan, type Taak } from './taken-samenvoegen';

function taak(p: Partial<Taak> & { id: string; titel: string }): Taak {
  return {
    urgentie: 'vandaag', tijd: '', detail: '', actie: 'Open',
    href: '/', bron: 'shift', ...p,
  };
}

describe('onderwerpVan', () => {
    it('herkent dezelfde zaak in drie bewoordingen', () => {
        /* Precies de drie regels die op het dashboard naast elkaar stonden. */
        const a = onderwerpVan('3 facturen vervallen', '€3.608');
        const b = onderwerpVan('3 facturen > 30 dagen', 'miranda Berkhout € 1.733');
        const c = onderwerpVan('3 facturen herinneren', 'miranda Berkhout (€ 1.733)');
        expect(a).toBe(b);
        expect(b).toBe(c);
    });

    it('houdt verschillende aantallen uit elkaar', () => {
        expect(onderwerpVan('3 facturen vervallen', '')).not.toBe(
            onderwerpVan('2 facturen versturen', ''),
        );
    });

    it('houdt verschillende onderwerpen uit elkaar', () => {
        expect(onderwerpVan('3 facturen vervallen', '')).not.toBe(
            onderwerpVan('3 offertes met lage marge', ''),
        );
    });

    it('valt terug op de titel bij een onbekend onderwerp', () => {
        expect(onderwerpVan('Zonnescherm ophalen', '')).toBe('overig:zonnescherm ophalen');
    });
});

describe('voegTakenSamen', () => {
    it('maakt van drie meldingen over dezelfde facturen één regel', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: '3 facturen vervallen', detail: '€3.608', bron: 'dagbriefing', urgentie: 'nu' })],
            aandacht: [taak({ id: 'a1', titel: '3 facturen > 30 dagen', detail: 'miranda Berkhout', bron: 'aandacht' })],
            shift: [taak({ id: 's1', titel: '3 facturen herinneren', detail: 'miranda Berkhout', tijd: '5 min', actie: 'Verstuur', bron: 'shift' })],
        });
        expect(uit).toHaveLength(1);
        /* De shift-versie wint: die heeft een tijdsindicatie en een werkwoord. */
        expect(uit[0].actie).toBe('Verstuur');
        expect(uit[0].tijd).toBe('5 min');
        /* Maar de hoogste urgentie van de drie telt. */
        expect(uit[0].urgentie).toBe('nu');
    });

    it('gooit niets weg wat niet dubbel is', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: '3 facturen vervallen' })],
            aandacht: [taak({ id: 'a1', titel: '1 item onder minimum', detail: 'gerookte Bavette' })],
            shift: [taak({ id: 's1', titel: '21 bonnen verwerken' })],
        });
        expect(uit).toHaveLength(3);
    });

    it('sorteert op urgentie, niet op bron', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: 'BTW-aangifte', urgentie: 'later' })],
            aandacht: [taak({ id: 'a1', titel: '1 item onder minimum', urgentie: 'nu' })],
            shift: [taak({ id: 's1', titel: '21 bonnen verwerken', urgentie: 'deze-week' })],
        });
        expect(uit.map((t) => t.urgentie)).toEqual(['nu', 'deze-week', 'later']);
    });

    it('vult ontbrekende velden aan uit de verliezer', () => {
        const uit = voegTakenSamen({
            dagbriefing: [taak({ id: 'd1', titel: '2 concept-facturen', detail: 'cor en miranda', bron: 'dagbriefing' })],
            aandacht: [],
            shift: [taak({ id: 's1', titel: '2 concept-facturen versturen', detail: '', tijd: '8 min', bron: 'shift' })],
        });
        expect(uit).toHaveLength(1);
        expect(uit[0].tijd).toBe('8 min');
        expect(uit[0].detail).toBe('cor en miranda');
    });

    it('kan met lege stromen om', () => {
        expect(voegTakenSamen({ dagbriefing: [], aandacht: [], shift: [] })).toEqual([]);
    });
});
