import { describe, expect, it } from 'vitest';
import type { Dagboeking } from './dagboeking';
import type { Kasboek } from './kasboek';
import { verzamelPunten } from './aandacht';

const dag = (x: Partial<Dagboeking>): Dagboeking => ({
    datum: '2026-11-28', binnen: { pin: 0, contant: 0, cadeaubon: 0, totaal: 0 }, hokjes: [], totaal_hokjes: 0,
    sluit: true, stand: 'geboekt', aantal_bonnen: 1, gesloten_at: '2026-11-28T17:07:00Z', punten: [], ...x,
});
const kas = (punten: string[]): Kasboek => ({ regels: [], in_de_la_cents: 0, kasverschil_cents: 0, afgeroomd_cents: 0, punten });

describe('verzamelPunten', () => {
    it('niets aan de hand: geen punten', () => {
        expect(verzamelPunten([dag({})], kas([]), 0)).toEqual([]);
    });
    it('zet de dag voor een punt van die dag en wijst naar waar je het oplost', () => {
        const uit = verzamelPunten([dag({ stand: 'te_controleren', punten: ['Pinverschil van € 5,00 is nog niet goedgekeurd.'] })], kas([]), 0);
        expect(uit).toEqual([{ tekst: 'za 28 nov: Pinverschil van € 5,00 is nog niet goedgekeurd.', href: '/verkoop/toonbank/dagstaten' }]);
    });
    it('een dag die nog open staat wijst naar de dagpagina', () => {
        const uit = verzamelPunten([dag({ stand: 'open', punten: ['De kassa is nog niet afgesloten.'] })], kas([]), 0);
        expect(uit[0]).toEqual({ tekst: 'za 28 nov: De kassa is nog niet afgesloten.', href: '/winkelboek/dag/2026-11-28' });
    });
    it('een kasverschil komt één keer, uit het kasboek, en niet nog eens van de dag', () => {
        const uit = verzamelPunten(
            [dag({ stand: 'te_controleren', punten: ['Kasverschil: € 2,00 te weinig in de la, nog niet goedgekeurd.'] })],
            kas(['Kasverschil op za 28 nov: € 2,00 te weinig in de la, nog niet goedgekeurd.']), 0);
        expect(uit).toEqual([{ tekst: 'Kasverschil op za 28 nov: € 2,00 te weinig in de la, nog niet goedgekeurd.', href: '/verkoop/toonbank/dagstaten' }]);
    });
    it('een verklaard kasverschil dat nog goedgekeurd moet worden blijft zichtbaar', () => {
        const uit = verzamelPunten([dag({ stand: 'te_controleren', punten: ['Kasverschil: € 9,00 te weinig in de la, verklaard door je eigen kasregel, nog niet goedgekeurd.'] })], kas([]), 0);
        expect(uit).toHaveLength(1);
        expect(uit[0].href).toBe('/verkoop/toonbank/dagstaten');
    });
    it('een kasverschil van een andere dag in het kasboek verbergt het punt van deze dag niet', () => {
        const uit = verzamelPunten(
            [dag({ stand: 'te_controleren', punten: ['Kasverschil: € 9,00 te weinig in de la, nog niet goedgekeurd.'] })],
            kas(['Kasverschil op do 26 nov: € 2,00 te weinig in de la, nog niet goedgekeurd.']), 0);
        expect(uit).toHaveLength(2);
    });
    it('een verschil tussen de dagen wijst naar het kasboek', () => {
        expect(verzamelPunten([], kas(['Tussen di 24 nov en wo 25 nov ging er € 1,50 uit de la zonder regel.']), 0)[0].href).toBe('/winkelboek/kasboek');
    });
    it('artikelen zonder inkoopprijs wijzen naar Verkoop', () => {
        expect(verzamelPunten([], kas([]), 1)).toEqual([{ tekst: '1 artikel zonder inkoopprijs: de marge telt niet mee tot de prijs er staat.', href: '/winkelboek/verkoop' }]);
        expect(verzamelPunten([], kas([]), 3)[0].tekst).toContain('3 artikelen zonder inkoopprijs');
    });
});
