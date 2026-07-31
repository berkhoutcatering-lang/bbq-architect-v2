import { describe, it, expect } from 'vitest';
import { berekenTekort } from './inventoryDemand';

/**
 * De kern-rekenregel van de bestellijst.
 *
 *   doel   = event-vraag × (1 + derving%)  +  minimale voorraad (par)
 *   tekort = max(0, doel − wat er ligt − wat onderweg is)
 *
 * Par telt ERBOVENOP de events en niet als max(): de events eten je voorraad
 * op, dus wat je wilt overhouden moet er nog bij.
 */
describe('berekenTekort', () => {
    it('houdt de minimale voorraad aan als er geen enkel event is', () => {
        /* Sam: "ik wil minimaal 4 kg suiker" en er ligt 3,5 kg. */
        const r = berekenTekort({ reserved: 0, dervingPct: 0, parLevel: 4, stock: 3.5, inFlight: 0 });
        expect(r.target).toBe(4);
        expect(r.shortfall).toBe(0.5);
    });

    it('bestelt niets als de voorraad al op peil is', () => {
        const r = berekenTekort({ reserved: 0, dervingPct: 0, parLevel: 4, stock: 4, inFlight: 0 });
        expect(r.shortfall).toBe(0);
    });

    it('telt de minimale voorraad bovenop de cateringvraag', () => {
        /* 4 kg willen overhouden + een catering die 6 kg vraagt = 10 kg doel.
           Er ligt niets, dus alles moet besteld. */
        const r = berekenTekort({ reserved: 6, dervingPct: 0, parLevel: 4, stock: 0, inFlight: 0 });
        expect(r.target).toBe(10);
        expect(r.shortfall).toBe(10);
    });

    it('laat na het event nog precies de minimale voorraad over', () => {
        /* Dit is de hele bedoeling: bestel het tekort, kook het event, en houd
           je bodem over voor een spoedaanvraag. */
        const par = 4, vraag = 6, stock = 1;
        const r = berekenTekort({ reserved: vraag, dervingPct: 0, parLevel: par, stock, inFlight: 0 });
        const naHetEvent = stock + r.shortfall - vraag;
        expect(naHetEvent).toBe(par);
    });

    it('zet de dervingsmarge alleen op de events, niet op de minimale voorraad', () => {
        /* 10 kg vraag + 10% derving = 11; par 4 komt er kaal bij → 15.
           Zou derving ook over par lopen, dan stond hier 15,4. */
        const r = berekenTekort({ reserved: 10, dervingPct: 10, parLevel: 4, stock: 0, inFlight: 0 });
        expect(r.reservedBuffered).toBe(11);
        expect(r.target).toBe(15);
    });

    it('trekt af wat al onderweg is, zodat je niet dubbel bestelt', () => {
        const r = berekenTekort({ reserved: 6, dervingPct: 0, parLevel: 4, stock: 2, inFlight: 5 });
        expect(r.target).toBe(10);
        expect(r.shortfall).toBe(3);
    });

    it('gaat nooit onder nul — een overschot is geen negatieve bestelling', () => {
        const r = berekenTekort({ reserved: 1, dervingPct: 0, parLevel: 2, stock: 50, inFlight: 0 });
        expect(r.shortfall).toBe(0);
    });

    it('doet niets bijzonders als er geen par is ingesteld', () => {
        /* Item zonder minimale voorraad blijft puur event-gedreven. */
        const r = berekenTekort({ reserved: 6, dervingPct: 10, parLevel: 0, stock: 0, inFlight: 0 });
        expect(r.target).toBe(6.6);
        expect(r.shortfall).toBe(6.6);
    });

    it('slikt onzin-invoer zonder NaN te produceren', () => {
        const r = berekenTekort({
            reserved: Number.NaN, dervingPct: -5, parLevel: -3, stock: Number.NaN, inFlight: -1,
        });
        expect(r.target).toBe(0);
        expect(r.shortfall).toBe(0);
    });

    it('houdt drijvende-komma-ruis uit het bestelde aantal', () => {
        const r = berekenTekort({ reserved: 0.1, dervingPct: 10, parLevel: 0.2, stock: 0, inFlight: 0 });
        expect(r.target).toBe(0.31);
    });
});
