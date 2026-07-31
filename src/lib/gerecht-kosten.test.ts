/* De vraag die twee keer een factor 10 kostte: is een hoeveelheid PER PORTIE of
 * VOOR `porties` porties?
 *
 * Antwoord (vastgelegd hier zodat een volgend scherm niet opnieuw gokt):
 *   gerecht_components.quantity_used  → per portie / per gast
 *   gerechten.total_cost_cents        → kostprijs per portie
 *   gerechten.porties                 → schaal van de vrije RECEPTTEKST, en
 *                                       raakt component-data nooit
 *
 * Waar het misging:
 *   - LiveCostHeader deelde total_cost_cents nog eens door porties: een gerecht
 *     van EUR 11,97 stond op het detailscherm als EUR 1,20 per portie.
 *   - de MEP-planning rekende met gasten ÷ porties: 750 g voor 50 man i.p.v. 7,5 kg.
 */

import { describe, it, expect } from 'vitest';
import { effectieveKostprijsPP, kostprijsBron, componentHoeveelheidVoorGasten } from './gerecht-kosten';

describe('effectieveKostprijsPP — total_cost_cents is al per portie', () => {
    it('geeft de rollup ongedeeld terug', () => {
        /* De Pulled Brisket Burger uit de echte data: 15 componenten, samen 1197 cent
           voor ÉÉN bord. Er mag hier niets meer door porties gedeeld worden. */
        expect(effectieveKostprijsPP({ total_cost_cents: 1197 })).toBe(11.97);
    });
    it('valt terug op de handmatige kostprijs als er geen rollup is', () => {
        expect(effectieveKostprijsPP({ total_cost_cents: 0, kostprijs_pp: 4.5 })).toBe(4.5);
    });
    it('rollup wint van handmatig', () => {
        expect(effectieveKostprijsPP({ total_cost_cents: 1197, kostprijs_pp: 999 })).toBe(11.97);
    });
    it('benoemt de bron', () => {
        expect(kostprijsBron({ total_cost_cents: 1197 })).toBe('componenten');
        expect(kostprijsBron({ total_cost_cents: 0, kostprijs_pp: 3 })).toBe('handmatig');
        expect(kostprijsBron({ total_cost_cents: 0 })).toBe('geen');
    });
});

describe('componentHoeveelheidVoorGasten — schaalt op gasten, nooit op porties', () => {
    it('50 gasten x 150 g = 7500 g', () => {
        /* De oude berekening (gasten ÷ porties) gaf hier 750 g. */
        expect(componentHoeveelheidVoorGasten(150, 50)).toBe(7500);
    });
    it('één gast krijgt precies de dosering', () => {
        expect(componentHoeveelheidVoorGasten(150, 1)).toBe(150);
    });
    it('werkt met stuks en met kommagetallen', () => {
        expect(componentHoeveelheidVoorGasten(1, 120)).toBe(120);
        expect(componentHoeveelheidVoorGasten(2.5, 40)).toBe(100);
    });
    it('geen gasten of geen dosering → 0, nooit NaN', () => {
        expect(componentHoeveelheidVoorGasten(150, 0)).toBe(0);
        expect(componentHoeveelheidVoorGasten(0, 50)).toBe(0);
        expect(componentHoeveelheidVoorGasten(Number.NaN, 50)).toBe(0);
    });
});
