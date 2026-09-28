/**
 * Server Actions voor voorraad toevoegen (W2b) — elke manier komt uit op een
 * concept (voorraad_invoer) en één controlescherm. Plan: docs/voorraad-bouwplan.md W2b.
 *
 * Huisregels: Zod op alle invoer, re-auth binnen de action, org uit
 * organization_members. Niets gaat de voorraad in vóór "Klopt, boeken"
 * (voorraad_invoer_boeken, één transactie). Een voorstel is een voorstel:
 * het staat zichtbaar in het scherm en Mathijs bevestigt.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { voorraadFout } from '@/lib/winkel/voorraad';
import { evalueerKeukenMeldingen, evalueerWinkelMeldingen } from '@/lib/voorraad/meldingen';
import { stelVoor, type BronRegel, type Koppeling, type Plek } from '@/lib/voorraad/invoer';

type ActionResult<T = unknown> = { data: T } | { error: string };

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
type Sessie = NonNullable<Awaited<ReturnType<typeof ingelogdMetOrg>>>;

function eersteFout(e: z.ZodError): string {
    return e.issues[0]?.message ?? 'Controleer de velden';
}

function ververs(id?: string) {
    revalidatePath('/voorraad/ontvangst');
    if (id) revalidatePath(`/voorraad/ontvangst/${id}`);
}

/** Wat het voorstel nodig heeft: koppelingen en de kandidaten van beide plekken. */
async function voorstelBronnen(s: Sessie) {
    const [{ data: koppelingen }, { data: winkel }, { data: keuken }] = await Promise.all([
        s.supabase.from('voorraad_invoer_koppelingen').select('sleutel, plek, winkel_product_id, inventory_id, omrekening').eq('organization_id', s.orgId),
        s.supabase.from('winkel_producten').select('id, naam, eenheid, ean').eq('organization_id', s.orgId).eq('actief', true),
        s.supabase.from('inventory').select('id, naam, unit').eq('organization_id', s.orgId).limit(3000),
    ]);
    return {
        koppelingen: (koppelingen ?? []).map((k) => ({ ...k, omrekening: Number(k.omrekening) })) as Koppeling[],
        winkel: (winkel ?? []).map((w) => ({ id: w.id as string, naam: w.naam as string, eenheid: w.eenheid as 'stuk' | 'gram', ean: (w.ean as string | null) ?? null })),
        keuken: (keuken ?? []).map((k) => ({ id: Number(k.id), naam: k.naam as string, unit: (k.unit as string | null) ?? null })),
    };
}

async function voegRegelsToe(s: Sessie, invoerId: string, leverancierId: number | null, regels: (BronRegel & { inkoop_order_line_id?: string | null; vast?: { plek: Plek; inventory_id: number | null; winkel_product_id: string | null; aantal: number | null } })[], voorkeurPlek?: Plek) {
    if (!regels.length) return null;
    const bronnen = await voorstelBronnen(s);
    const rijen = regels.map((r, i) => {
        const v = r.vast
            ? { plek: r.vast.plek, winkel_product_id: r.vast.winkel_product_id, inventory_id: r.vast.inventory_id, omrekening: 1, aantal: r.vast.aantal, voorstel: 'inkooporder' as const }
            : stelVoor(r, { leverancierId, ...bronnen, voorkeurPlek });
        return {
            organization_id: s.orgId, invoer_id: invoerId, volgorde: i + 1,
            bron_naam: r.naam, bron_aantal: r.aantal, bron_eenheid: r.eenheid, bron_prijs_cents: r.prijs_cents, btw_pct: r.btw_pct, ean: r.ean ?? null,
            plek: v.plek, winkel_product_id: v.winkel_product_id, inventory_id: v.inventory_id, omrekening: v.omrekening, aantal: v.aantal,
            voorstel: v.voorstel, inkoop_order_line_id: r.inkoop_order_line_id ?? null,
        };
    });
    const { error } = await s.supabase.from('voorraad_invoer_regels').insert(rijen);
    return error?.message ?? null;
}

/* ── Nieuwe ontvangst ─────────────────────────────────────────────────────── */

const BTW = z.number().int().refine((n) => [0, 9, 21].includes(n)).nullable().default(null);

