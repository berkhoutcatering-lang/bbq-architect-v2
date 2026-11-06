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

/* ── Webshop en Toonbank ─────────────────────────────────────────────────
   Plan: docs/context/btw-aangifte-winkel-plan.md.
   Regel: de omzet volgt het geld. Een webshoporder telt op de dag dat er
   geld binnenkomt en voor dat bedrag. Een restbetaling op een Toonbank-bon is
   alleen geld, geen omzet: de omzet van een order komt altijd uit de order. */

export interface WebshopOrder {
    id: number;
    nummer: string;
    status: string;
    totaal_cents: number;
    betaald_cents: number | null;
    betaald_at: string | null;
    rest_betaald_at: string | null;
    leverkosten_cents: number | null;
}

export interface WebshopRegel {
    order_id: number;
    bedrag_cents: number;
    btw_cents: Record<string, number> | number | null;
    btw_pct: number | null;
}

export interface ToonbankBon {
    bonnummer: string | number;
    soort: string;
    status: string;
    bedrijfsdag: string;
    btw: Record<string, { incl_cents: number; btw_cents: number }> | null;
}

interface Tarief { pct: number; incl: number; btw: number }

/** Verdeelt een deelbetaling in hele centen; de laatste krijgt de rest, zodat het klopt. */
export function verdeelOverTarieven(tarieven: Tarief[], deelCents: number, totaalCents: number): Tarief[] {
    if (totaalCents <= 0) return [];
    if (deelCents >= totaalCents) return tarieven;
    let inclOver = deelCents;
    let btwOver = Math.round(tarieven.reduce((s, t) => s + t.btw, 0) * deelCents / totaalCents);
    return tarieven.map((t, i) => {
        const laatste = i === tarieven.length - 1;
        const incl = laatste ? inclOver : Math.round(t.incl * deelCents / totaalCents);
        const btw = laatste ? btwOver : Math.round(t.btw * deelCents / totaalCents);
        inclOver -= incl;
        btwOver -= btw;
        return { pct: t.pct, incl, btw };
    });
}

function btwVanRegel(r: WebshopRegel): number {
    if (typeof r.btw_cents === 'number') return r.btw_cents;
    return Object.values(r.btw_cents ?? {}).reduce((s, c) => s + (Number(c) || 0), 0);
}

/** De geldmomenten van één order als aangifteregels. Geannuleerd telt niet. */
export function webshopRegels(
    order: WebshopOrder,
    regels: WebshopRegel[],
    verzendPct: number,
    start: string,
    eind: string,
): KassaRegel[] {
    if (order.status === 'geannuleerd' || order.totaal_cents <= 0) return [];

    const perPct = new Map<number, Tarief>();
    for (const r of regels) {
        const pct = Number(r.btw_pct ?? 0);
        const t = perPct.get(pct) ?? { pct, incl: 0, btw: 0 };
        t.incl += r.bedrag_cents;
        t.btw += btwVanRegel(r);
        perPct.set(pct, t);
    }
    const lever = order.leverkosten_cents ?? 0;
    if (lever > 0) {
        const t = perPct.get(verzendPct) ?? { pct: verzendPct, incl: 0, btw: 0 };
        t.incl += lever;
        t.btw += Math.round(lever * verzendPct / (100 + verzendPct));
        perPct.set(verzendPct, t);
    }
    const tarieven = [...perPct.values()].sort((a, b) => a.pct - b.pct);

    const online = Math.min(order.betaald_cents ?? 0, order.totaal_cents);
    const momenten: Array<{ ts: string; cents: number }> = [];
    if (online > 0 && order.betaald_at) momenten.push({ ts: order.betaald_at, cents: online });
    if (order.rest_betaald_at && order.totaal_cents > online) {
        momenten.push({ ts: order.rest_betaald_at, cents: order.totaal_cents - online });
    }

    const uit: KassaRegel[] = [];
    for (const m of momenten) {
        const datum = nlDatum(m.ts);
        if (datum < start || datum > eind) continue;
        for (const t of verdeelOverTarieven(tarieven, m.cents, order.totaal_cents)) {
            uit.push({
                datum,
                btw_pct: t.pct,
                omzet: (t.incl - t.btw) / 100,
                btw: t.btw / 100,
                omschrijving: `Webshop ${order.nummer}`,
                referentie: `webshop ${order.nummer}`,
                bron: 'webshop',
            });
        }
    }
    return uit;
}

