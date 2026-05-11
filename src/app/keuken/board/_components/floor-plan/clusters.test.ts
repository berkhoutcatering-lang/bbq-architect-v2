import { describe, it, expect } from 'vitest';
import {
    detectAllergenClusters,
    pinInPlume,
    detectPlumeWarnings,
    nextWindDirection,
} from './clusters';
import type { FloorPlanGuest } from '@/types/database.types';
import type { CanvasShape } from './CanvasShapes';

function makeGuest(over: Partial<FloorPlanGuest> & { x: number; y: number; allergens?: string[] }): FloorPlanGuest {
    return {
        id: `g-${Math.random()}`,
        floor_plan_id: 'fp-1',
        organization_id: 'org-1',
        event_id: 1,
        x_pct: over.x,
        y_pct: over.y,
        label: 'X',
        full_name: null,
        allergens: over.allergens ?? [],
        dietary_restriction: over.dietary_restriction ?? null,
        severity: over.severity ?? 'normal',
        color: null,
        note: null,
        pii_anonymized_at: null,
        event_allergy_id: null,
        created_at: '',
        updated_at: '',
    };
}

describe('detectAllergenClusters', () => {
    it('returnt leeg bij geen pins', () => {
        expect(detectAllergenClusters([])).toEqual([]);
    });

    it('returnt leeg bij ≤2 zelfde allergeen', () => {
        const guests = [
            makeGuest({ x: 50, y: 50, allergens: ['noten'] }),
            makeGuest({ x: 52, y: 51, allergens: ['noten'] }),
        ];
        expect(detectAllergenClusters(guests)).toEqual([]);
    });

    it('detecteert cluster van ≥3 noten binnen 15% radius', () => {
        const guests = [
            makeGuest({ x: 50, y: 50, allergens: ['noten'] }),
            makeGuest({ x: 52, y: 51, allergens: ['noten'] }),
            makeGuest({ x: 55, y: 53, allergens: ['noten'] }),
        ];
        const result = detectAllergenClusters(guests);
        expect(result).toHaveLength(1);
        expect(result[0].code).toBe('noten');
        expect(result[0].count).toBe(3);
    });

    it('negeert pins buiten 15% radius', () => {
        const guests = [
            makeGuest({ x: 10, y: 10, allergens: ['noten'] }),
            makeGuest({ x: 50, y: 50, allergens: ['noten'] }),
            makeGuest({ x: 90, y: 90, allergens: ['noten'] }),
        ];
        expect(detectAllergenClusters(guests)).toEqual([]);
    });
});

describe('pinInPlume', () => {
    const smoker: CanvasShape = {
        id: 's1',
        kind: 'smoker',
        x_pct: 40, y_pct: 40,
        w_pct: 10, h_pct: 6,
        windDirection: 'E',  // rook drift naar rechts
    };

    it('detecteert pin rechts van smoker met wind=E', () => {
        // smoker-centrum is (45, 43); E = positieve x-richting
        // baseScale = max(10, 6) = 10; plumeLength = 14; plumeWidth = 8
        // along: x relatief 14, cross: 0  → binnen
        expect(pinInPlume(55, 43, smoker)).toBe(true);
    });

    it('weigert pin links van smoker bij wind=E', () => {
        expect(pinInPlume(30, 43, smoker)).toBe(false);
    });

    it('weigert pin verder dan plume-lengte', () => {
        expect(pinInPlume(80, 43, smoker)).toBe(false);
    });

    it('weigert pin loodrecht buiten plume-breedte', () => {
        // 10 pct boven smoker-axis bij wind=E zou buiten halve-breedte (4) liggen
        expect(pinInPlume(50, 30, smoker)).toBe(false);
    });

    it('returnt false bij niet-smoker shape', () => {
        const grill: CanvasShape = { ...smoker, kind: 'grill' };
        expect(pinInPlume(55, 43, grill)).toBe(false);
    });
});

describe('detectPlumeWarnings', () => {
    const smoker: CanvasShape = {
        id: 's1', kind: 'smoker',
        x_pct: 40, y_pct: 40, w_pct: 10, h_pct: 6,
        windDirection: 'E',
    };

    it('returnt leeg bij geen smokers', () => {
        const guests = [makeGuest({ x: 50, y: 43, dietary_restriction: 'astma' })];
        expect(detectPlumeWarnings([], guests)).toEqual([]);
    });

    it('returnt leeg bij geen astma-gasten', () => {
        const guests = [makeGuest({ x: 50, y: 43 })];
        expect(detectPlumeWarnings([smoker], guests)).toEqual([]);
    });

    it('detecteert astma-gast in plume', () => {
        const guests = [
            makeGuest({ x: 55, y: 43, dietary_restriction: 'astma' }),
            makeGuest({ x: 50, y: 80, dietary_restriction: 'astma' }),  // buiten plume
        ];
        const w = detectPlumeWarnings([smoker], guests);
        expect(w).toHaveLength(1);
        expect(w[0].smokerId).toBe('s1');
        expect(w[0].affectedGuests).toHaveLength(1);
    });

    it('matcht case-insensitive "asthma" of "astma"', () => {
        const guests = [
            makeGuest({ x: 55, y: 43, dietary_restriction: 'ASTHMA' }),
        ];
        const w = detectPlumeWarnings([smoker], guests);
        expect(w).toHaveLength(1);
    });
});

describe('nextWindDirection', () => {
    it('cycle 8 richtingen', () => {
        expect(nextWindDirection('N')).toBe('NE');
        expect(nextWindDirection('NE')).toBe('E');
        expect(nextWindDirection('E')).toBe('SE');
        expect(nextWindDirection('NW')).toBe('N');  // wrap
    });
});
