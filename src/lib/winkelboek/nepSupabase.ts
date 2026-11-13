/**
 * Alleen voor tests: een nagemaakte Supabase-client die elke vraag vastlegt en
 * het antwoord uit één functie haalt. Zo draaien de echte laders van
 * Boekhouding winkel in een test, zonder database.
 *
 * Geeft het antwoord meer rijen dan het gevraagde bereik (`range`), dan knipt
 * de client zelf: bladeren is daarmee vanzelf mee getest.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface Aanroep {
    tabel: string;
    kolommen: string;
    /** Elke ketenstap behalve select/range/insert/delete: ['eq', 'organization_id', 'org-1']. */
    filters: unknown[][];
    bereik: [number, number] | null;
    /** De rij van een insert, anders undefined. */
    insert?: unknown;
    verwijder?: boolean;
    enkel?: boolean;
}

export interface Uitkomst {
    data: unknown[] | null;
    error: { message: string; code?: string } | null;
}

export function nepSupabase(antwoord: (a: Aanroep) => Uitkomst | Promise<Uitkomst>): { sb: SupabaseClient; aanroepen: Aanroep[] } {
    const aanroepen: Aanroep[] = [];

    const from = (tabel: string) => {
        const a: Aanroep = { tabel, kolommen: '', filters: [], bereik: null };
        const vraag: Record<string, unknown> = new Proxy({}, {
            get(_doel, naam) {
                if (naam === 'then') {
                    return (klaar: (u: unknown) => unknown, mis: (e: unknown) => unknown) => {
                        aanroepen.push(a);
                        return Promise.resolve(antwoord(a)).then((u) => {
                            let data: unknown = u.data;
                            if (Array.isArray(data) && a.bereik) data = data.slice(a.bereik[0], a.bereik[1] + 1);
                            if (a.enkel) data = Array.isArray(data) ? (data[0] ?? null) : data;
                            return { data, error: u.error };
                        }).then(klaar, mis);
                    };
                }
                if (naam === 'select') return (kolommen: string) => { a.kolommen = kolommen; return vraag; };
                if (naam === 'range') return (van: number, tot: number) => { a.bereik = [van, tot]; return vraag; };
                if (naam === 'insert') return (rij: unknown) => { a.insert = rij; return vraag; };
                if (naam === 'delete') return () => { a.verwijder = true; return vraag; };
                if (naam === 'maybeSingle' || naam === 'single') return () => { a.enkel = true; return vraag; };
                return (...args: unknown[]) => { a.filters.push([String(naam), ...args]); return vraag; };
            },
        });
        return vraag;
    };

    return { sb: { from } as unknown as SupabaseClient, aanroepen };
}

/** De waarde van een filter in een aanroep: `filter(a, 'in', 'toonbank_bon_regel_id')`. */
export function filter(a: Aanroep, stap: string, kolom: string): unknown {
    return a.filters.find((f) => f[0] === stap && f[1] === kolom)?.[2];
}
