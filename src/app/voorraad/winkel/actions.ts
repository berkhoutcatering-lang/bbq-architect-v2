/**
 * Server Actions voor de winkelvoorraad — tellen, ontvangst, overboeken,
 * afwijking en drempel. Plan: docs/voorraad-bouwplan.md §3 (W1, W2, W5).
 *
 * Huisregels (zie verkoop/webshop/actions.ts):
 *  - Zod op alle invoer; re-auth BINNEN de action; org uit organization_members.
 *  - Het voorraadgetal verandert alleen via de databasefuncties
 *    winkel_muteer_voorraad en voorraad_overboeken: elk getal is een
 *    logboekregel. Onder nul weigert de database (WV001), nooit stil op nul.
 *  - Een sleutel per klik (idempotency_key) maakt een dubbelklik onschadelijk.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { voorraadFout } from '@/lib/winkel/voorraad';
import { evalueerKeukenMeldingen, evalueerWinkelMeldingen } from '@/lib/voorraad/meldingen';
import { verversNaAfloop } from '@/lib/website/verversSignaal';

type ActionResult<T = unknown> = { data: T } | { error: string };

const PADEN = ['/voorraad/winkel', '/voorraad/afwijking', '/verkoop/webshop'];

async function ingelogdMetOrg() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .limit(1)
        .maybeSingle();
    if (!data?.organization_id) return null;
    return { supabase, user, orgId: data.organization_id as string };
}

function eersteFout(e: z.ZodError): string {
    return e.issues[0]?.message ?? 'Controleer de velden';
}

function vertaal(error: { code?: string; message: string }): string {
    return voorraadFout(error.code, error.message);
}

function ververs() {
    for (const p of PADEN) revalidatePath(p);
}

export interface MutatieUitkomst {
    voorraad: number;
    hoeveelheid: number;
    reden: string | null;
    bestond: boolean;
}

function uitkomst(r: unknown): MutatieUitkomst {
    const j = r as { voorraad: number | string; bestond: boolean; mutatie: { hoeveelheid: number | string; reden: string | null } };
    return { voorraad: Number(j.voorraad), hoeveelheid: Number(j.mutatie.hoeveelheid), reden: j.mutatie.reden, bestond: !!j.bestond };
}

const Sleutel = z.string().trim().min(8).max(80);

/* ── Tellen ───────────────────────────────────────────────────────────────── */

