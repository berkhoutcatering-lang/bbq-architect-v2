/**
 * Zod-schema voor event-records (CRUD-input).
 *
 * Geëxtraheerd uit `src/app/events/actions.ts`. Herbruikbaar voor:
 *   - API-routes die event-data accepteren (bv. iCalendar-import,
 *     toekomstige Google-Calendar sync)
 *   - Test-cases zonder Supabase-mocks
 *   - Acceptance-workflow (offerte → event sync na klant-accept)
 *
 * Veld-conventies:
 *   - Status-enum is bewust ruimhartig: 5 NL-waarden voor nieuwe events
 *     plus 3 legacy Engelse waarden ('confirmed', 'completed', 'cancelled')
 *     die in oudere rijen voorkomen. Beide accepteren zodat upsertEvent
 *     ook bestaande events kan updaten zonder eerst te migreren.
 *   - `menu` en `menu_selectie` zijn `unknown` — kunnen 3 shapes hebben
 *     (gang-key object, plat array, JSON-string). Validatie van de
 *     concrete shape gebeurt in `calcOfferteMarge()` en de menu-rendering.
 *   - `.passthrough()` blijft staan voor backwards-compat met velden
 *     buiten dit schema (bv. `prep_tasks_synced_at`, `event_hub_settings`).
 *   - `organization_id` is in het schema OPGENOMEN (UUID-validated) zodat
 *     bulk-import flows hem expliciet kunnen meegeven. RLS WITH-CHECK
 *     policy op `events` is de echte tenant-isolatie — niet dit schema.
 *   - `client_email` accepteert lege string als opt-in voor "WhatsApp-only"
 *     klanten (zelfde rationale als KlantSchema).
 */

import { z } from 'zod';

/* Alle 8 geaccepteerde status-waarden. Eerste 5 zijn NL-canon voor nieuwe
   events; laatste 3 zijn legacy Engelse vorm voor pre-migration rijen. */
export const EVENT_STATUSES = [
    'concept', 'pending', 'bevestigd', 'voltooid', 'geannuleerd',
    'confirmed', 'completed', 'cancelled',
] as const;

export type EventStatus = (typeof EVENT_STATUSES)[number];

export const EventSchema = z.object({
    id: z.union([z.string().uuid(), z.coerce.number().int()]).optional(),
    name: z.string().min(1, 'Naam is verplicht').max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum moet YYYY-MM-DD zijn'),
    guests: z.coerce.number().int().min(0).max(10_000),
    ppp: z.coerce.number().nonnegative().optional().nullable(),
    location: z.string().max(500).optional().nullable(),
    client_naam: z.string().min(1, 'Klantnaam is verplicht').max(200).optional().nullable(),
    client_email: z.string().email().or(z.literal('')).optional().nullable(),
    client_telefoon: z.string().max(50).optional().nullable(),
    type: z.string().max(50).optional().nullable(),
    status: z.enum(EVENT_STATUSES).optional().default('concept'),
    /* Open velden voor menu, prep, notities — backend valideert deeper als nodig. */
    menu: z.unknown().optional(),
    menu_selectie: z.unknown().optional(),
    notities: z.string().max(10_000).optional().nullable(),
    organization_id: z.string().uuid().optional(),
}).passthrough();

export type EventInput = z.input<typeof EventSchema>;
export type EventParsed = z.output<typeof EventSchema>;
