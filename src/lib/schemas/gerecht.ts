/**
 * Zod-schema voor gerecht-records (CRUD-input) + de RecipeStepSchema
 * sub-shape voor stap-voor-stap recepten.
 *
 * Geëxtraheerd uit `src/app/gerechten/actions.ts`. Herbruikbaar voor:
 *   - API-routes (recipe-import vanuit Notion/Google-Docs/Cookpad)
 *   - Test-cases zonder Supabase-mocks
 *   - Toekomstige bedenker → gerecht bulk-convert
 *
 * Hard rules (BBQ Architect):
 *   - Hard rule 2 (allergenen): `allergens` zit BEWUST NIET in dit
 *     schema. AI mag een tag suggereren via `/api/detect-allergens`,
 *     code schrijft alleen `ingredient_allergens` of
 *     `component_allergens` join-rijen na review door de chef.
 *   - Hard rule 3 (productie-hoeveelheden): `yield_personen` is een
 *     handmatige input van de chef; nooit AI-derived. De schaal-knop
 *     in de UI gebruikt `yield_personen × headcount` voor component-qty.
 *   - Status-enum is fixed (geen AI-gedreven enum-values).
 *   - `tags` is een vrije string-array — AI mag voorstellen, mens
 *     bevestigt voordat het opgeslagen wordt.
 *
 * Veld-conventies:
 *   - `kostprijs_pp` en `prijs_pp` zijn nonnegative — een gerecht
 *     onder 0 is altijd een data-fout, geen geldige business-case.
 *   - `yield_personen` is `int().positive()` — een gerecht dat 0
 *     personen bedient is geen gerecht.
 *   - `steps[].photo_url` is `url()` — voorkomt dat ongeldige paths
 *     in de UI breken (broken-img-icons in de receptweergave).
 */

import { z } from 'zod';

export const GERECHT_STATUSES = ['actief', 'inactief', 'concept'] as const;
export type GerechtStatus = (typeof GERECHT_STATUSES)[number];

export const RecipeStepSchema = z.object({
  nr: z.coerce.number().int().positive(),
  beschrijving: z.string().max(2000),
  photo_url: z.string().url().optional(),
  duration_min: z.coerce.number().int().nonnegative().optional(),
});

export const GerechtSchema = z.object({
  id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
  naam: z.string().min(1, 'Naam is verplicht').max(200),
  categorie: z.string().max(100).optional(),
  gang_slug: z.string().max(100).optional(),
  beschrijving: z.string().max(5000).optional(),
  kostprijs_pp: z.coerce.number().nonnegative().optional().default(0),
  prijs_pp: z.coerce.number().nonnegative().optional().default(0),
  yield_personen: z.coerce.number().int().positive().optional().default(1),
  /* status = 'actief' | 'inactief' | 'concept'. Geen AI-gedreven enum-vals. */
  status: z.enum(GERECHT_STATUSES).optional().default('actief'),
  /* tags is een vrije string-array; AI mag voorstellen, mens bevestigt. */
  tags: z.array(z.string().max(50)).optional().default([]),
  /* Recipe-steps (P1.29 photo-per-step volgt). */
  steps: z.array(RecipeStepSchema).optional().default([]),
});

export type GerechtInput = z.input<typeof GerechtSchema>;
export type GerechtParsed = z.output<typeof GerechtSchema>;
export type RecipeStepInput = z.input<typeof RecipeStepSchema>;
