/**
 * Bronnen voor de BTW-aangifte — één plek die facturen, bonnen en kassa
 * ophaalt, zodat elk scherm (Boekhouder → BTW-aangifte, /financien, het
 * boekhouderpakket en "vastzetten") dezelfde cijfers rekent.
 *
 * Tot 2026-10-26 haalde elke route zelf zijn bonnen op en telde niemand de
 * kassa mee. Twee schermen gaven daardoor twee getallen, en geen van beide
 * klopte met de handmatig nagerekende aangifte.
 *
 * Server-side; krijgt een Supabase-client mee (RLS blijft gelden).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BonVoorbelasting, FactuurMin, KassaRegel } from '@/lib/financeAnalytics';

/** Bon zoals de aangifte-schermen hem nodig hebben. */
export type AangifteBon = BonVoorbelasting & {
    id: number;
    winkel?: string | null;
    ai_classify_status?: string | null;
    locked_at?: string | null;
    leverancier_naam?: string | null;
};

export interface AangifteBronnen {
    facturen: FactuurMin[];
    bonnen: AangifteBon[];
    kassa: KassaRegel[];
    /**
     * Gezet als de kassa niet gelezen kon worden. Dan ontbreekt kassaomzet in
     * 1a/1b — dat moet zichtbaar zijn, niet stil als €0 doorgaan.
     */
    kassa_fout: string | null;
    /** Aantal kassabonnen per status (ook de niet-meegetelde), ter controle. */
    kassa_statussen: Record<string, number>;
    /** False zolang migratie 20261026120000_bonnen_btw_verlegd nog niet gedraaid is. */
    verlegd_beschikbaar: boolean;
}

/** Kassabonnen met deze status tellen niet mee als omzet. */
const KASSA_NIET_MEETELLEN = new Set(['voided', 'refunded']);

const BON_KOLOMMEN =
    'id,datum,winkel,totaal_bedrag,netto_bedrag,btw_laag_bedrag,btw_hoog_bedrag,rgs_code,ai_classify_status,voorbelasting_bevestigd,zakelijk_pct,locked_at,leveranciers(naam)';

const PAGINA = 1000;

