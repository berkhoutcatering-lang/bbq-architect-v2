/**
 * productionQty — server-only berekening van prep-hoeveelheden.
 *
 * Hard rule (zie BBQ Architect immutable rules): production quantity wordt
 * NOOIT door een LLM bepaald. Deze module is de enige toegestane bron voor
 * `prep_tasks.target_qty` waarbij `qty_source = 'server_recipe'`.
 *
 * Formule:  target_qty = (guests × qty_pp) / yield
 *   - guests     = aantal gasten dat dit gerecht eet (default = event.guests)
 *   - qty_pp     = ingrediënt-hoeveelheid per portie (uit gerechten.ingredient_costs)
 *   - yield      = useful fraction (0..1); default 1.0 (geen verlies)
 *
 * Yields: een brisket van 10 kg ruw levert ~6.5 kg eetbaar (yield 0.65).
 * Als je 8 kg eetbaar wilt voor 80 gasten, koop je 8 / 0.65 ≈ 12.3 kg ruw.
 *
 * Geen Zod hier — deze functie is intern, types staan vast. Aanroepers
 * (route handlers) valideren request-bodies separaat.
 */

import type { GerechIngredientCost } from '@/types/database.types';

export interface DishInput {
    /** FK naar gerechten.id (UUID string). */
    gerecht_id: string;
    /** Mensvriendelijke naam, alleen voor formule-trail en logging. */
    gerecht_naam?: string;
    /** Ingrediënten met qty per portie. Uit gerechten.ingredient_costs JSONB. */
    ingredients: GerechIngredientCost[];
}

export interface ProductionPlanInput {
    /** Totaal aantal gasten (events.guests). */
    guests: number;
    /** Lijst gerechten die voor dit event bereid moeten worden. */
    dishes: DishInput[];
}

export interface ProductionLine {
    gerecht_id: string;
    gerecht_naam?: string;
    ingredient_naam: string;
    /** Server-berekende hoeveelheid. Afgerond op 3 decimalen. */
    target_qty: number;
    target_unit: string;
    qty_source: 'server_recipe';
    /** Mens-leesbare formule voor audit/debug: "45 gasten × 0.180 kg/p / 0.85 yield = 9.53 kg". */
    formula: string;
}

/**
 * Bereken een complete productieplan voor een event.
 *
 * @throws Error als guests < 0 of een ingredient ongeldige qty_pp/yield heeft.
 *         We laten geen "stille 0-fix" toe omdat dat in een keuken pijn doet.
 */
export function calculateProductionPlan(
    input: ProductionPlanInput,
): ProductionLine[] {
    if (!Number.isFinite(input.guests) || input.guests < 0) {
        throw new Error(`calculateProductionPlan: invalid guests=${input.guests}`);
    }
    if (input.guests === 0) return [];
    if (!Array.isArray(input.dishes) || input.dishes.length === 0) return [];

    const lines: ProductionLine[] = [];

    for (const dish of input.dishes) {
        for (const ing of dish.ingredients ?? []) {
            const line = scaleIngredient(dish, ing, input.guests);
            if (line) lines.push(line);
        }
    }

    return lines;
}

/**
 * Schalen van één ingredient voor één gerecht. Returnt null als de input
 * te onbetrouwbaar is om iets concreets uit te rekenen (lege naam, qty_pp 0).
 * Stille skip is OK voor onbruikbare ingredients — uitzondering alleen voor
 * structureel verkeerde input (zie throws in caller).
 */
function scaleIngredient(
    dish: DishInput,
    ing: GerechIngredientCost,
    guests: number,
): ProductionLine | null {
    const naam = (ing.naam ?? '').trim();
    if (!naam) return null;

    const qtyPp = Number(ing.qty_pp);
    if (!Number.isFinite(qtyPp) || qtyPp <= 0) return null;

    const yieldRaw = ing.yield;
    const yieldFactor =
        yieldRaw === undefined || yieldRaw === null
            ? 1
            : Number(yieldRaw);
    if (!Number.isFinite(yieldFactor) || yieldFactor <= 0 || yieldFactor > 1) {
        throw new Error(
            `calculateProductionPlan: invalid yield=${yieldRaw} for ${naam} in dish ${dish.gerecht_id}`,
        );
    }

    const unit = (ing.unit ?? '').trim() || 'st';

    const raw = (guests * qtyPp) / yieldFactor;
    const target = Math.round(raw * 1000) / 1000;

    const formula =
        yieldFactor === 1
            ? `${guests} gasten × ${formatNum(qtyPp)} ${unit}/p = ${formatNum(target)} ${unit}`
            : `${guests} gasten × ${formatNum(qtyPp)} ${unit}/p / ${formatNum(yieldFactor)} yield = ${formatNum(target)} ${unit}`;

    return {
        gerecht_id: dish.gerecht_id,
        gerecht_naam: dish.gerecht_naam,
        ingredient_naam: naam,
        target_qty: target,
        target_unit: unit,
        qty_source: 'server_recipe',
        formula,
    };
}

/**
 * Aggregaat van zelfde ingredient over meerdere gerechten — voor multi-event
 * mise-en-place views. Houdt unit gelijk; faalt als units mismatchen
 * (kg vs gram moet caller harmoniseren).
 */
export function aggregateProductionLines(
    lines: ProductionLine[],
): Map<string, { target_qty: number; target_unit: string; sources: number }> {
    const byIngredient = new Map<
        string,
        { target_qty: number; target_unit: string; sources: number }
    >();

    for (const line of lines) {
        const key = line.ingredient_naam.toLowerCase();
        const existing = byIngredient.get(key);
        if (!existing) {
            byIngredient.set(key, {
                target_qty: line.target_qty,
                target_unit: line.target_unit,
                sources: 1,
            });
            continue;
        }
        if (existing.target_unit !== line.target_unit) {
            throw new Error(
                `aggregateProductionLines: unit mismatch for ${line.ingredient_naam}: ${existing.target_unit} vs ${line.target_unit}`,
            );
        }
        existing.target_qty =
            Math.round((existing.target_qty + line.target_qty) * 1000) / 1000;
        existing.sources += 1;
    }

    return byIngredient;
}

function formatNum(n: number): string {
    if (Number.isInteger(n)) return String(n);
    return n.toFixed(3).replace(/\.?0+$/, '');
}
