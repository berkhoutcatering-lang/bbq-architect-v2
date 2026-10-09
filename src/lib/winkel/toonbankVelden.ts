/**
 * BA-4a — de catalogusvelden voor de Toonbank, zonder scherm of database.
 * Migratie: supabase/migrations/20261006120000_toonbank_catalogus.sql.
 * Contract: hopbites-toonbank/docs/datacontract-toonbank-v1.md §2 en §3.3.
 *
 * - kanalen: waar een artikel verkocht wordt (webshop, toonbank, event);
 * - toonbank_groep / _volgorde / _favoriet: de knop op het verkoopscherm;
 * - statiegeld_cents: per stuk, buiten de btw;
 * - EAN: één product per streepjescode binnen een organisatie.
 *
 * Dezelfde grenzen als de database-constraints, maar leesbaar vóór Postgres
 * ze geeft.
 */
import { z } from 'zod';

export const KANALEN = ['webshop', 'toonbank', 'event'] as const;
export type Kanaal = (typeof KANALEN)[number];

/** Uniek, in vaste volgorde (webshop, toonbank, event); zo is een vergelijking eenvoudig. */
export function normaliseerKanalen(kanalen: readonly string[] | null | undefined): Kanaal[] {
    const set = new Set(kanalen ?? []);
    return KANALEN.filter((k) => set.has(k));
}

export const KanalenSchema = z
    .array(z.enum(KANALEN, { message: 'Een kanaal is webshop, toonbank of event' }))
    .max(KANALEN.length)
    .transform((k) => normaliseerKanalen(k));

/** Leeg of alleen spaties = geen groep. Hooguit 40 tekens (de knop op de tablet). */
export const ToonbankGroepSchema = z
    .string()
    .trim()
    .max(40, 'Een Toonbank-groep is hooguit 40 tekens')
    .nullable()
    .transform((g) => (g ? g : null));

export const ToonbankArtikelVelden = z.object({
    kanalen: KanalenSchema.default(['webshop']),
    toonbank_groep: ToonbankGroepSchema.default(null),
    toonbank_volgorde: z.number().int().min(-9999).max(9999).default(0),
    toonbank_favoriet: z.boolean().default(false),
});
export type ToonbankArtikelVelden = z.infer<typeof ToonbankArtikelVelden>;

/** Statiegeld per stuk in centen: 0 (geen) tot en met € 100. */
export const StatiegeldSchema = z
    .number()
    .int('Statiegeld in hele centen')
    .min(0, 'Statiegeld is nooit negatief')
    .max(10_000, 'Statiegeld is hooguit € 100 per stuk');

/** Een streepjescode: 8 tot 14 cijfers, of leeg. */
export const EanSchema = z
    .string()
    .trim()
    .regex(/^\d{8,14}$/, 'Een streepjescode is 8 tot 14 cijfers')
    .nullable();

/** De naam van de unieke index uit de migratie. */
export const EAN_INDEX = 'winkel_producten_ean_uniek';

/**
 * Een leesbare melding als Postgres een dubbele EAN weigert (23505 op de
 * unieke index), anders null. Werkt op een PostgrestError of een pg-fout.
 */
export function eanFoutMelding(fout: { code?: string | null; message?: string | null; details?: string | null } | null | undefined): string | null {
    if (!fout || fout.code !== '23505') return null;
    const tekst = `${fout.message ?? ''} ${fout.details ?? ''}`;
    if (!tekst.includes(EAN_INDEX) && !/\(organization_id, ean\)/.test(tekst)) return null;
    return 'Deze streepjescode hoort al bij een ander product. Eén product per streepjescode: haal hem daar eerst weg.';
}

/** De groepen die al in gebruik zijn, voor een keuzelijst: uniek, op naam. */
export function toonbankGroepen(artikelen: readonly { toonbank_groep?: string | null }[]): string[] {
    const set = new Set<string>();
    for (const a of artikelen) {
        const g = a.toonbank_groep?.trim();
        if (g) set.add(g);
    }
    return [...set].sort((x, y) => x.localeCompare(y, 'nl'));
}

/** "op de Toonbank", "webshop en toonbank" — voor een regel in een lijst. */
export function kanalenTekst(kanalen: readonly string[] | null | undefined): string {
    const k = normaliseerKanalen(kanalen);
    if (k.length === 0) return 'nergens te koop';
    if (k.length === 1) return `alleen ${k[0]}`;
    return `${k.slice(0, -1).join(', ')} en ${k[k.length - 1]}`;
}
