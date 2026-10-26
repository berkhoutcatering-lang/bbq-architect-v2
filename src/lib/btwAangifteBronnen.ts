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
    /** Kassa per verkoopdag, inclusief dagen die op "telt niet mee" staan. */
    kassa_dagen: KassaDag[];
    /** False zolang migratie 20261026130000_btw_kassa_uitsluitingen nog niet gedraaid is. */
    kassa_uitsluiten_beschikbaar: boolean;
    /** False zolang migratie 20261026140000_bonnen_btw_verlegd nog niet gedraaid is. */
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

/** Eén verkoopdag van de kassa, zoals Mathijs hem in het aangiftescherm ziet. */
export interface KassaDag {
    datum: string;
    /** Meegetelde bonnen (niet geannuleerd/terugbetaald). */
    orders: number;
    /** Waarvan met een betaaltijdstip (paid_at). */
    betaald: number;
    omzet: number;
    btw: number;
    /** Handmatig op "telt niet mee" gezet (bv. testbestellingen). */
    uitgesloten: boolean;
}

/**
 * Kassaverkoop (pos_orders + pos_order_items) in de periode, als losse regels.
 *
 * De kassa-tabellen komen uit de kassa-app (andere repo). Live schema,
 * vastgesteld op 2026-10-26: pos_orders(id, org_id, status, created_at,
 * paid_at, voided_at, refunded_at, …) en pos_order_items(order_id, org_id,
 * btw_rate int, line_excl_cents, line_btw_cents, name, …). Let op: `org_id`,
 * níet `organization_id`.
 *
 * Er wordt niets automatisch weggefilterd behalve geannuleerde en
 * terugbetaalde bonnen. Testbestellingen blijven staan; Mathijs kan per dag
 * kiezen dat een dag niet meetelt (btw_kassa_uitsluitingen). Uitgesloten
 * dagen staan wel in `dagen`, maar hun regels niet in `regels`.
 *
 * Ontbreekt er een veld of tabel, dan komt dat als fout terug in plaats van
 * als stille nul.
 */
export async function laadKassa(
    sb: SupabaseClient,
    orgId: string,
    start: string,
    eind: string,
): Promise<{
    regels: KassaRegel[];
    dagen: KassaDag[];
    fout: string | null;
    statussen: Record<string, number>;
    uitsluiten_beschikbaar: boolean;
}> {
    const statussen: Record<string, number> = {};
    const leeg = (fout: string | null, uitsluiten_beschikbaar = true) =>
        ({ regels: [], dagen: [], fout, statussen, uitsluiten_beschikbaar });

    /* Ruimer ophalen dan de periode (tijdzone), daarna per NL-dag filteren. */
    const [ordersRes, uitRes] = await Promise.all([
        alles<Record<string, unknown>>((van, tot) =>
            sb.from('pos_orders').select('*')
                .eq('org_id', orgId)
                .gte('created_at', `${dagErbij(start, -1)}T00:00:00Z`)
                .lt('created_at', `${dagErbij(eind, 2)}T00:00:00Z`)
                .order('id', { ascending: true })
                .range(van, tot) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null }>),
        sb.from('btw_kassa_uitsluitingen').select('datum')
            .eq('organization_id', orgId)
            .gte('datum', start).lte('datum', eind) as unknown as PromiseLike<{ data: Array<{ datum: string }> | null; error: { message: string; code?: string } | null }>,
    ]);
    if (ordersRes.error) return leeg(`Kassa niet te lezen: ${ordersRes.error.message}`);

    /* Tabel bestaat nog niet (migratie niet gedraaid) → niets uitgesloten. */
    const uitsluiten_beschikbaar = !uitRes.error;
    const uitgesloten = new Set((uitRes.data ?? []).map(r => String(r.datum)));

    const dagPerOrder = new Map<number | string, string>();
    const dagen = new Map<string, KassaDag>();
    for (const o of ordersRes.data) {
        if (!('status' in o)) {
            return leeg('Kassa: geen statuskolom op pos_orders — kan niet zien welke bonnen geannuleerd zijn.');
        }
        const dag = typeof o.created_at === 'string' ? nlDatum(o.created_at) : null;
        if (!dag || dag < start || dag > eind) continue;
        const status = String(o.status ?? '(leeg)');
        statussen[status] = (statussen[status] ?? 0) + 1;
        if (KASSA_NIET_MEETELLEN.has(status.toLowerCase()) || o.voided_at || o.refunded_at) continue;
        dagPerOrder.set(o.id as number | string, dag);
        const d = dagen.get(dag) ?? { datum: dag, orders: 0, betaald: 0, omzet: 0, btw: 0, uitgesloten: uitgesloten.has(dag) };
        d.orders += 1;
        if (o.paid_at) d.betaald += 1;
        dagen.set(dag, d);
    }
    if (dagPerOrder.size === 0) return { regels: [], dagen: [], fout: null, statussen, uitsluiten_beschikbaar };

    const ids = [...dagPerOrder.keys()];
    const regels: KassaRegel[] = [];
    for (let i = 0; i < ids.length; i += 200) {
        const blok = ids.slice(i, i + 200);
        const itemsRes = await alles<Record<string, unknown>>((van, tot) =>
            sb.from('pos_order_items').select('*')
                .eq('org_id', orgId)
                .in('order_id', blok)
                .order('id', { ascending: true })
                .range(van, tot) as unknown as PromiseLike<{ data: Record<string, unknown>[] | null; error: { message: string; code?: string } | null }>);
        if (itemsRes.error) return leeg(`Kassaregels niet te lezen: ${itemsRes.error.message}`);
        for (const it of itemsRes.data) {
            if (!('line_excl_cents' in it) || !('line_btw_cents' in it) || !('btw_rate' in it)) {
                return leeg('Kassaregels missen line_excl_cents, line_btw_cents of btw_rate.');
            }
            const ruw = it.btw_rate === null || it.btw_rate === undefined ? null : Number(it.btw_rate);
            /* Sommige kassa's schrijven 0.09 i.p.v. 9. */
            const pct = ruw === null || !Number.isFinite(ruw) ? null : (ruw > 0 && ruw < 1 ? Math.round(ruw * 100) : ruw);
            const datum = dagPerOrder.get(it.order_id as number | string)!;
            const omzet = (Number(it.line_excl_cents) || 0) / 100;
            const btw = (Number(it.line_btw_cents) || 0) / 100;
            const d = dagen.get(datum)!;
            d.omzet += omzet;
            d.btw += btw;
            if (d.uitgesloten) continue;
            const naam = it.name ?? it.product_name;
            regels.push({
                datum,
                btw_pct: pct,
                omzet,
                btw,
                omschrijving: typeof naam === 'string' ? naam : undefined,
                referentie: `kassa #${String(it.order_id)}`,
            });
        }
    }
    const rond = (n: number) => Math.round(n * 100) / 100;
    const dagLijst = [...dagen.values()]
        .map(d => ({ ...d, omzet: rond(d.omzet), btw: rond(d.btw) }))
        .sort((x, y) => x.datum.localeCompare(y.datum));
    return { regels, dagen: dagLijst, fout: null, statussen, uitsluiten_beschikbaar };
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
        kassa_dagen: kassaRes.dagen,
        kassa_uitsluiten_beschikbaar: kassaRes.uitsluiten_beschikbaar,
        verlegd_beschikbaar: bonRes.verlegd_beschikbaar,
        fout: factRes.error?.message || bonRes.fout || null,
    };
}
