/**
 * Pure helpers: koppel KDS-tafelnummers aan plattegrond-zones.
 *
 * Een zone ("glutenvrij", "VIP") is een polygon op de plattegrond
 * (service_zones.geometry). Tafels leven op twee plekken:
 *
 *  1. Tafel-shapes in floor_plans.canvas_json met een nummer in hun label
 *     ("Tafel 3", "T4 glutenvrij") — middelpunt-in-polygon bepaalt de zone.
 *     Default-labels zoals "8p" tellen NIET als nummer (de p = personen).
 *  2. Gast-pins die via event_allergy_id aan een event_allergy met
 *     table_num hangen — pin-positie-in-polygon bepaalt de zone.
 *
 * Alle coördinaten zijn x_pct/y_pct (0–100), zoals canvas_json en
 * service_zones.geometry ze opslaan.
 */

import type { ServiceZone } from '@/types/database.types';

export interface TableZoneInfo {
    name: string;
    color?: string | null;
}

interface ZonePoint { x_pct: number; y_pct: number }

interface CanvasShapeLite {
    kind?: string;
    label?: string;
    x_pct?: number;
    y_pct?: number;
    w_pct?: number;
    h_pct?: number;
}

interface PinLite {
    x_pct: number;
    y_pct: number;
    event_allergy_id?: number | null;
}

interface AllergyLite {
    id: number;
    table_num?: number | null;
}

/** Eerste getal in een tafel-label dat NIET door 'p' gevolgd wordt
 *  ("Tafel 3" → 3, "T4 glutenvrij" → 4, "8p"/"Tafel 10p" → null). */
export function parseTableNumber(label?: string | null): number | null {
    if (!label) return null;
    const m = label.match(/(\d{1,3})(?!\s*p)(?!\d)/i);
    if (!m) return null;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Ray-casting (even-odd) point-in-polygon. */
export function pointInPolygon(x: number, y: number, pts: ZonePoint[]): boolean {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const xi = pts[i].x_pct, yi = pts[i].y_pct;
        const xj = pts[j].x_pct, yj = pts[j].y_pct;
        const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

function zoneAt(x: number, y: number, zones: ServiceZone[]): ServiceZone | null {
    for (const z of zones) {
        const pts = z.geometry?.points || [];
        if (pts.length >= 3 && pointInPolygon(x, y, pts)) return z;
    }
    return null;
}

/**
 * Bereken per tafelnummer in welke zone hij staat.
 * Tafel-shapes winnen van gast-pins; pins vullen alleen gaten aan.
 */
export function computeTableZones(
    canvasJson: unknown,
    zones: ServiceZone[],
    pins: PinLite[] = [],
    allergies: AllergyLite[] = [],
): Record<number, TableZoneInfo> {
    const out: Record<number, TableZoneInfo> = {};
    if (!zones.length) return out;

    const shapes: CanvasShapeLite[] = Array.isArray((canvasJson as { shapes?: CanvasShapeLite[] })?.shapes)
        ? (canvasJson as { shapes: CanvasShapeLite[] }).shapes
        : [];

    /* Route 1: tafel-shapes met een nummer in hun label. */
    for (const s of shapes) {
        if (!s.kind || !(s.kind.startsWith('round-table') || s.kind.startsWith('long-table'))) continue;
        const n = parseTableNumber(s.label);
        if (!n || out[n]) continue;
        const cx = (s.x_pct || 0) + (s.w_pct || 0) / 2;
        const cy = (s.y_pct || 0) + (s.h_pct || 0) / 2;
        const z = zoneAt(cx, cy, zones);
        if (z) out[n] = { name: z.name, color: z.color };
    }

    /* Route 2: gast-pins → event_allergy → table_num. */
    const allergyById = new Map<number, AllergyLite>();
    for (const a of allergies) allergyById.set(a.id, a);
    for (const p of pins) {
        if (!p.event_allergy_id) continue;
        const n = allergyById.get(p.event_allergy_id)?.table_num || null;
        if (!n || out[n]) continue;
        const z = zoneAt(p.x_pct, p.y_pct, zones);
        if (z) out[n] = { name: z.name, color: z.color };
    }
    return out;
}
