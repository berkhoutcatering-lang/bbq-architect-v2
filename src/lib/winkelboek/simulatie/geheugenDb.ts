/**
 * Alleen voor tests en de testpagina: een database in het geheugen die de
 * vragen van de laders echt beantwoordt (filteren, sorteren, bladeren,
 * toevoegen). Zo draait de hele keten van Boekhouding winkel op nagemaakte
 * winkelweken, zonder Supabase.
 *
 * Wat hij níet kan: controleren of een kolom in de echte database bestaat.
 * Een verkeerde kolomnaam geeft hier `undefined`, in het echt een fout.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { nepSupabase, type Aanroep, type Uitkomst } from '../nepSupabase';

export type Rij = Record<string, unknown>;
export type Tabellen = Record<string, Rij[]>;

/** 'toonbank_bonnen.status' en 'metadata->>bedrijfsdag' lezen door in het object. */
function waarde(rij: Rij, kolom: string): unknown {
    let nu: unknown = rij;
    for (const stap of kolom.split(/->>|->|\./)) {
        if (nu === null || nu === undefined || typeof nu !== 'object') return undefined;
        nu = (nu as Rij)[stap];
    }
    return nu;
}

function vergelijk(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a ?? '').localeCompare(String(b ?? ''));
}

const gelijk = (a: unknown, b: unknown) => (typeof a === 'boolean' || typeof b === 'boolean' ? a === b : String(a) === String(b));

function past(rij: Rij, f: unknown[]): boolean {
    const [stap, kolom, x, y] = f as [string, string, unknown, unknown];
    if (stap === 'order' || stap === 'limit') return true;
    const v = waarde(rij, kolom);
    switch (stap) {
        case 'eq': return v !== null && v !== undefined && gelijk(v, x);
        case 'neq': return !gelijk(v, x);
        case 'gte': return v !== null && v !== undefined && vergelijk(v, x) >= 0;
        case 'lte': return v !== null && v !== undefined && vergelijk(v, x) <= 0;
        case 'gt': return v !== null && v !== undefined && vergelijk(v, x) > 0;
        case 'lt': return v !== null && v !== undefined && vergelijk(v, x) < 0;
        case 'in': return (x as unknown[]).some((w) => gelijk(v, w));
        case 'is': return x === null ? v === null || v === undefined : v === x;
        case 'not': {
            if (x === 'in') return !String(y).replace(/^\(|\)$/g, '').split(',').some((w) => gelijk(v, w));
            throw new Error(`geheugenDb kent not.${String(x)} niet`);
        }
        default: return true;
    }
}

export function geheugenDb(tabellen: Tabellen): { sb: SupabaseClient; aanroepen: Aanroep[]; tabellen: Tabellen } {
    const antwoord = (a: Aanroep): Uitkomst => {
        const rijen = tabellen[a.tabel];
        if (!rijen) return { data: null, error: { message: `relation "${a.tabel}" does not exist`, code: 'PGRST205' } };

        if (a.insert) {
            const nieuw = { ...(a.insert as Rij) };
            if (nieuw.id !== undefined && rijen.some((r) => r.id === nieuw.id)) return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
            rijen.push(nieuw);
            return { data: [nieuw], error: null };
        }

        const onbekend = a.filters.find((f) => !['eq', 'neq', 'gte', 'lte', 'gt', 'lt', 'in', 'is', 'not', 'order', 'limit'].includes(String(f[0])));
        if (onbekend) throw new Error(`geheugenDb kent de stap ${String(onbekend[0])} niet (tabel ${a.tabel})`);

        let uit = rijen.filter((r) => a.filters.every((f) => past(r, f)));
        if (a.verwijder) {
            tabellen[a.tabel] = rijen.filter((r) => !uit.includes(r));
            return { data: uit, error: null };
        }

        const volgorde = a.filters.filter((f) => f[0] === 'order') as [string, string, { ascending?: boolean } | undefined][];
        if (volgorde.length > 0) {
            uit = [...uit].sort((p, q) => {
                for (const [, kolom, optie] of volgorde) {
                    const c = vergelijk(waarde(p, kolom), waarde(q, kolom));
                    if (c !== 0) return optie?.ascending === false ? -c : c;
                }
                return 0;
            });
        }
        const limiet = a.filters.find((f) => f[0] === 'limit');
        if (limiet) uit = uit.slice(0, Number(limiet[1]));
        return { data: uit, error: null };
    };

    const nep = nepSupabase(antwoord);
    return { sb: nep.sb, aanroepen: nep.aanroepen, tabellen };
}