/** Omzet van één kassabon. `btw` bevat alleen omzet: een orderrest zit er niet in. */
export function toonbankRegels(bon: ToonbankBon): KassaRegel[] {
    if (bon.status !== 'afgerond' || !['verkoop', 'tegenbon'].includes(bon.soort)) return [];
    return Object.entries(bon.btw ?? {}).map(([pct, t]) => ({
        datum: bon.bedrijfsdag,
        btw_pct: Number(pct),
        omzet: (t.incl_cents - t.btw_cents) / 100,
        btw: t.btw_cents / 100,
        omschrijving: `Bon ${bon.bonnummer}`,
        referentie: `toonbank ${bon.bonnummer}`,
        bron: 'toonbank' as const,
    }));
}

export async function laadWebshop(
    sb: SupabaseClient,
    orgId: string,
    start: string,
    eind: string,
): Promise<{ regels: KassaRegel[]; fout: string | null }> {
    const venster = `${dagErbij(start, -1)}T00:00:00Z`;
    const einde = `${dagErbij(eind, 2)}T00:00:00Z`;
    const orders = await alles<WebshopOrder>((van, tot) =>
        sb.from('winkel_orders')
            .select('id,nummer,status,totaal_cents,betaald_cents,betaald_at,rest_betaald_at,leverkosten_cents')
            .eq('organization_id', orgId)
            .or(`and(betaald_at.gte.${venster},betaald_at.lt.${einde}),and(rest_betaald_at.gte.${venster},rest_betaald_at.lt.${einde})`)
            .order('id', { ascending: true })
            .range(van, tot) as unknown as PromiseLike<{ data: WebshopOrder[] | null; error: { message: string; code?: string } | null }>);
    if (orders.error) return { regels: [], fout: `Webshop niet te lezen: ${orders.error.message}` };
    if (orders.data.length === 0) return { regels: [], fout: null };

    const { data: inst } = await sb.from('winkel_instellingen').select('verzendkosten_btw_pct')
        .eq('organization_id', orgId).maybeSingle();
    const verzendPct = Number((inst as { verzendkosten_btw_pct?: number } | null)?.verzendkosten_btw_pct ?? 21);

    const perOrder = new Map<number, WebshopRegel[]>();
    const ids = orders.data.map((o) => o.id);
    for (let i = 0; i < ids.length; i += 200) {
        const res = await alles<WebshopRegel>((van, tot) =>
            sb.from('winkel_order_regels').select('order_id,bedrag_cents,btw_cents,btw_pct')
                .eq('organization_id', orgId).in('order_id', ids.slice(i, i + 200))
                .order('id', { ascending: true })
                .range(van, tot) as unknown as PromiseLike<{ data: WebshopRegel[] | null; error: { message: string; code?: string } | null }>);
        if (res.error) return { regels: [], fout: `Webshopregels niet te lezen: ${res.error.message}` };
        for (const r of res.data) perOrder.set(r.order_id, [...(perOrder.get(r.order_id) ?? []), r]);
    }

    return {
        regels: orders.data.flatMap((o) => webshopRegels(o, perOrder.get(o.id) ?? [], verzendPct, start, eind)),
        fout: null,
    };
}

