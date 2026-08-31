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

/** Vrij tekstveld dat leeg mag zijn. */
const tekst = (max: number) => z.string().max(max).nullable().optional();
/** Getal dat leeg mag blijven. Bewust géén default: een ontbrekende maat moet
 *  leeg blijven en niet stilletjes 0 worden — daar rekent de capaciteitscheck
 *  later mee. */
const getal = z.coerce.number().finite().nullable().optional();

export const MaterieelSchema = z.object({
    id: z.coerce.number().int().optional(),
    naam: z.string().min(1, 'Naam is verplicht').max(200),
    type: z.string().max(100).optional().default(''),
    status: z.enum(MATERIEEL_STATUSES).optional().default('ok'),
    aanschaf_datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).or(z.literal('')).optional().default(''),
    notitie: z.string().max(5000).optional().default(''),
    locatie: z.string().max(200).nullable().optional(),
    fotos: z.array(z.string().url()).max(20, 'Max 20 foto\'s per item').nullable().optional(),
    logboek: z.array(LogboekEntrySchema).max(200, 'Max 200 logboek-entries').optional().default([]),

    /* ── Scan-velden ───────────────────────────────────────────────────
       Stonden hier niet, terwijl de AI-scan ze wél teruggaf. Zod gooit
       onbekende sleutels standaard weg, dus kleur, materiaal en afmetingen
       werden bij elke scan-opslag stilletjes verwijderd. Nu declareerd. */
    kleur: tekst(200),
    materiaal: tekst(200),
    afmetingen: tekst(200),
    geschikt_voor_gangen: z.array(z.string().max(50)).max(20).nullable().optional(),
    ai_styling_hint: tekst(1000),
    scan_source: tekst(100),
    scan_data: z.unknown().nullable().optional(),

    /* ── Apparatuur ────────────────────────────────────────────────────
       Zie migratie 20260831140000. Maakt van de spullenlijst een ontwerp-
       bron: niet alleen "past dit erin?" maar "wat kan ik hiermee maken?" */
    soort: tekst(50),
    merk: tekst(120),
    model: tekst(120),
    artikelnummer: tekst(120),
    product_url: z.string().url().max(2000).nullable().optional(),

    breedte_mm: getal,
    diepte_mm: getal,
    hoogte_mm: getal,
    gewicht_g: getal,

    capaciteit_waarde: getal,
    capaciteit_eenheid: tekst(30),
    temp_min_c: getal,
    temp_max_c: getal,
    concurrent_jobs: getal,

    gn_code: tekst(20),
    gn_compatibel: z.array(z.string().max(20)).max(50).nullable().optional(),
    gaat_mee_op_locatie: z.boolean().nullable().optional(),

    maakt_mogelijk: z.array(z.string().max(120)).max(50).nullable().optional(),
    hulpstukken_aanwezig: z.array(z.string().max(120)).max(100).nullable().optional(),
    hulpstukken_beschikbaar: z.unknown().nullable().optional(),
    specificaties: z.unknown().nullable().optional(),
    versnelling_factor: getal,
    gelijkmatig: z.boolean().nullable().optional(),
    capaciteit_per_uur: getal,
    min_porties_rendabel: getal,
    aanschafprijs_cents: getal,
    nieuwprijs_cents: getal,
    nieuwprijs_valuta: z.string().regex(/^[A-Z]{3}$/).nullable().optional(),
    prijs_incl_btw: z.boolean().nullable().optional(),
    prijs_bijgewerkt_op: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
});

export type MaterieelInput = z.input<typeof MaterieelSchema>;
export type MaterieelParsed = z.output<typeof MaterieelSchema>;
export type LogboekEntryInput = z.input<typeof LogboekEntrySchema>;
