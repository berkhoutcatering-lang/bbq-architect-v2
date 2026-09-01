import { describe, it, expect } from 'vitest';
import {
    EVENT_STATUS,
    EVENT_STATUS_INVOER,
    OFFERTE_STATUS,
    mapOfferteToEventStatus,
    normalizeEventStatus,
} from './statuses';

/**
 * De aanleiding voor deze test, 2026-09-01.
 *
 * `upsertEvent` had zijn eigen lijstje status-waarden, los van EVENT_STATUS.
 * Daarin ontbraken 'optie' en 'in_progress'. Gevolg: een event dat uit een
 * concept-offerte rolt krijgt status 'optie', en was daarna niet meer op te
 * slaan vanuit de event-editor — je vulde de begintijd in, klikte Opslaan, en
 * er gebeurde niets behalve een validatie-fout.
 *
 * Twee lijsten die hetzelfde horen te beschrijven lopen uit elkaar zodra
 * niemand ze naast elkaar legt. Deze test legt ze naast elkaar.
 */
describe('EVENT_STATUS_INVOER dekt de hele canon', () => {
    it('accepteert elke status die EVENT_STATUS kent', () => {
        for (const status of Object.values(EVENT_STATUS)) {
            expect(EVENT_STATUS_INVOER).toContain(status);
        }
    });

    it('accepteert in het bijzonder optie en in_progress', () => {
        /* De twee die ontbraken. Expliciet benoemd zodat een toekomstige
           opschoning van de lijst hier struikelt in plaats van in de keuken. */
        expect(EVENT_STATUS_INVOER).toContain('optie');
        expect(EVENT_STATUS_INVOER).toContain('in_progress');
    });

    it('accepteert de NL-vormen die in oudere rijen staan', () => {
        for (const nl of ['concept', 'bevestigd', 'voltooid', 'geannuleerd']) {
            expect(EVENT_STATUS_INVOER).toContain(nl);
        }
    });

    it('bevat geen waarde die nergens op slaat', () => {
        const toegestaan = new Set<string>([
            ...Object.values(EVENT_STATUS),
            'concept', 'bevestigd', 'voltooid', 'geannuleerd',
        ]);
        for (const s of EVENT_STATUS_INVOER) {
            expect(toegestaan.has(s)).toBe(true);
        }
    });
});

describe('offerte-status bepaalt de event-status', () => {
    it('een concept- of verzonden offerte zet het event op optie', () => {
        expect(mapOfferteToEventStatus(OFFERTE_STATUS.CONCEPT)).toBe(EVENT_STATUS.OPTIE);
        expect(mapOfferteToEventStatus(OFFERTE_STATUS.VERZONDEN)).toBe(EVENT_STATUS.OPTIE);
    });

    it('en die uitkomst moet dus ook op te slaan zijn', () => {
        /* Precies de keten die brak: offerte concept → event optie → editor
           weigert. Als deze twee regels los van elkaar blijven kloppen maar
           samen niet, is de app stuk. */
        const status = mapOfferteToEventStatus(OFFERTE_STATUS.CONCEPT);
        expect(EVENT_STATUS_INVOER).toContain(status as string);
    });

    it('een geaccepteerde offerte bevestigt het event', () => {
        expect(mapOfferteToEventStatus(OFFERTE_STATUS.GEACCEPTEERD)).toBe(EVENT_STATUS.CONFIRMED);
    });
});

describe('normalizeEventStatus', () => {
    it('herkent optie als geldige status', () => {
        expect(normalizeEventStatus('optie')).toBe('optie');
        expect(normalizeEventStatus('OPTIE')).toBe('optie');
    });

    it('vertaalt de NL-alias voor geannuleerd', () => {
        expect(normalizeEventStatus('geannuleerd')).toBe('cancelled');
    });

    it('geeft null bij niets of onzin', () => {
        expect(normalizeEventStatus(null)).toBeNull();
        expect(normalizeEventStatus('zomaar iets')).toBeNull();
    });
});