export async function laadToonbank(
    sb: SupabaseClient,
    orgId: string,
    start: string,
    eind: string,
): Promise<{ regels: KassaRegel[]; dagen: KassaDag[]; fout: string | null }> {
    const [bonnen, uit] = await Promise.all([
        alles<ToonbankBon>((van, tot) =>
            sb.from('toonbank_bonnen').select('bonnummer,soort,status,bedrijfsdag,btw')
                .eq('organization_id', orgId)
                .gte('bedrijfsdag', start).lte('bedrijfsdag', eind)
                .order('id', { ascending: true })
                .range(van, tot) as unknown as PromiseLike<{ data: ToonbankBon[] | null; error: { message: string; code?: string } | null }>),
        sb.from('btw_kassa_uitsluitingen').select('datum').eq('organization_id', orgId)
            .gte('datum', start).lte('datum', eind) as unknown as PromiseLike<{ data: Array<{ datum: string }> | null }>,
    ]);
    if (bonnen.error) return { regels: [], dagen: [], fout: `Toonbank niet te lezen: ${bonnen.error.message}` };

    const uitgesloten = new Set((uit.data ?? []).map((r) => String(r.datum)));
    const dagen = new Map<string, KassaDag>();
    const regels: KassaRegel[] = [];
    for (const bon of bonnen.data) {
        const delen = toonbankRegels(bon);
        if (delen.length === 0) continue;
        const d = dagen.get(bon.bedrijfsdag)
            ?? { datum: bon.bedrijfsdag, orders: 0, betaald: 0, omzet: 0, btw: 0, uitgesloten: uitgesloten.has(bon.bedrijfsdag) };
        d.orders += 1;
        d.betaald += 1;
        for (const r of delen) {
            d.omzet += r.omzet;
            d.btw += r.btw;
        }
        dagen.set(bon.bedrijfsdag, d);
        if (!d.uitgesloten) regels.push(...delen);
    }
    return { regels, dagen: [...dagen.values()], fout: null };
}

function voegDagenSamen(a: KassaDag[], b: KassaDag[]): KassaDag[] {
    const uit = new Map(a.map((d) => [d.datum, { ...d }]));
    for (const d of b) {
        const x = uit.get(d.datum);
        if (!x) { uit.set(d.datum, { ...d }); continue; }
        x.orders += d.orders;
        x.betaald += d.betaald;
        x.omzet += d.omzet;
        x.btw += d.btw;
    }
    const rond = (n: number) => Math.round(n * 100) / 100;
    return [...uit.values()]
        .map((d) => ({ ...d, omzet: rond(d.omzet), btw: rond(d.btw) }))
        .sort((x, y) => x.datum.localeCompare(y.datum));
}

export async function laadAangifteBronnen(
    sb: SupabaseClient,
    orgId: string,
    start: string,
    eind: string,
): Promise<AangifteBronnen & { fout: string | null }> {
    const [factRes, bonRes, kassaRes, webshopRes, toonbankRes] = await Promise.all([
        alles<FactuurMin>((van, tot) =>
            sb.from('facturen').select('id,nummer,client_naam,datum,status,items')
                .eq('organization_id', orgId)
                .gte('datum', start).lte('datum', eind)
                .order('id', { ascending: true })
                .range(van, tot) as unknown as PromiseLike<{ data: FactuurMin[] | null; error: { message: string; code?: string } | null }>),
        laadBonnen(sb, orgId, start, eind),
        laadKassa(sb, orgId, start, eind),
        laadWebshop(sb, orgId, start, eind),
        laadToonbank(sb, orgId, start, eind),
    ]);

    return {
        facturen: factRes.data,
        bonnen: bonRes.bonnen,
        kassa: [...kassaRes.regels, ...webshopRes.regels, ...toonbankRes.regels],
        kassa_fout: [kassaRes.fout, webshopRes.fout, toonbankRes.fout].filter(Boolean).join(' · ') || null,
        kassa_statussen: kassaRes.statussen,
        kassa_dagen: voegDagenSamen(kassaRes.dagen, toonbankRes.dagen),
        kassa_uitsluiten_beschikbaar: kassaRes.uitsluiten_beschikbaar,
        verlegd_beschikbaar: bonRes.verlegd_beschikbaar,
        fout: factRes.error?.message || bonRes.fout || null,
    };
}
