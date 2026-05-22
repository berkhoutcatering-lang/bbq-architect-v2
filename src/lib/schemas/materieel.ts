/**
 * Zod-schema voor materieel-records (CRUD-input).
 *
 * Onderdeel van Bundel 7 (server-actions completion) — voorheen liepen
 * `/materieel` CRUD-mutaties direct via `useSupabase.insert/update/remove`
 * vanaf Client, zonder server-side validatie. Een gemanipuleerde request
 * kon dus rijen schrijven met willekeurige shape. Nu loopt het via een
 * Server Action met dit schema als validatie-laag.
 *
 * Veld-conventies:
 *   - `naam` verplicht (min 1, max 200) — een naamloos item is bug.
 *   - `type` is een vrij veld (BBQ/Servies/Linnen/Koeling/etc.) — geen
 *     enum zodat tenants eigen categorieën kunnen toevoegen. Schema-cap
 *     op 100 chars voorkomt accidental blow-out.
 *   - `status` enum: `ok` / `onderhoud` / `defect` — fixed (geen AI-
 *     gedreven enum-vals, hard rule 3 voor productie-statussen).
 *   - `aanschaf_datum` is `YYYY-MM-DD`-string of leeg.
 *   - `fotos` is een string-array met max 20 URLs — voorkomt DoS via
 *     1000-foto-payload.
 *   - `logboek` is een array van `{ datum, notitie }`-entries met max 200
 *     entries (audit-trail blijft beheersbaar).
 */

import { z } from 'zod';

export const MATERIEEL_STATUSES = ['ok', 'onderhoud', 'defect'] as const;
export type MaterieelStatus = (typeof MATERIEEL_STATUSES)[number];

export const LogboekEntrySchema = z.object({
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    notitie: z.string().max(2000).optional(),
});

/* S5-deel-1: AI-gescrapte specs uit product-URL. Niet AI-derived voor
   kritische velden (BTW/allergenen/quantities) — alleen producteigenschappen
   die als referentie dienen, niet als source-of-truth voor productie. */
export const MaterieelSpecsSchema = z.object({
    naam: z.string().max(200).optional(),
    merk: z.string().max(200).optional(),
    model: z.string().max(200).optional(),
    afmetingen: z.string().max(200).optional(),
    gewicht: z.string().max(100).optional(),
    vermogen: z.string().max(100).optional(),
    prijs_eur: z.number().nonnegative().max(999_999).optional(),
    specs_bullets: z.array(z.string().max(500)).max(20).optional(),
    notes: z.string().max(2000).optional(),
}).passthrough();

export const MaterieelSchema = z.object({
    id: z.coerce.number().int().optional(),
    naam: z.string().min(1, 'Naam is verplicht').max(200),
    type: z.string().max(100).optional().default(''),
    status: z.enum(MATERIEEL_STATUSES).optional().default('ok'),
    aanschaf_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional().default(''),
    notitie: z.string().max(5000).optional().default(''),
    locatie: z.string().max(200).nullable().optional(),
    fotos: z.array(z.string().url()).max(20, 'Max 20 foto\'s per item').nullable().optional(),
    foto_urls: z.array(z.string().url()).max(20).nullable().optional(),
    product_url: z.string().url().max(2048).nullable().optional(),
    specs: MaterieelSpecsSchema.nullable().optional(),
    specs_fetched_at: z.string().nullable().optional(),
    logboek: z.array(LogboekEntrySchema).max(200, 'Max 200 logboek-entries').optional().default([]),
});

export type MaterieelInput = z.input<typeof MaterieelSchema>;
export type MaterieelParsed = z.output<typeof MaterieelSchema>;
export type LogboekEntryInput = z.input<typeof LogboekEntrySchema>;