/** Handmatig: een leeg concept (of met één regel), leverancier optioneel. */
export async function nieuweOntvangst(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = z.object({
        leverancier_id: z.number().int().positive().nullable().default(null),
        plek: z.enum(['winkel', 'makerij']).nullable().default(null),
        bron: z.enum(['handmatig', 'barcode']).default('handmatig'),
    }).safeParse(input ?? {});
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { data, error } = await s.supabase.from('voorraad_invoer').insert({
        organization_id: s.orgId, bron: parsed.data.bron, leverancier_id: parsed.data.leverancier_id,
        datum: new Date().toISOString().slice(0, 10), door_user_id: s.user.id,
        notitie: parsed.data.plek ? `plek:${parsed.data.plek}` : null,
    }).select('id').single();
    if (error) return { error: error.message };
    ververs();
    return { data: { id: data.id as string } };
}

/** Van een uitgelezen factuur, bon, pdf of e-factuur (de bonnen-straat). */
export async function ontvangstVanBon(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = z.object({
        bron: z.enum(['foto', 'pdf', 'ubl']),
        bon_id: z.number().int().positive().nullable().default(null),
        image_hash: z.string().max(64).nullable().default(null),
        leverancier_id: z.number().int().positive().nullable().default(null),
        leverancier_naam: z.string().trim().max(160).nullable().default(null),
        factuurnummer: z.string().trim().max(80).nullable().default(null),
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
        totaal_eur: z.number().min(0).nullable().default(null),
        items: z.array(z.object({
            naam: z.string().trim().min(1).max(200),
            aantal: z.number().nullable().default(null),
            unit: z.string().trim().max(40).nullable().default(null),
            prijs: z.number().nullable().default(null),
            btw_pct: z.number().nullable().default(null),
        })).max(200),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;

    const { data: kop, error } = await s.supabase.from('voorraad_invoer').insert({
        organization_id: s.orgId, bron: d.bron, bon_id: d.bon_id, image_hash: d.image_hash,
        leverancier_id: d.leverancier_id, leverancier_naam: d.leverancier_naam, factuurnummer: d.factuurnummer,
        datum: d.datum, totaal_cents: d.totaal_eur == null ? null : Math.round(d.totaal_eur * 100), door_user_id: s.user.id,
        /* Een foto is meestal een kassabon (incl. btw), een pdf/e-factuur meestal excl. Zichtbaar en om te zetten. */
        prijzen_incl_btw: d.bron === 'foto',
    }).select('id').single();
    if (error) return { error: error.message };

    const fout = await voegRegelsToe(s, kop.id as string, d.leverancier_id, d.items.map((i) => ({
        naam: i.naam, aantal: i.aantal, eenheid: i.unit, prijs_cents: i.prijs == null ? null : Math.round(i.prijs * 100),
        btw_pct: i.btw_pct != null && [0, 9, 21].includes(i.btw_pct) ? i.btw_pct : null,
    })));
    if (fout) return { error: fout };
    ververs();
    return { data: { id: kop.id as string } };
}

/** Van een verstuurde inkooporder: elke regel met het bestelde aantal, naar de makerij. */
export async function ontvangstVanInkooporder(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = z.object({ orderId: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { data: bestaand } = await s.supabase.from('voorraad_invoer').select('id').eq('organization_id', s.orgId)
        .eq('inkoop_order_id', parsed.data.orderId).eq('status', 'concept').maybeSingle();
    if (bestaand) return { data: { id: bestaand.id as string } };

    const { data: order } = await s.supabase.from('concept_inkoop_orders').select('id, leverancier_id, status, leveranciers(naam)')
        .eq('id', parsed.data.orderId).eq('organization_id', s.orgId).maybeSingle();
    if (!order) return { error: 'Inkooporder niet gevonden' };
    const { data: lijnen } = await s.supabase.from('inkoop_order_lines')
        .select('id, naam, inventory_id, qty_ordered, qty_received, unit, unit_price_eur, btw_pct')
        .eq('concept_order_id', parsed.data.orderId);

    const { data: kop, error } = await s.supabase.from('voorraad_invoer').insert({
        organization_id: s.orgId, bron: 'inkooporder', inkoop_order_id: order.id, leverancier_id: order.leverancier_id,
        leverancier_naam: (order.leveranciers as unknown as { naam: string } | null)?.naam ?? null,
        datum: new Date().toISOString().slice(0, 10), door_user_id: s.user.id,
    }).select('id').single();
    if (error) return { error: error.message };

    const regels = (lijnen ?? []).map((l) => {
        const open = Math.max(0, Number(l.qty_ordered ?? 0) - Number(l.qty_received ?? 0));
        return {
            naam: (l.naam as string | null) ?? 'Onbekend product',
            aantal: open, eenheid: (l.unit as string | null) ?? null,
            prijs_cents: l.unit_price_eur == null ? null : Math.round(Number(l.unit_price_eur) * 100),
            btw_pct: l.btw_pct != null && [0, 9, 21].includes(Number(l.btw_pct)) ? Number(l.btw_pct) : null,
            inkoop_order_line_id: l.id as string,
            vast: { plek: 'makerij' as const, inventory_id: l.inventory_id == null ? null : Number(l.inventory_id), winkel_product_id: null, aantal: open },
        };
    }).filter((r) => r.aantal > 0);
    const fout = await voegRegelsToe(s, kop.id as string, order.leverancier_id as number | null, regels);
    if (fout) return { error: fout };
    ververs();
    return { data: { id: kop.id as string } };
}

/* ── Het controlescherm ───────────────────────────────────────────────────── */

export async function werkKopBij(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        id: z.string().uuid(),
        leverancier_id: z.number().int().positive().nullable().optional(),
        leverancier_naam: z.string().trim().max(160).nullable().optional(),
        factuurnummer: z.string().trim().max(80).nullable().optional(),
        datum: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        prijzen_incl_btw: z.boolean().optional(),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { id, ...velden } = parsed.data;
    const { error } = await s.supabase.from('voorraad_invoer').update(velden).eq('id', id).eq('organization_id', s.orgId);
    if (error) return { error: voorraadFout(error.code, error.message) };
    ververs(id);
    return { data: { ok: true } };
}

const RegelVelden = z.object({
    bron_naam: z.string().trim().min(1, 'Geef de regel een naam').max(200),
    bron_aantal: z.number().min(0).nullable(),
    bron_eenheid: z.string().trim().max(40).nullable(),
    bron_prijs_cents: z.number().int().min(0).nullable(),
    btw_pct: BTW,
    plek: z.enum(['winkel', 'makerij']).nullable(),
    winkel_product_id: z.string().uuid().nullable(),
    inventory_id: z.number().int().positive().nullable(),
    omrekening: z.number().positive().nullable(),
    aantal: z.number().min(0).nullable(),
    tht: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
    overslaan: z.boolean(),
}).partial();

export async function werkRegelBij(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = RegelVelden.extend({ id: z.string().uuid(), invoerId: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { id, invoerId, ...velden } = parsed.data;
    /* Een ander product of een andere plek: dan geldt het oude voorstel niet meer. */
    const extra = 'winkel_product_id' in velden || 'inventory_id' in velden || 'plek' in velden ? { voorstel: null } : {};
    const { error } = await s.supabase.from('voorraad_invoer_regels').update({ ...velden, ...extra })
        .eq('id', id).eq('invoer_id', invoerId).eq('organization_id', s.orgId);
    if (error) return { error: voorraadFout(error.code, error.message) };
    ververs(invoerId);
    return { data: { ok: true } };
}

export async function voegRegelToe(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        invoerId: z.string().uuid(),
        naam: z.string().trim().min(1, 'Wat is er binnengekomen?').max(200),
        aantal: z.number().min(0).nullable().default(null),
        eenheid: z.string().trim().max(40).nullable().default(null),
        prijs_cents: z.number().int().min(0).nullable().default(null),
        btw_pct: BTW,
        ean: z.string().trim().regex(/^\d{8,14}$/).nullable().default(null),
        plek: z.enum(['winkel', 'makerij']).nullable().default(null),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;
    const { data: kop } = await s.supabase.from('voorraad_invoer').select('leverancier_id').eq('id', d.invoerId).eq('organization_id', s.orgId).maybeSingle();
    if (!kop) return { error: 'Ontvangst niet gevonden' };
    const { count } = await s.supabase.from('voorraad_invoer_regels').select('id', { count: 'exact', head: true }).eq('invoer_id', d.invoerId);
    const bronnen = await voorstelBronnen(s);
    const v = stelVoor({ naam: d.naam, aantal: d.aantal, eenheid: d.eenheid, prijs_cents: d.prijs_cents, btw_pct: d.btw_pct, ean: d.ean },
        { leverancierId: (kop.leverancier_id as number | null) ?? null, ...bronnen, voorkeurPlek: d.plek ?? undefined });
    const { error } = await s.supabase.from('voorraad_invoer_regels').insert({
        organization_id: s.orgId, invoer_id: d.invoerId, volgorde: (count ?? 0) + 1,
        bron_naam: d.naam, bron_aantal: d.aantal, bron_eenheid: d.eenheid, bron_prijs_cents: d.prijs_cents, btw_pct: d.btw_pct, ean: d.ean,
        plek: v.plek ?? d.plek, winkel_product_id: v.winkel_product_id, inventory_id: v.inventory_id, omrekening: v.omrekening,
        aantal: v.aantal ?? (v.plek || d.plek ? d.aantal : null), voorstel: v.voorstel,
    });
    if (error) return { error: voorraadFout(error.code, error.message) };
    ververs(d.invoerId);
    return { data: { ok: true } };
}

export async function verwijderRegel(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid(), invoerId: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('voorraad_invoer_regels').delete().eq('id', parsed.data.id).eq('invoer_id', parsed.data.invoerId).eq('organization_id', s.orgId);
    if (error) return { error: voorraadFout(error.code, error.message) };
    ververs(parsed.data.invoerId);
    return { data: { ok: true } };
}

/**
 * Barcode gescand. Bekend (eerder bevestigd, of de EAN van een winkelproduct):
 * die regel +1 (of een nieuwe regel met 1). Onbekend: een regel met de EAN en
 * zonder product — in het controlescherm kies je of maak je het product.
 */
export async function scanEan(input: unknown): Promise<ActionResult<{ bekend: boolean; naam: string }>> {
    const parsed = z.object({ invoerId: z.string().uuid(), ean: z.string().trim().regex(/^\d{8,14}$/, 'Dat is geen EAN (8–14 cijfers)') }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { invoerId, ean } = parsed.data;

    const { data: al } = await s.supabase.from('voorraad_invoer_regels').select('id, bron_aantal, aantal, omrekening, bron_naam, winkel_product_id, inventory_id')
        .eq('invoer_id', invoerId).eq('ean', ean).eq('organization_id', s.orgId).limit(1).maybeSingle();
    if (al) {
        const bron = Number(al.bron_aantal ?? 0) + 1;
        const om = al.omrekening == null ? null : Number(al.omrekening);
        const { error } = await s.supabase.from('voorraad_invoer_regels').update({ bron_aantal: bron, aantal: om == null ? al.aantal : Math.round(bron * om * 1000) / 1000 })
            .eq('id', al.id).eq('organization_id', s.orgId);
        if (error) return { error: voorraadFout(error.code, error.message) };
        ververs(invoerId);
        return { data: { bekend: !!(al.winkel_product_id || al.inventory_id), naam: al.bron_naam as string } };
    }

    /* Een naam voor de regel: het winkelproduct, anders de leveranciers-catalogus, anders de code zelf. */
    const [{ data: w }, { data: sp }] = await Promise.all([
        s.supabase.from('winkel_producten').select('naam').eq('organization_id', s.orgId).eq('ean', ean).limit(1).maybeSingle(),
        s.supabase.from('supplier_products').select('name').or(`ean.eq.${ean},gtin.eq.${ean}`).limit(1).maybeSingle(),
    ]);
    const naam = (w?.naam as string | undefined) ?? (sp?.name as string | undefined) ?? `Barcode ${ean}`;
    const r = await voegRegelToe({ invoerId, naam, aantal: 1, eenheid: 'stuk', ean, plek: 'winkel' });
    if ('error' in r) return r;
    return { data: { bekend: !!w, naam } };
}

/** Onbekend product ter plekke aanmaken en aan de regel hangen. Voorraad start leeg (via het logboek). */
export async function maakProductVoorRegel(input: unknown): Promise<ActionResult<{ id: string | number }>> {
    const parsed = z.object({
        invoerId: z.string().uuid(),
        regelId: z.string().uuid(),
        plek: z.enum(['winkel', 'makerij']),
        naam: z.string().trim().min(1, 'Geef het product een naam').max(120),
        /* winkel */
        type: z.enum(['bier', 'wijn', 'worst', 'amandelen', 'crackers', 'marmelade', 'doos', 'vleeswaar', 'kaas', 'zuur', 'krokant', 'verpakking', 'overig']).default('overig'),
        eenheid: z.enum(['stuk', 'gram']).default('stuk'),
        btw_pct: z.union([z.literal(0), z.literal(9), z.literal(21)]).default(9),
        ean: z.string().trim().regex(/^\d{8,14}$/).nullable().default(null),
        /* makerij */
        unit: z.string().trim().max(20).default('stuks'),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;
    if (d.plek === 'winkel') {
        const { data, error } = await s.supabase.from('winkel_producten').insert({
            organization_id: s.orgId, naam: d.naam, type: d.type, eenheid: d.eenheid, prijs_per: d.eenheid === 'gram' ? 100 : 1,
            btw_pct: d.btw_pct, alcohol: d.type === 'bier' || d.type === 'wijn', ean: d.ean, actief: true,
        }).select('id').single();
        if (error) return { error: error.message };
        const r = await werkRegelBij({ id: d.regelId, invoerId: d.invoerId, plek: 'winkel', winkel_product_id: data.id, inventory_id: null });
        if ('error' in r) return r;
        return { data: { id: data.id as string } };
    }
    const { data, error } = await s.supabase.from('inventory').insert({
        organization_id: s.orgId, naam: d.naam, unit: d.unit, current_stock: 0, categorie: 'Overig',
    }).select('id').single();
    if (error) return { error: error.message.includes('ux_inventory_naam_org') ? 'Er bestaat al een keukenproduct met die naam; kies dat.' : error.message };
    const r = await werkRegelBij({ id: d.regelId, invoerId: d.invoerId, plek: 'makerij', inventory_id: Number(data.id), winkel_product_id: null });
    if ('error' in r) return r;
    return { data: { id: Number(data.id) } };
}

/* ── Boeken of weggooien ──────────────────────────────────────────────────── */

export async function boekOntvangst(input: unknown): Promise<ActionResult<{ winkel: number; makerij: number }>> {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { data, error } = await s.supabase.rpc('voorraad_invoer_boeken', { p_org: s.orgId, p_invoer_id: parsed.data.id });
    if (error) return { error: voorraadFout(error.code, error.message) };

    /* Inkooporder: de ontvangen aantallen ook op de orderregels, zodat /inkoop hem als binnen ziet. */
    const { data: regels } = await s.supabase.from('voorraad_invoer_regels')
        .select('inkoop_order_line_id, winkel_product_id, inventory_id, aantal, overslaan, plek').eq('invoer_id', parsed.data.id);
    const { data: kop } = await s.supabase.from('voorraad_invoer').select('inkoop_order_id').eq('id', parsed.data.id).maybeSingle();
    if (kop?.inkoop_order_id) {
        for (const r of regels ?? []) {
            if (!r.inkoop_order_line_id || r.overslaan) continue;
            const { data: l } = await s.supabase.from('inkoop_order_lines').select('qty_received').eq('id', r.inkoop_order_line_id).maybeSingle();
            await s.supabase.from('inkoop_order_lines').update({ qty_received: Number(l?.qty_received ?? 0) + Number(r.aantal ?? 0) }).eq('id', r.inkoop_order_line_id);
        }
        const { data: open } = await s.supabase.from('inkoop_order_lines').select('qty_ordered, qty_received').eq('concept_order_id', kop.inkoop_order_id);
        if ((open ?? []).every((l) => Number(l.qty_received ?? 0) >= Number(l.qty_ordered ?? 0))) {
            await s.supabase.from('concept_inkoop_orders').update({ status: 'received' }).eq('id', kop.inkoop_order_id).eq('organization_id', s.orgId);
        }
    }

    const winkelIds = [...new Set((regels ?? []).filter((r) => !r.overslaan && r.plek === 'winkel' && r.winkel_product_id).map((r) => r.winkel_product_id as string))];
    const keukenIds = [...new Set((regels ?? []).filter((r) => !r.overslaan && r.plek === 'makerij' && r.inventory_id).map((r) => Number(r.inventory_id)))];
    if (winkelIds.length) await evalueerWinkelMeldingen(s.orgId, winkelIds);
    if (keukenIds.length) await evalueerKeukenMeldingen(s.orgId, keukenIds);
    ververs(parsed.data.id);
    revalidatePath('/voorraad');
    revalidatePath('/voorraad/winkel');
    revalidatePath('/inkoop');
    return { data: data as { winkel: number; makerij: number } };
}

export async function verwerpOntvangst(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('voorraad_invoer').update({ status: 'verworpen' }).eq('id', parsed.data.id).eq('organization_id', s.orgId).eq('status', 'concept');
    if (error) return { error: voorraadFout(error.code, error.message) };
    ververs(parsed.data.id);
    return { data: { ok: true } };
}
