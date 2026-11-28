/**
 * Zod-schema voor klant-records (CRUD-input).
 *
 * Geëxtraheerd uit `src/app/klanten/actions.ts` zodat hetzelfde schema
 * ook bruikbaar is voor:
 *   - API-routes die klant-data accepteren (bv. `/api/onboarding/seed-demo`)
 *   - Test-cases die de schema-parsing direct kunnen testen zonder de
 *     Server Action te mocken
 *   - Toekomstige bulk-import (CSV / Excel) die hetzelfde format moet
 *     respecteren
 *
 * Pattern: centrale schemas in `src/lib/schemas/` per resource. Server
 * Actions importeren en exporteren ook de `Input` type voor consumers.
 *
 * Veld-conventies (waarom optionele defaults i.p.v. nullable):
 *   - Tenants in opstart leveren vaak alleen naam + telefoon. Postcode,
 *     plaats, email worden pas later ingevuld.
 *   - `email` accepteert lege string OF geldige email — vermijdt format-
 *     check failure bij empty input.
 *   - `type` is een vrij veld (Particulier / Bedrijf / Stichting / ...);
 *     geen enum zodat tenants eigen labels kunnen gebruiken.
 */

import { z } from 'zod';

export const KlantSchema = z.object({
    id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
    naam: z.string().min(1, 'Naam is verplicht').max(200),
    bedrijf: z.string().max(200).optional().default(''),
    adres: z.string().max(500).optional().default(''),
    postcode: z.string().max(20).optional().default(''),
    plaats: z.string().max(200).optional().default(''),
    telefoon: z.string().max(50).optional().default(''),
    email: z.string().email('Ongeldig e-mailadres').or(z.literal('')).optional().default(''),
    type: z.string().max(100).optional().default(''),
    notities: z.string().max(5000).optional().default(''),
});

export type KlantInput = z.input<typeof KlantSchema>;
export type KlantParsed = z.output<typeof KlantSchema>;