/** Kalenderdag in Nederlandse tijd voor een tijdstempel. */
export function nlDatum(ts: string): string {
    return new Intl.DateTimeFormat('sv-SE', {
        timeZone: 'Europe/Amsterdam',
        year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date(ts));
}

function dagErbij(datum: string, dagen: number): string {
    const d = new Date(`${datum}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + dagen);
    return d.toISOString().slice(0, 10);
}

/** Haalt alle pagina's op; PostgREST geeft er standaard maar 1000 per keer. */
async function alles<T>(
    bouw: (van: number, tot: number) => PromiseLike<{ data: T[] | null; error: { message: string; code?: string } | null }>,
): Promise<{ data: T[]; error: { message: string; code?: string } | null }> {
    const uit: T[] = [];
    for (let van = 0; ; van += PAGINA) {
        const { data, error } = await bouw(van, van + PAGINA - 1);
        if (error) return { data: uit, error };
        uit.push(...(data ?? []));
        if (!data || data.length < PAGINA) return { data: uit, error: null };
    }
}

function isOntbrekendeKolom(err: { message: string; code?: string } | null, kolom: string): boolean {
    if (!err) return false;
    return err.code === '42703' || err.code === 'PGRST204' || err.message.includes(kolom);
}

export async function laadBonnen(
    sb: SupabaseClient,
    orgId: string,
    start: string,
    eind: string,
): Promise<{ bonnen: AangifteBon[]; verlegd_beschikbaar: boolean; fout: string | null }> {
    const vraag = (kolommen: string) => alles<Record<string, unknown>>((van, tot) =>
        sb.from('bonnen').select(kolommen)
            .eq('organization_id', orgId)
            .gte('datum', start).lte('datum', eind)
            .order('id', { ascending: true })
            .range(van, tot) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null }>);

    let verlegd_beschikbaar = true;
    let res = await vraag(`${BON_KOLOMMEN},btw_verlegd`);
    if (res.error && isOntbrekendeKolom(res.error, 'btw_verlegd')) {
        /* Migratie nog niet gedraaid: zonder de kolom verder, i.p.v. de hele aangifte kwijt. */
        verlegd_beschikbaar = false;
        res = await vraag(BON_KOLOMMEN);
    }
    if (res.error) return { bonnen: [], verlegd_beschikbaar, fout: res.error.message };

    const bonnen = res.data.map((row) => {
        const lev = row.leveranciers as { naam?: string } | Array<{ naam?: string }> | null | undefined;
        const naam = Array.isArray(lev) ? lev[0]?.naam : lev?.naam;
        const { leveranciers: _l, ...rest } = row;
        return { ...(rest as unknown as AangifteBon), leverancier_naam: naam ?? null };
    });
    return { bonnen, verlegd_beschikbaar, fout: null };
}

/**
 * Kassaverkoop (pos_orders + pos_order_items) in de periode, als losse regels.
 *
 * De kassa-tabellen zijn buiten deze repo aangemaakt. Daarom worden ze met `*`
 * gelezen en wordt per veld gecontroleerd of het er is; ontbreekt er iets,
 * dan komt dat als fout terug in plaats van als stille nul.
 */
export async function laadKassa(
    sb: SupabaseClient,
    orgId: string,
    start: string,
    eind: string,
): Promise<{ regels: KassaRegel[]; fout: string | null; statussen: Record<string, number> }> {
    const statussen: Record<string, number> = {};

    /* Ruimer ophalen dan de periode (tijdzone), daarna per NL-dag filteren. */
    const ordersRes = await alles<Record<string, unknown>>((van, tot) =>
        sb.from('pos_orders').select('*')
            .eq('organization_id', orgId)
            .gte('created_at', `${dagErbij(start, -1)}T00:00:00Z`)
            .lt('created_at', `${dagErbij(eind, 2)}T00:00:00Z`)
            .order('id', { ascending: true })
            .range(van, tot) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null }>);
    if (ordersRes.error) {
        return { regels: [], fout: `Kassa niet te lezen: ${ordersRes.error.message}`, statussen };
    }

    const dagPerOrder = new Map<number | string, string>();
    for (const o of ordersRes.data) {
        if (!('status' in o)) {
            return { regels: [], fout: 'Kassa: geen statuskolom op pos_orders — kan niet zien welke bonnen geannuleerd zijn.', statussen };
        }
        const dag = typeof o.created_at === 'string' ? nlDatum(o.created_at) : null;
        if (!dag || dag < start || dag > eind) continue;
        const status = String(o.status ?? '(leeg)');
        statussen[status] = (statussen[status] ?? 0) + 1;
        if (KASSA_NIET_MEETELLEN.has(status.toLowerCase())) continue;
        dagPerOrder.set(o.id as number | string, dag);
    }
    if (dagPerOrder.size === 0) return { regels: [], fout: null, statussen };

    const ids = [...dagPerOrder.keys()];
    const regels: KassaRegel[] = [];
    for (let i = 0; i < ids.length; i += 200) {
        const blok = ids.slice(i, i + 200);
        const itemsRes = await alles<Record<string, unknown>>((van, tot) =>
            sb.from('pos_order_items').select('*')
                .in('order_id', blok)
                .order('id', { ascending: true })
                .range(van, tot) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null }>);
        if (itemsRes.error) {
            return { regels: [], fout: `Kassaregels niet te lezen: ${itemsRes.error.message}`, statussen };
        }
        for (const it of itemsRes.data) {
            if (!('line_excl_cents' in it) || !('line_btw_cents' in it) || !('btw_rate' in it)) {
                return { regels: [], fout: 'Kassaregels missen line_excl_cents, line_btw_cents of btw_rate.', statussen };
            }
            const ruw = it.btw_rate === null || it.btw_rate === undefined ? null : Number(it.btw_rate);
            /* Sommige kassa's schrijven 0.09 i.p.v. 9. */
            const pct = ruw === null || !Number.isFinite(ruw) ? null : (ruw > 0 && ruw < 1 ? Math.round(ruw * 100) : ruw);
            regels.push({
                datum: dagPerOrder.get(it.order_id as number | string)!,
                btw_pct: pct,
                omzet: (Number(it.line_excl_cents) || 0) / 100,
                btw: (Number(it.line_btw_cents) || 0) / 100,
                omschrijving: typeof it.product_name === 'string' ? it.product_name : undefined,
                referentie: `kassa #${String(it.order_id)}`,
            });
        }
    }
    return { regels, fout: null, statussen };
}

export async function laadAangifteBronnen(
    sb: SupabaseClient,
    orgId: string,
    start: string,
    eind: string,
): Promise<AangifteBronnen & { fout: string | null }> {
    const [factRes, bonRes, kassaRes] = await Promise.all([
        alles<FactuurMin>((van, tot) =>
            sb.from('facturen').select('id,nummer,client_naam,datum,status,items')
                .eq('organization_id', orgId)
                .gte('datum', start).lte('datum', eind)
                .order('id', { ascending: true })
                .range(van, tot) as unknown as PromiseLike<{ data: FactuurMin[] | null; error: { message: string; code?: string } | null }>),
        laadBonnen(sb, orgId, start, eind),
        laadKassa(sb, orgId, start, eind),
    ]);

    return {
        facturen: factRes.data,
        bonnen: bonRes.bonnen,
        kassa: kassaRes.regels,
        kassa_fout: kassaRes.fout,
        kassa_statussen: kassaRes.statussen,
        verlegd_beschikbaar: bonRes.verlegd_beschikbaar,
        fout: factRes.error?.message || bonRes.fout || null,
    };
}