/** Het getelde getal. Het verschil (manko of meer geteld) rekent de database uit. */
export async function telWinkelProduct(input: unknown): Promise<ActionResult<MutatieUitkomst>> {
    const parsed = z.object({
        productId: z.string().uuid(),
        geteld: z.number().min(0, 'Een telling is 0 of meer'),
        notitie: z.string().trim().max(300).nullable().default(null),
        sleutel: Sleutel,
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;
    const { data, error } = await s.supabase.rpc('winkel_muteer_voorraad', {
        p_org: s.orgId, p_product_id: d.productId, p_type: 'telling', p_hoeveelheid: d.geteld,
        p_notitie: d.notitie, p_idempotency_key: d.sleutel,
    });
    if (error) return { error: vertaal(error) };
    await evalueerWinkelMeldingen(s.orgId, [d.productId]);
    verversNaAfloop();
    ververs();
    return { data: uitkomst(data) };
}

/* ── Ontvangst ────────────────────────────────────────────────────────────── */

export async function ontvangWinkelProduct(input: unknown): Promise<ActionResult<MutatieUitkomst>> {
    const parsed = z.object({
        productId: z.string().uuid(),
        hoeveelheid: z.number().positive('Hoeveel is er binnengekomen?'),
        /* Per prijs_per van het product, net als op de productkaart. Leeg = ongewijzigd. */
        inkoop_excl_cents: z.number().int().min(0).nullable().default(null),
        tht: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        inkoopOrderId: z.string().uuid().nullable().default(null),
        notitie: z.string().trim().max(300).nullable().default(null),
        sleutel: Sleutel,
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;
    const { data, error } = await s.supabase.rpc('winkel_muteer_voorraad', {
        p_org: s.orgId, p_product_id: d.productId, p_type: 'ontvangst', p_hoeveelheid: d.hoeveelheid,
        p_inkoop_excl_cents: d.inkoop_excl_cents, p_tht: d.tht, p_inkoop_order_id: d.inkoopOrderId,
        p_notitie: d.notitie, p_idempotency_key: d.sleutel,
    });
    if (error) return { error: vertaal(error) };
    await evalueerWinkelMeldingen(s.orgId, [d.productId]);
    verversNaAfloop();
    ververs();
    return { data: uitkomst(data) };
}

/* ── Overboeken tussen makerij en winkel ─────────────────────────────────── */

export async function boekOver(input: unknown): Promise<ActionResult<MutatieUitkomst & { keukenVoorraad: number }>> {
    const parsed = z.object({
        productId: z.string().uuid(),
        inventoryId: z.number().int().positive('Kies het keukenproduct'),
        /* In de eenheid van het winkelproduct. */
        hoeveelheid: z.number().positive('Hoeveel gaat er over?'),
        richting: z.enum(['naar_winkel', 'naar_keuken']).default('naar_winkel'),
        notitie: z.string().trim().max(300).nullable().default(null),
        sleutel: Sleutel,
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;
    const { data, error } = await s.supabase.rpc('voorraad_overboeken', {
        p_org: s.orgId, p_inventory_id: d.inventoryId, p_product_id: d.productId, p_hoeveelheid: d.hoeveelheid,
        p_richting: d.richting, p_notitie: d.notitie, p_idempotency_key: d.sleutel,
    });
    if (error) return { error: vertaal(error) };
    await evalueerWinkelMeldingen(s.orgId, [d.productId]);
    await evalueerKeukenMeldingen(s.orgId, [d.inventoryId]);
    verversNaAfloop();
    ververs();
    revalidatePath('/voorraad');
    return { data: { ...uitkomst(data), keukenVoorraad: Number((data as { keuken_voorraad?: number }).keuken_voorraad ?? 0) } };
}

/* ── Afwijking (W5) ───────────────────────────────────────────────────────── */

const AfwijkingReden = z.enum(['eigen_gebruik', 'proeven', 'derving_breuk', 'derving_tht', 'keuken_verbruik'], {
    message: 'Kies een reden',
});

/**
 * Iets gaat weg zonder verkoop, met een reden. Winkelproduct of keukenproduct;
 * plek, inkoopwaarde en wie vult de database in. Manko is hier niet te kiezen:
 * dat ontstaat alleen bij een telling.
 */
export async function legAfwijkingVast(input: unknown): Promise<ActionResult<{ voorraad: number; waardeCents: number | null }>> {
    const parsed = z.object({
        bron: z.enum(['winkel', 'keuken']),
        id: z.union([z.string().uuid(), z.number().int().positive()]),
        hoeveelheid: z.number().positive('Hoeveel?'),
        reden: AfwijkingReden,
        notitie: z.string().trim().max(300).nullable().default(null),
        sleutel: Sleutel,
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;

    if (d.bron === 'winkel') {
        if (typeof d.id !== 'string') return { error: 'validation' };
        const { data, error } = await s.supabase.rpc('winkel_muteer_voorraad', {
            p_org: s.orgId, p_product_id: d.id, p_type: 'afwijking', p_hoeveelheid: -d.hoeveelheid,
            p_reden: d.reden, p_notitie: d.notitie, p_idempotency_key: d.sleutel,
        });
        if (error) return { error: vertaal(error) };
        await evalueerWinkelMeldingen(s.orgId, [d.id]);
        verversNaAfloop();
        ververs();
        const j = data as { voorraad: number; mutatie: { waarde_cents: number | null } };
        return { data: { voorraad: Number(j.voorraad), waardeCents: j.mutatie.waarde_cents } };
    }

    if (typeof d.id !== 'number') return { error: 'validation' };
    const { data, error } = await s.supabase.rpc('keuken_afwijking', {
        p_org: s.orgId, p_inventory_id: d.id, p_hoeveelheid: d.hoeveelheid, p_reden: d.reden,
        p_notitie: d.notitie, p_idempotency_key: d.sleutel,
    });
    if (error) return { error: vertaal(error) };
    await evalueerKeukenMeldingen(s.orgId, [d.id]);
    ververs();
    revalidatePath('/voorraad');
    const j = data as { voorraad: number; waarde_cents: number | null };
    return { data: { voorraad: Number(j.voorraad), waardeCents: j.waarde_cents } };
}

/* ── Drempel en bestelgegevens ────────────────────────────────────────────── */

/**
 * Bestelgegevens van een winkelproduct (docs/voorraad-bouwplan.md "Winkel
 * bestellen"): minimum, aanvullen tot, besteleenheid (krat van 24, wiel kaas),
 * prijs per besteleenheid, leverancier en EAN. Mathijs vult ze zelf in.
 */
export async function zetBestelgegevens(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        productId: z.string().uuid(),
        /* Leeg = het voorstel (genoeg voor 5 pakketten). */
        drempel: z.number().min(0).nullable().default(null),
        par_niveau: z.number().min(0).nullable().default(null),
        bestel_hoeveelheid: z.number().positive('Een besteleenheid is meer dan 0').nullable().default(null),
        bestel_eenheid_naam: z.string().trim().max(30).nullable().default(null),
        bestel_prijs_cents: z.number().int().min(0).nullable().default(null),
        leverancier_id: z.number().int().positive().nullable().default(null),
        ean: z.string().trim().regex(/^\d{8,14}$/, 'Een EAN is 8 tot 14 cijfers').nullable().default(null),
    }).refine((d) => d.par_niveau == null || d.drempel == null || d.par_niveau > d.drempel, {
        message: '"Aanvullen tot" moet hoger zijn dan het minimum',
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { productId, ...velden } = parsed.data;
    const { error } = await s.supabase.from('winkel_producten').update({ ...velden, bestel_eenheid_naam: velden.bestel_eenheid_naam || null })
        .eq('id', productId).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    await evalueerWinkelMeldingen(s.orgId, [productId]);
    ververs();
    revalidatePath('/inkoop');
    return { data: { ok: true } };
}

/* ── Logboek van één product ──────────────────────────────────────────────── */

export interface LogboekRegel {
    type: string;
    reden: string | null;
    hoeveelheid: number;
    resultaat: number;
    waarde_cents: number | null;
    order_id: number | null;
    notitie: string | null;
    created_at: string;
}

export async function laadLogboek(input: unknown): Promise<ActionResult<LogboekRegel[]>> {
    const parsed = z.object({ plek: z.enum(['winkel', 'makerij']), itemId: z.string().min(1).max(60) }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { data, error } = await s.supabase
        .from('voorraad_logboek')
        .select('type, reden, hoeveelheid, resultaat, waarde_cents, order_id, notitie, created_at')
        .eq('organization_id', s.orgId)
        .eq('plek', parsed.data.plek)
        .eq('item_id', parsed.data.itemId)
        .order('created_at', { ascending: false })
        .limit(100);
    if (error) return { error: error.message };
    return {
        data: (data ?? []).map((r) => ({
            ...r,
            hoeveelheid: Number(r.hoeveelheid),
            resultaat: Number(r.resultaat),
        })) as LogboekRegel[],
    };
}

/* ── De bel (W4) ──────────────────────────────────────────────────────────── */

export interface BelMelding {
    id: string;
    type: string;
    title: string;
    body: string | null;
    link: string | null;
    created_at: string;
    read_at: string | null;
}

const BEL_TYPES = ['voorraad_laag', 'voorraad_op', 'artikel_dicht', 'voorraad_tekort_vooruit', 'kassa_onbekend'];

/** De voorraadmeldingen: de ongelezen eerst, dan de laatste gelezen. */
export async function laadBelMeldingen(): Promise<ActionResult<{ ongelezen: number; meldingen: BelMelding[] }>> {
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const [{ count }, { data, error }] = await Promise.all([
        s.supabase.from('notifications').select('id', { count: 'exact', head: true })
            .eq('organization_id', s.orgId).in('type', BEL_TYPES).is('read_at', null).is('dismissed_at', null),
        s.supabase.from('notifications').select('id, type, title, body, link, created_at, read_at')
            .eq('organization_id', s.orgId).in('type', BEL_TYPES).is('dismissed_at', null)
            .order('read_at', { ascending: false, nullsFirst: true }).order('created_at', { ascending: false }).limit(30),
    ]);
    if (error) return { error: error.message };
    return { data: { ongelezen: count ?? 0, meldingen: (data ?? []) as BelMelding[] } };
}

export async function markeerGelezen(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ ids: z.array(z.string().uuid()).max(100).nullable() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    let q = s.supabase.from('notifications').update({ read_at: new Date().toISOString() })
        .eq('organization_id', s.orgId).in('type', BEL_TYPES).is('read_at', null);
    if (parsed.data.ids) q = q.in('id', parsed.data.ids);
    const { error } = await q;
    if (error) return { error: error.message };
    return { data: { ok: true } };
}
