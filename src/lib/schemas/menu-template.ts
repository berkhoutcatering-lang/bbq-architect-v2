/**
 * Zod schemas voor menu-templates (Stel-menu-samen v2).
 *
 * Server Actions in `src/app/menu-templates/actions.ts` valideren input via deze
 * schemas voordat ze de RPC `rpc_upsert_menu_template` aanroepen. UI mag dezelfde
 * schemas client-side gebruiken voor optimistic validation, maar de server-action
 * blijft de bron van waarheid.
 *
 * Veld-conventies:
 *   - `gerecht_id` is UUID (gerechten.id), `gang_slug` is een org-scoped slug.
 *   - `volgorde` is 0-based; coerce uit form-strings.
 *   - `MenuTemplateUpsertSchema.id` is numeric (BIGSERIAL) — coerce zodat
 *     formulieren met string-ids óók doorkomen.
 *   - `items` max 200 — voorkomt DoS via gigantische payload, ruim genoeg voor
 *     elke realistische menukaart (een echte BBQ heeft 10-30 gerechten).
 */

import { z } from 'zod';

export const MenuTemplateItemSchema = z.object({
  gerecht_id: z.string().uuid('gerecht_id moet een UUID zijn'),
  gang_slug: z.string().min(1, 'gang_slug is verplicht').max(100),
  volgorde: z.coerce.number().int().nonnegative().default(0),
});

export const MenuTemplateUpsertSchema = z.object({
  id: z.coerce.number().int().positive().optional(),
  naam: z.string().min(1, 'Naam is verplicht').max(200),
  beschrijving: z.string().max(2000).optional().default(''),
  basis_prijs_pp: z.coerce.number().nonnegative().optional().default(0),
  aantal_gasten: z.coerce.number().int().min(1).max(10_000).optional().default(40),
  is_default: z.boolean().optional().default(false),
  items: z.array(MenuTemplateItemSchema).max(200, 'Maximaal 200 gerechten per menukaart'),
});

export const ApplyMenuTemplateSchema = z.object({
  templateId: z.coerce.number().int().positive(),
  offerteId: z.union([z.string().uuid(), z.coerce.number().int()]),
  /* Optionele overrides — als de offerte al een aantal-gasten heeft willen we
     dat niet overschrijven tenzij expliciet meegegeven. */
  aantalGasten: z.coerce.number().int().min(0).max(10_000).optional(),
  basisPrijsPp: z.coerce.number().nonnegative().optional(),
  /* Replace = wis bestaande items eerst. Append (default) = voeg toe. */
  mode: z.enum(['append', 'replace']).optional().default('replace'),
});

export type MenuTemplateItemInput = z.input<typeof MenuTemplateItemSchema>;
export type MenuTemplateUpsertInput = z.input<typeof MenuTemplateUpsertSchema>;
export type MenuTemplateUpsertParsed = z.output<typeof MenuTemplateUpsertSchema>;
export type ApplyMenuTemplateInput = z.input<typeof ApplyMenuTemplateSchema>;
