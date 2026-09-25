/**
 * Vakje-filter voor de inkoop — plan docs/webshop-beheer-bouwplan.md §4.4/§4.5.
 *
 * Een vakje is de dag waarop iets klaar moet zijn (zie /verkoop/webshop). De
 * sleutel is wat de URL draagt:
 *   moment:<uuid>   een afhaalmoment of -dag → het event van dat moment
 *   dag:<datum>     de vaste bak: losse producten en verzendorders van die dag
 *
 * Wat hier puur is (sleutel lezen, pseudo-event per dag, de vraag van losse
 * webshop-regels) is apart getest; alleen resolveVakje praat met de database.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type VakjeSleutel =
    | { soort: 'moment'; momentId: string }
    | { soort: 'dag'; datum: string };

export interface VakjeFilter {
    sleutel: string;
    label: string;
    datum: string;
    /** Bij een afhaalmoment: het event dat er het vakje van is. */
    eventId: number | null;
}

const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export function leesVakjeSleutel(s: string | null | undefined): VakjeSleutel | null {
    if (!s) return null;
    if (s.startsWith('moment:')) {
        const id = s.slice(7);
        return /^[0-9a-f-]{36}$/i.test(id) ? { soort: 'moment', momentId: id } : null;
    }
    if (s.startsWith('dag:')) {
        const d = s.slice(4);
        return DATUM.test(d) ? { soort: 'dag', datum: d } : null;
    }
    return null;
}

/**
 * De vaste bak heeft geen event. Op de bestellijst krijgt elke dag een eigen
 * pseudo-event met een negatief id (dagen sinds 1970, negatief), zodat het
 * nooit botst met een echt event en per dag apart telt.
 */
export function dagPseudoEventId(datum: string): number {
    const m = DATUM.exec(datum);
    if (!m) return -1;
    const [j, ma, d] = datum.split('-').map(Number);
    return -Math.round(Date.UTC(j, ma - 1, d) / 86_400_000);
}

export function datumKortNl(datum: string): string {
    const [j, m, d] = datum.split('-').map(Number);
    if (!j || !m || !d) return datum;
    return new Date(j, m - 1, d).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).replace('.', '');
}

export function datumLangNl(datum: string): string {
    const [j, m, d] = datum.split('-').map(Number);
    if (!j || !m || !d) return datum;
    return new Date(j, m - 1, d).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
}

/* ── De vraag van losse webshop-regels ─────────────────────────────────────── */

export interface WebshopRegel {
    aantal: number;
    klaar_op: string;
    inventory_id: number;
    /** Hoeveel van het voorraad-item één besteld stuk kost; leeg = 1. */
    inkoop_per_stuk: number | null;
    artikel_naam: string;
}

export interface WebshopVraag {
    inventory_id: number;
    qty: number;
    event: { id: number; name: string; date: string };
}

/**
 * Losse producten (bier, saus) lopen niet via een gerecht: 5 flessen = 5 op het
 * voorraad-item, toegeschreven aan "Webshop · <dag>". Een dag die al voorbij is
 * en nog niet klaargezet schuift naar vandaag — precies zoals het vakjes-scherm
 * dat doet.
 *
 * Zonder `datum`: alles tot en met het einde van het venster. Met `datum`:
 * alleen die dag (voor "bestel alleen dit").
 */
export function webshopRegelsNaarVraag(
    regels: WebshopRegel[],
    opts: { vandaag: string; vensterEind: string; datum?: string | null },
): WebshopVraag[] {
    const uit: WebshopVraag[] = [];
    for (const r of regels) {
        if (!(r.aantal > 0) || !DATUM.test(r.klaar_op)) continue;
        const dag = r.klaar_op < opts.vandaag ? opts.vandaag : r.klaar_op;
        if (opts.datum ? dag !== opts.datum : dag > opts.vensterEind) continue;
        const per = r.inkoop_per_stuk != null && r.inkoop_per_stuk > 0 ? r.inkoop_per_stuk : 1;
        uit.push({
            inventory_id: r.inventory_id,
            qty: r.aantal * per,
            event: { id: dagPseudoEventId(dag), name: `Webshop · ${datumKortNl(dag)}`, date: dag },
        });
    }
    return uit;
}

/* ── Met de database ───────────────────────────────────────────────────────── */

/** Zet een sleutel om in een filter. null = onbekend, of het moment heeft nog geen event. */
export async function resolveVakje(sb: SupabaseClient, orgId: string, sleutelRuw: string | null | undefined): Promise<VakjeFilter | null> {
    const s = leesVakjeSleutel(sleutelRuw);
    if (!s) return null;
    if (s.soort === 'dag') {
        return { sleutel: sleutelRuw!, label: `${datumLangNl(s.datum)} · klaarzetten & verzenden`, datum: s.datum, eventId: null };
    }
    const { data: ev } = await sb
        .from('events')
        .select('id, name, date')
        .eq('organization_id', orgId)
        .eq('winkel_moment_id', s.momentId)
        .maybeSingle();
    if (!ev) return null;
    const datum = String(ev.date ?? '').slice(0, 10);
    const naam = String(ev.name ?? '').replace(/\s*·\s*afhalen$/i, '');
    return { sleutel: sleutelRuw!, label: `${datumLangNl(datum)} · ${naam || 'afhalen'}`, datum, eventId: Number(ev.id) };
}
