import { describe, it, expect } from 'vitest';
import { getBonStatusVisual } from './statusMap';

/* Het groene "Bevestigd" mag alleen staan als de BTW van de bon ook echt
   meetelt in de aangifte. Anders denkt de cateraar dat hij klaar is. */
describe('getBonStatusVisual', () => {
    const basis = { status: 'pending', ai_classify_status: 'verified', locked_at: null };

    it('categorie ok + BTW nog niet bevestigd → "BTW nog bevestigen"', () => {
        const v = getBonStatusVisual({ ...basis, btw_hoog_bedrag: 21, voorbelasting_bevestigd: false });
        expect(v.label).toBe('BTW nog bevestigen');
        expect(v.color).toBe('amber');
    });

    it('categorie ok + BTW bevestigd → groen "Bevestigd"', () => {
        const v = getBonStatusVisual({ ...basis, btw_hoog_bedrag: 21, voorbelasting_bevestigd: true });
        expect(v.label).toBe('Bevestigd');
    });

    it('bon zonder BTW hoeft niets te bevestigen → "Bevestigd"', () => {
        const v = getBonStatusVisual({ ...basis, btw_laag_bedrag: 0, btw_hoog_bedrag: 0, voorbelasting_bevestigd: false });
        expect(v.label).toBe('Bevestigd');
    });

    it('onbekend of de BTW meetelt (zoekresultaat) → alleen "Categorie ok"', () => {
        const v = getBonStatusVisual({ ...basis, btw_hoog_bedrag: 21 });
        expect(v.label).toBe('Categorie ok');
    });

    it('vergrendeld en twijfel blijven zoals ze waren', () => {
        expect(getBonStatusVisual({ ...basis, locked_at: '2026-07-01T00:00:00Z' }).label).toBe('Vergrendeld');
        expect(getBonStatusVisual({ ...basis, ai_classify_status: 'twijfel' }).label).toBe('Twijfel');
    });
});
