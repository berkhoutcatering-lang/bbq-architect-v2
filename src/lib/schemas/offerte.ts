/**
 * Zod-schema voor offerte-records (CRUD-input).
 *
 * Geëxtraheerd uit `src/app/offertes/actions.ts` zodat hetzelfde schema
 * ook bruikbaar is voor:
 *   - API-routes die offerte-data accepteren (bv. een toekomstige bulk-
 *     import van offertes uit een CSV/Excel of vanuit Tripleseat-migratie)
 *   - Test-cases die de schema-parsing direct kunnen testen zonder de
 *     Server Action of Supabase te mocken
 *   - Server-side validatie in de acceptance-workflow voor offerte → event
 *     synchronisatie
 *
 * Pattern: centrale schemas in `src/lib/schemas/` per resource. Server
 * Actions importeren het schema en re-exporteren de `Input` type voor
 * consumer-compat.
 *
 * Veld-conventies:
 *   - `.passthrough()` blijft staan voor backwards-compat met velden die
 *     buiten dit schema bestaan (`nummer`, `geldig_tot`, `accepted_at`,
 *     `client_email`, `verzonden_op`, `public_token`). Die slippen door
 *     naar de DB-upsert zonder dat het schema ze hoeft te kennen.
 *   - `menu_selectie` is `unknown` — drie mogelijke shapes (object met
 *     gang-key arrays, plat array, JSON-string). Validatie van de
 *     concrete shape gebeurt in `calcOfferteMarge()`.
 *   - BTW (hard rule 1, BBQ Architect): NIET in dit schema. BTW-splits
 *     worden server-side berekend uit `BTW_RULES_2026` op het moment van
 *     factureren, niet bij offerte-opslag. AI mag wél een categorie
 *     suggereren via `items[].btw_category` (hint, geen rate).
 *   - `coerce` op `qty`, `prijs`, `aantal_gasten`, `basis_prijs_pp` is
 *     bewust: formulieren leveren strings, niet numbers.
 */

import { z } from 'zod';

export const OfferteItemSchema = z.object({
  beschrijving: z.string().max(500),
  qty: z.coerce.number().nonnegative(),
  prijs: z.coerce.number().nonnegative(),
  /* Optionele BTW-categorie-hint voor downstream factuur-generatie.
     De daadwerkelijke rate komt uit BTW_RULES_2026 lookup. */
  btw_category: z.enum([
    'food_catering', 'food_takeaway', 'service_personnel',
    'alcohol', 'soft_drinks', 'transport', 'equipment_rental',
    'b2b_intra_eu_reverse', 'export_non_eu', 'exempt',
  ]).optional(),
  /* Stel-menu-samen v2 (2026-06): wanneer een item via een menukaart in de
     offerte komt, persisteren we de bron-FKs zodat PDF/portaal/marge-rapportage
     terug kunnen naar het bron-gerecht. Optioneel — losse items zonder
     menukaart-bron blijven werken. */
  gerecht_id: z.string().uuid().optional(),
  gang_slug: z.string().max(100).optional(),
});

export const VasteKostenSchema = z.object({
  naam: z.string().max(200),
  bedrag: z.coerce.number(),
});

export const OfferteSchema = z.object({
  id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
  client_naam: z.string().min(1, 'Klantnaam is verplicht').max(200),
  klant_id: z.union([z.string().uuid(), z.coerce.number().int()]).nullable().optional(),
  datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum moet YYYY-MM-DD zijn'),
  aantal_gasten: z.coerce.number().int().min(0).optional().default(0),
  basis_prijs_pp: z.coerce.number().nonnegative().optional().default(0),
  status: z.enum([
    'concept', 'verzonden', 'geaccepteerd', 'betaald', 'geannuleerd',
    'goedgekeurd', 'voltooid',
  ]).optional().default('concept'),
  items: z.array(OfferteItemSchema).optional().default([]),
  vaste_kosten: z.array(VasteKostenSchema).optional().default([]),
  /* menu_selectie kan drie shapes hebben — daarom unknown. Validatie van
     de inhoud gebeurt in calcOfferteMarge. */
  menu_selectie: z.unknown().optional(),
  notities: z.string().max(10_000).optional(),
  /* Open extra velden — `nummer`, `geldig_tot`, `accepted_at`, `client_email`
     etc. kunnen meekomen uit de form. Schema is liberal voor backwards-compat. */
}).passthrough();

export type OfferteInput = z.input<typeof OfferteSchema>;
export type OfferteParsed = z.output<typeof OfferteSchema>;
export type OfferteItemInput = z.input<typeof OfferteItemSchema>;
export type VasteKostenInput = z.input<typeof VasteKostenSchema>;
