/**
 * Floor-plan analyse-helpers — allergeen-clusters + smoker-pluim-overlap.
 *
 * Pillar #5 (Allergeen-radar): cluster-detect bij ≥3 zelfde allergeen binnen
 *   15% radius. Smoker-pluim: warn als pin met astma-flag in pluim staat.
 *
 * Pure functies — geen DB, geen React. Testbaar.
 */

import type { FloorPlanGuest } from '@/types/database.types';
import type { CanvasShape, WindDirection } from './CanvasShapes';
import type { Allergen } from '@/lib/allergenDetect';

const CLUSTER_RADIUS_PCT = 15;
const CLUSTER_MIN_COUNT = 3;

export interface AllergenClusterWarning {
    code: Allergen;
    count: number;
}

/** Detecteer allergeen-clusters: ≥3 pins met zelfde allergeen binnen 15% radius. */
export function detectAllergenClusters(
    guests: FloorPlanGuest[],
): AllergenClusterWarning[] {
    const counts = new Map<Allergen, number>();

    for (let i = 0; i < guests.length; i++) {
        const a = guests[i];
        const aAllergens = a.allergens as Allergen[];
        for (const code of aAllergens) {
            let nearby = 1;
            for (let j = 0; j < guests.length; j++) {
                if (i === j) continue;
                const b = guests[j];
                const bAllergens = b.allergens as Allergen[];
                if (!bAllergens.includes(code)) continue;
                const dx = a.x_pct - b.x_pct;
                const dy = a.y_pct - b.y_pct;
                if (Math.hypot(dx, dy) <= CLUSTER_RADIUS_PCT) nearby += 1;
            }
            const current = counts.get(code) ?? 0;
            if (nearby >= CLUSTER_MIN_COUNT && nearby > current) {
                counts.set(code, nearby);
            }
        }
    }

    const result: AllergenClusterWarning[] = [];
    for (const [code, count] of counts) {
        result.push({ code, count });
    }
    return result;
}

/* ─── Smoker-pluim overlap ────────────────────────────────────── */

const WIND_VECTOR: Record<WindDirection, { dx: number; dy: number }> = {
    N:  { dx:  0, dy: -1 },
    NE: { dx:  0.707, dy: -0.707 },
    E:  { dx:  1, dy:  0 },
    SE: { dx:  0.707, dy:  0.707 },
    S:  { dx:  0, dy:  1 },
    SW: { dx: -0.707, dy:  0.707 },
    W:  { dx: -1, dy:  0 },
    NW: { dx: -0.707, dy: -0.707 },
};

/**
 * Bepaal of een pin in de rookpluim van een smoker valt.
 * Approximatie: ovale-zone die `plumeLengthPct` lang is en `plumeWidthPct`
 * breed in de windrichting vanaf smoker-centrum.
 */
export function pinInPlume(
    pinXPct: number,
    pinYPct: number,
    smoker: CanvasShape,
): boolean {
    if (smoker.kind !== 'smoker') return false;
    const wind = smoker.windDirection ?? 'NE';
    const vec = WIND_VECTOR[wind];

    // Smoker-centrum in canvas-pct
    const cx = smoker.x_pct + smoker.w_pct / 2;
    const cy = smoker.y_pct + smoker.h_pct / 2;

    // Pluim-grootte (mee-schaalt met smoker-size)
    const baseScale = Math.max(smoker.w_pct, smoker.h_pct);
    const plumeLength = baseScale * 1.4;  // hoe ver de rook drijft
    const plumeWidth = baseScale * 0.8;   // hoe breed de pluim is

    // Pin-positie relatief tot smoker
    const dx = pinXPct - cx;
    const dy = pinYPct - cy;

    // Project op windrichting (along-axis) en loodrecht (cross-axis)
    const along = dx * vec.dx + dy * vec.dy;
    const cross = dx * -vec.dy + dy * vec.dx;  // perp via rotatie 90°

    // Pin moet voor smoker liggen in windrichting (along > 0)
    if (along < 0 || along > plumeLength) return false;

    // En binnen halve breedte van de pluim
    return Math.abs(cross) <= plumeWidth / 2;
}

export interface PlumeWarning {
    smokerId: string;
    smokerLabel: string;
    affectedGuests: { id: string; label: string }[];
}

/**
 * Detecteer alle pinnen met astma-flag die in een rookpluim staan.
 * Astma-flag = dietary_restriction bevat 'astma' (case-insensitive)
 * óf allergens-array bevat 'astma' (toekomstige uitbreiding).
 */
export function detectPlumeWarnings(
    shapes: CanvasShape[],
    guests: FloorPlanGuest[],
): PlumeWarning[] {
    const smokers = shapes.filter((s) => s.kind === 'smoker');
    if (smokers.length === 0) return [];

    const astmatics = guests.filter((g) => hasAstmaFlag(g));
    if (astmatics.length === 0) return [];

    const warnings: PlumeWarning[] = [];
    for (const smoker of smokers) {
        const affected = astmatics
            .filter((g) => pinInPlume(g.x_pct, g.y_pct, smoker))
            .map((g) => ({ id: g.id, label: g.label }));
        if (affected.length > 0) {
            warnings.push({
                smokerId: smoker.id,
                smokerLabel: smoker.label || 'Smoker',
                affectedGuests: affected,
            });
        }
    }
    return warnings;
}

function hasAstmaFlag(g: FloorPlanGuest): boolean {
    const diet = (g.dietary_restriction ?? '').toLowerCase();
    if (diet.includes('astma') || diet.includes('asthma')) return true;
    return false;
}

/** Cycle helper voor wind-toggle in UI. */
export const WIND_DIRECTIONS_ORDERED: WindDirection[] = [
    'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW',
];

export function nextWindDirection(current: WindDirection): WindDirection {
    const idx = WIND_DIRECTIONS_ORDERED.indexOf(current);
    return WIND_DIRECTIONS_ORDERED[(idx + 1) % WIND_DIRECTIONS_ORDERED.length];
}
