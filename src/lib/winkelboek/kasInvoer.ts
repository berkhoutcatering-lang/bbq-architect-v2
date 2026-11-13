/**
 * Invoer voor een eigen kasregel ("Geld uit of in de la"): het bedrag lezen en
 * de velden controleren. Zuiver; de serveractie in src/app/winkelboek/actions.ts
 * gebruikt dit, het formulier ook.
 */
import { z } from 'zod';

/**
 * De bovengrens van één kasregel: € 100.000. Ruim boven wat er ooit in een la
 * ligt, en ver onder wat de database in één getal kan bewaren. De tabel
 * winkel_kas_mutaties heeft dezelfde grens.
 */
export const KAS_MAX_CENTS = 10_000_000;

/** Hele euro's met optioneel punten per duizendtal, en optioneel een komma met één of twee cijfers. */
const BEDRAG = /^(?:\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?$/;

/**
 * '9' → 900, '9,5' → 950, '1.250,00' → 125000, '1.250' → 125000.
 * Leeg, nul, negatief of geen getal → null.
 *
 * Een punt gevolgd door één of twee cijfers aan het eind ('9.50') → null: bij
 * kasgeld gokken we niet of dat € 9,50 of € 950 is. Een punt mag alleen als
 * duizendtal, dus met precies drie cijfers erachter.
 */
export function centenUitInvoer(tekst: string): number | null {
    const t = tekst.trim().replace(/^€\s*/, '');
    const m = BEDRAG.exec(t);
    if (!m) return null;
    const euros = Number(t.split(',')[0].replace(/\./g, ''));
    const centen = m[1] ? Number(m[1].padEnd(2, '0')) : 0;
    const totaal = euros * 100 + centen;
    return Number.isSafeInteger(totaal) && totaal > 0 ? totaal : null;
}

function bestaandeDatum(tekst: string): boolean {
    const d = new Date(`${tekst}T12:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === tekst;
}

export const KasRegelSchema = z.object({
    datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Kies een datum.').refine(bestaandeDatum, 'Kies een bestaande datum.'),
    richting: z.enum(['uit', 'in']),
    bedrag: z.string()
        .refine((t) => centenUitInvoer(t) !== null, 'Vul een bedrag in, met een komma voor centen.')
        .refine((t) => (centenUitInvoer(t) ?? 0) <= KAS_MAX_CENTS, 'Een kasregel kan hoogstens € 100.000 zijn.'),
    reden: z.enum(['uitgave', 'prive', 'wisselgeld', 'overig']),
    omschrijving: z.string().trim().min(2, 'Schrijf kort op waar het voor was.').max(200, 'Houd de omschrijving korter dan 200 tekens.'),
    moment: z.enum(['voor_openen', 'tijdens']),
});

export type KasRegelInvoer = z.infer<typeof KasRegelSchema>;
