/**
 * Zod-schema voor factuur-records (CRUD-input + status-mutaties).
 *
 * Geëxtraheerd uit `src/app/facturen/actions.ts` zodat hetzelfde schema
 * ook bruikbaar is voor:
 *   - API-routes die factuur-data ontvangen (bv. UBL-import,
 *     boekhouder-bulk-upload)
 *   - Test-cases die de schema-parsing direct kunnen testen zonder de
 *     Server Action te mocken
 *   - Toekomstige Peppol/UBL inbound-mapping naar interne shape
 *
 * Veld-conventies:
 *   - `nummer` is verplicht — een factuur zonder factuurnummer is niet
 *     fiscaal geldig (BTW-audit-vereiste).
 *   - `btw` op items is een direct percentage (default 21). Dit is een
 *     LEGACY-shape ten opzichte van OfferteItemSchema (die een
 *     `btw_category`-hint heeft). Facturen committen aan een vast %
 *     omdat ze fiscaal bindend zijn — geen runtime-lookup meer.
 *   - Status-enum heeft 6 waarden; gedeeld met `StatusMutationSchema`
 *     in `actions.ts` via de geëxporteerde `FACTUUR_STATUSES` constant.
 *   - GEEN `.passthrough()` — facturen zijn strict; onbekende velden
 *     worden gestript (security: voorkomt dat een client een
 *     `organization_id` injecteert via een form-field).
 *
 * BTW (hard rule 1, BBQ Architect): bij factuur-generatie wordt de
 * BTW-rate server-side uit `BTW_RULES_2026` opgehaald per item-category
 * (uit de bron-offerte) en in `items[].btw` weggeschreven. AI mag op
 * geen enkel moment het percentage bepalen.
 */

import { z } from 'zod';

export const FACTUUR_STATUSES = [
    'concept', 'verzonden', 'betaald', 'verlopen', 'vervallen', 'geannuleerd',
] as const;

export type FactuurStatus = (typeof FACTUUR_STATUSES)[number];

export const FactuurItemSchema = z.object({
    desc: z.string().max(500).optional().default(''),
    qty: z.coerce.number().nonnegative().default(0),
    prijs: z.coerce.number().nonnegative().default(0),
    btw: z.coerce.number().min(0).max(100).optional().default(21),
});

export const FactuurSchema = z.object({
    id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
    nummer: z.string().min(1).max(50),
    client_naam: z.string().min(1, 'Klantnaam is verplicht').max(200),
    client_adres: z.string().max(500).optional().default(''),
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    vervaldatum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    status: z.enum(FACTUUR_STATUSES).optional().default('concept'),
    items: z.array(FactuurItemSchema).optional().default([]),
});

export type FactuurInput = z.input<typeof FactuurSchema>;
export type FactuurParsed = z.output<typeof FactuurSchema>;
export type FactuurItemInput = z.input<typeof FactuurItemSchema>;
