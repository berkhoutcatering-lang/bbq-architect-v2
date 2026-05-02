/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase';

/* Helper voor het tonen van audit-trails per record. Werkt tegen de
   `audit_log` tabel (migratie 017). Gebruikt vanuit Client Components
   (gerecht-modal "geschiedenis"-sectie, offerte-detail "wijzigingen"-tab,
   factuur-detail compliance-view).

   RLS zorgt dat een user alleen z'n eigen org-rijen ziet — geen extra
   tenant-check nodig in deze helper. */

export type AuditAction = 'insert' | 'update' | 'delete';

export type AuditChange = {
    /* Voor UPDATE: { before, after } per veld. Voor INSERT: snapshot van NEW.
       Voor DELETE: snapshot van OLD. */
    [veld: string]: { before: unknown; after: unknown } | unknown;
};

export interface AuditEntry {
    id: string;
    organization_id: string | null;
    record_table: string;
    record_id: number;
    action: AuditAction;
    user_id: string | null;
    changed_at: string;
    changes: AuditChange;
    metadata: Record<string, unknown>;
    /* Joined via auth.users — naam + email als we daar bij kunnen. */
    user_naam?: string;
    user_email?: string;
}

/* Haal audit-entries op voor een specifiek record. Newest first.
   Limit voorkomt dat oude records met 100+ wijzigingen het scherm verzuipen. */
export async function getAuditLogFor(
    recordTable: string,
    recordId: number | string,
    limit: number = 50,
): Promise<AuditEntry[]> {
    const { data, error } = await supabase
        .from('audit_log')
        .select('*')
        .eq('record_table', recordTable)
        .eq('record_id', recordId)
        .order('changed_at', { ascending: false })
        .limit(limit);

    if (error) {
        /* Tabel bestaat nog niet → migratie 017 niet gedraaid. Geen UI-fout,
           gewoon lege history zodat de modal leesbaar blijft. */
        if (/relation .* does not exist/i.test(error.message)) return [];
        console.warn('[auditLog] fetch error:', error.message);
        return [];
    }

    return (data || []) as AuditEntry[];
}

/* Format-helper voor de UI: zet een changes-object om in leesbare regels.
   Bijvoorbeeld { kostprijs_pp: { before: 2.40, after: 2.80 } } →
   "Kostprijs: €2,40 → €2,80". */
export function formatChange(veld: string, change: unknown): string {
    if (!change || typeof change !== 'object') return '';
    const c = change as { before?: unknown; after?: unknown };
    if (!('before' in c) && !('after' in c)) {
        /* Insert-snapshot — geen diff, alleen waarde. */
        return labelVoor(veld) + ': ' + formatWaarde(change);
    }
    const before = formatWaarde(c.before);
    const after = formatWaarde(c.after);
    return labelVoor(veld) + ': ' + before + ' → ' + after;
}

function labelVoor(veld: string): string {
    /* Mapping van DB-kolomnamen naar mensentaal-labels. Niet uitputtend; val
       terug op de raw kolomnaam. */
    const map: Record<string, string> = {
        naam: 'Naam',
        beschrijving: 'Beschrijving',
        kostprijs_pp: 'Kostprijs',
        verkoopprijs: 'Verkoopprijs',
        marge_pct: 'Marge',
        gang_slug: 'Gang',
        actief: 'Actief',
        status: 'Status',
        bron: 'Bron',
        allergenen: 'Allergenen',
        ingredienten: 'Ingrediënten',
        tags: 'Tags',
        bereidingswijze: 'Bereidingswijze',
        porties: 'Porties',
        wijn_suggestie: 'Wijn-suggestie',
        service_tip: 'Service-tip',
        target_prep_time: 'Bereidingstijd',
        client_naam: 'Klant',
        client_adres: 'Klant-adres',
        datum: 'Datum',
        items: 'Regels',
        aantal_gasten: 'Aantal gasten',
        basis_prijs_pp: 'Basisprijs',
        korting: 'Korting',
        menu_selectie: 'Menu',
        nummer: 'Nummer',
        vervaldatum: 'Vervaldatum',
        offerte_id: 'Offerte-link',
        event_id: 'Event-link',
    };
    return map[veld] || veld;
}

function formatWaarde(v: unknown): string {
    if (v == null) return '—';
    if (typeof v === 'boolean') return v ? 'ja' : 'nee';
    if (typeof v === 'number') return String(v);
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 57) + '...' : v;
    if (Array.isArray(v)) return '[' + v.length + ' items]';
    return JSON.stringify(v).slice(0, 60);
}

/* Korte action-label voor de UI (NL). */
export function actieLabel(action: AuditAction): string {
    if (action === 'insert') return 'Aangemaakt';
    if (action === 'delete') return 'Verwijderd';
    return 'Gewijzigd';
}
