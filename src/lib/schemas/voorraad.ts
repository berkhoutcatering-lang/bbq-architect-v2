/**
 * Zod-schemas voor voorraad-operaties: entity-shape én delta-mutaties.
 *
 * Geëxtraheerd uit `src/app/voorraad/actions.ts`. Twee schemas in één
 * module omdat ze hetzelfde domein delen (inventory + stock_movements
 * zijn samen één bounded context):
 *
 *   - `InventoryItemSchema` — entity-shape voor de `inventory` tabel.
 *     Wordt gebruikt door `upsertInventory` en is herbruikbaar voor
 *     bulk-import (CSV van een leverancier-catalogus).
 *
 *   - `AdjustStockSchema` — action-payload voor delta-mutaties. Komt
 *     1-op-1 overeen met een `stock_movements` rij. Herbruikbaar voor
 *     bulk-correcties (jaarlijkse telling, breuk-import).
 *
 *   - `STOCK_MOVEMENT_TYPES` — gedeelde enum voor het movement-type.
 *     Geëxporteerd zodat de UI dezelfde labels kan tonen als de
 *     server-side validatie.
 *
 * Veld-conventies:
 *   - `current_stock` heeft `min(0)` — server-side floor. Negatieve
 *     voorraad mag nooit in de DB belanden (negative-stock-prevention).
 *   - `yield_factor` heeft `min(0).max(2)` — een yield boven 200%
 *     is bijna altijd een typfout (verkeerde decimal-separator).
 *   - `tht` (tenminste-houdbaar-tot) is nullable: producten zonder
 *     vervaldatum (hardware, equipment) moeten ook in voorraad kunnen.
 *   - `allergenen` is `string[]` — bewust GEEN enum. AI mag allergenen
 *     suggereren (hard rule 1: nooit AI-derived), maar de mens moet
 *     vrije tekst kunnen toevoegen voor edge-cases.
 *   - `delta` in AdjustStockSchema is bewust niet `nonnegative`:
 *     verbruik is een negatieve delta, ontvangst positief.
 */

import { z } from 'zod';

export const STOCK_MOVEMENT_TYPES = [
    'receive', 'usage', 'count', 'waste', 'transfer',
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const InventoryItemSchema = z.object({
    id: z.coerce.number().int().optional(),
    naam: z.string().min(1, 'Naam is verplicht').max(200),
    categorie: z.string().max(100).optional().default(''),
    current_stock: z.coerce.number().min(0, 'Voorraad kan niet negatief zijn').default(0),
    min_stock: z.coerce.number().min(0).optional().default(0),
    par_level: z.coerce.number().min(0).optional().default(0),
    unit: z.string().max(50).optional().default('stuks'),
    purchase_price: z.coerce.number().min(0).optional().default(0),
    supplier: z.string().max(200).optional().default(''),
    leverancier_id: z.coerce.number().int().nullable().optional(),
    yield_factor: z.coerce.number().min(0).max(2).optional(),
    tht: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    avg_daily: z.coerce.number().min(0).optional(),
    allergenen: z.array(z.string()).optional().default([]),
});

export const AdjustStockSchema = z.object({
    inventory_id: z.coerce.number().int().positive(),
    /* Delta kan negatief zijn (verbruik) of positief (ontvangst). */
    delta: z.coerce.number(),
    type: z.enum(STOCK_MOVEMENT_TYPES),
    note: z.string().max(500).optional(),
});

export type InventoryItemInput = z.input<typeof InventoryItemSchema>;
export type InventoryItemParsed = z.output<typeof InventoryItemSchema>;
export type AdjustStockInput = z.input<typeof AdjustStockSchema>;
export type AdjustStockParsed = z.output<typeof AdjustStockSchema>;
