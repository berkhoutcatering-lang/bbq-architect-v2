/**
 * Server Actions voor de werkruimte Winkel: product toevoegen aan een
 * afdeling (bestaand of nieuw, per stuk of op gewicht), uit het assortiment
 * halen en terugzetten, een levering (partij) binnenmelden, en een stuk naar
 * de keuken of weg.
 *
 * Huisregels (zoals src/app/verkoop/webshop/actions.ts):
 *  - Zod op alle invoer; re-auth binnen de action.
 *  - De organisatie komt uit organization_members en gaat altijd expliciet mee.
 *  - Een prijs is nooit een gok: zonder prijs geen artikel op de Toonbank.
 *  - Voorraad verandert hier nooit rechtstreeks: alleen via de sticker, de
 *    bon en winkel_stuk_afboeken.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { EanSchema, eanFoutMelding } from '@/lib/winkel/toonbankVelden';
import { evalueerWinkelMeldingen } from '@/lib/voorraad/meldingen';

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

const NIET_INGELOGD = { error: 'Je bent niet ingelogd.' };
const eersteFout = (e: z.ZodError) => e.issues[0]?.message ?? 'Controleer de velden';
const uuid = z.string().uuid('Onbekend product of afdeling');
const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Datum als JJJJ-MM-DD');

function ververs() {
    revalidatePath('/winkel');
    revalidatePath('/winkel/leveringen');
    revalidatePath('/voorraad/winkel');
    revalidatePath('/voorraad/winkel/vloer');
}

function slugVan(naam: string): string {
    const basis = naam.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'product';
    return `${basis}-${Math.random().toString(36).slice(2, 6)}`;
}

const PRODUCT_TYPES = ['bier', 'wijn', 'worst', 'amandelen', 'crackers', 'marmelade', 'doos', 'vleeswaar', 'kaas', 'zuur', 'krokant', 'verpakking', 'overig'] as const;

/* ── Op een afdeling zetten (zoals plaatsProduct op de winkelvloer) ──────── */

async function zetOpAfdeling(s: NonNullable<Awaited<ReturnType<typeof ingelogdMetOrg>>>, productId: string, afdelingId: string): Promise<string | null> {
    const { data: plek } = await s.supabase.from('opslag_locaties').select('id').eq('id', afdelingId).eq('organization_id', s.orgId).maybeSingle();
    if (!plek) return 'Deze afdeling bestaat niet (meer).';
    const { data: bestaand } = await s.supabase.from('winkel_plaatsingen').select('id')
        .eq('organization_id', s.orgId).eq('product_id', productId).eq('rol', 'verkoop').limit(1).maybeSingle();
    const { error } = bestaand
        ? await s.supabase.from('winkel_plaatsingen').update({ locatie_id: afdelingId }).eq('id', bestaand.id).eq('organization_id', s.orgId)
        : await s.supabase.from('winkel_plaatsingen').insert({ organization_id: s.orgId, product_id: productId, locatie_id: afdelingId, rol: 'verkoop' });
    return error ? 'Het product kon niet op de afdeling gezet worden.' : null;
}

export async function zetProductOpAfdeling(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ productId: uuid, afdelingId: uuid }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;
    const fout = await zetOpAfdeling(s, parsed.data.productId, parsed.data.afdelingId);
    if (fout) return { error: fout };
    ververs();
    return { data: { ok: true } };
}

/* ── Nieuw product: product + toonbankartikel + vak + plek in één keer ──── */

const NieuwProduct = z.object({
    afdelingId: uuid,
    naam: z.string().trim().min(1, 'Geef het product een naam').max(120),
    type: z.enum(PRODUCT_TYPES).default('overig'),
    verkoop_per: z.enum(['stuk', 'kg']),
    /* Per stuk: de prijs per stuk. Op gewicht: de prijs per kilo. Incl. btw, in centen. */
    prijs_cents: z.number().int().min(1, 'Vul een prijs in').max(99_999, 'Hooguit € 999,99'),
    btw_pct: z.union([z.literal(0), z.literal(9), z.literal(21)]).default(9),
    ean: EanSchema.default(null),
    leverancier_id: z.number().int().positive().nullable().default(null),
    /* Op gewicht. */
    binnen_per_sticker: z.boolean().default(false),
    bewaren: z.string().trim().max(80).nullable().default(null),
    beschermende_atmosfeer: z.boolean().default(false),
    houdbaar_dagen: z.number().int().min(0).max(365).nullable().default(null),
});

export async function nieuwProduct(input: unknown): Promise<ActionResult<{ productId: string; artikelId: string; plu: number | null }>> {
    const parsed = NieuwProduct.safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const v = parsed.data;
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;

    const { data: afd } = await s.supabase.from('opslag_locaties').select('id, naam').eq('id', v.afdelingId).eq('organization_id', s.orgId).maybeSingle();
    if (!afd) return { error: 'Deze afdeling bestaat niet (meer).' };
    const kg = v.verkoop_per === 'kg';

    /* Op gewicht: het eerstvolgende vrije stickernummer. */
    let plu: number | null = null;
    if (kg) {
        const { data: hoog } = await s.supabase.from('winkel_artikelen').select('sticker_plu')
            .eq('organization_id', s.orgId).not('sticker_plu', 'is', null).order('sticker_plu', { ascending: false }).limit(1).maybeSingle();
        plu = Number((hoog as { sticker_plu?: number } | null)?.sticker_plu ?? 0) + 1;
        if (plu > 99_999) return { error: 'Alle stickernummers zijn op.' };
    }

    const { data: product, error: pFout } = await s.supabase.from('winkel_producten').insert({
        organization_id: s.orgId,
        naam: v.naam,
        type: v.type,
        eenheid: kg ? 'gram' : 'stuk',
        prijs_per: kg ? 1000 : 1,
        winkelprijs_incl_cents: v.prijs_cents,
        btw_pct: v.btw_pct,
        ean: kg ? null : v.ean,
        leverancier_id: v.leverancier_id,
        binnen_per_sticker: kg && v.binnen_per_sticker,
        actief: true,
    }).select('id').single();
    if (pFout || !product) {
        const ean = eanFoutMelding(pFout);
        if (ean) return { error: ean };
        if (pFout?.code === '42703' || pFout?.code === 'PGRST204') return { error: 'De database kent producten op gewicht nog niet (migratie 20261103120000).' };
        return { error: pFout?.message ?? 'Het product kon niet aangemaakt worden.' };
    }
    const productId = product.id as string;

    const { data: artikel, error: aFout } = await s.supabase.from('winkel_artikelen').insert({
        organization_id: s.orgId,
        slug: slugVan(v.naam),
        naam: v.naam,
        eenheid: kg ? 'per kg' : 'per stuk',
        prijs_cents: v.prijs_cents,
        btw_pct: v.btw_pct,
        actief: true,
        publiek: false,
        kanalen: ['toonbank'],
        toonbank_groep: String(afd.naam).slice(0, 40),
        verkoop_per: v.verkoop_per,
        kiloprijs_cents: kg ? v.prijs_cents : null,
        sticker_plu: plu,
        etiket: kg ? {
            bewaren: v.bewaren,
            beschermende_atmosfeer: v.beschermende_atmosfeer,
            houdbaar_dagen: v.houdbaar_dagen ?? 0,
            rauwe_melk: false,
        } : null,
    }).select('id').single();
    if (aFout || !artikel) {
        await s.supabase.from('winkel_producten').delete().eq('id', productId).eq('organization_id', s.orgId);
        return { error: aFout?.message ?? 'Het toonbankartikel kon niet aangemaakt worden.' };
    }
    const artikelId = artikel.id as string;

    const { error: sFout } = await s.supabase.from('winkel_artikel_slots').insert({
        organization_id: s.orgId, artikel_id: artikelId, volgorde: 1, slot_type: v.type, naam: v.naam,
        hoeveelheid: 1, eenheid: kg ? 'gram' : 'stuk', per: 'stuk', standaard_product_id: productId,
    });
    if (sFout) {
        await s.supabase.from('winkel_artikelen').delete().eq('id', artikelId).eq('organization_id', s.orgId);
        await s.supabase.from('winkel_producten').delete().eq('id', productId).eq('organization_id', s.orgId);
        return { error: sFout.message };
    }

    const fout = await zetOpAfdeling(s, productId, v.afdelingId);
    if (fout) return { error: fout };
    ververs();
    return { data: { productId, artikelId, plu } };
}

/* ── Uit het assortiment en terug ────────────────────────────────────────── */

/**
 * Uit het assortiment: het product en zijn eigen (één-vaks-)artikelen gaan
 * uit, dus niet meer op de Toonbank en niet meer in de webshop. De plek, de
 * verkoopgeschiedenis en de stuks blijven: terugzetten kan altijd. Een pakket
 * waar het product in zit, blijft zoals het is.
 */
export async function zetInAssortiment(input: unknown): Promise<ActionResult<{ artikelen: number }>> {
    const parsed = z.object({ productId: uuid, actief: z.boolean(), afdelingId: uuid.optional() }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;
    const { productId, actief } = parsed.data;

    const { error } = await s.supabase.from('winkel_producten').update({ actief }).eq('id', productId).eq('organization_id', s.orgId);
    if (error) return { error: 'Het product kon niet bijgewerkt worden.' };

    const { data: slots } = await s.supabase.from('winkel_artikel_slots').select('artikel_id, standaard_product_id').eq('organization_id', s.orgId);
    const per = new Map<string, (string | null)[]>();
    for (const r of (slots ?? []) as { artikel_id: string; standaard_product_id: string | null }[]) {
        per.set(r.artikel_id, [...(per.get(r.artikel_id) ?? []), r.standaard_product_id]);
    }
    const eigen = [...per].filter(([, l]) => l.length === 1 && l[0] === productId).map(([a]) => a);
    if (eigen.length) {
        const { error: e } = await s.supabase.from('winkel_artikelen').update({ actief }).in('id', eigen).eq('organization_id', s.orgId);
        if (e) return { error: 'Het artikel op de Toonbank kon niet bijgewerkt worden.' };
    }
    await evalueerWinkelMeldingen(s.orgId, [productId]);
    ververs();
    return { data: { artikelen: eigen.length } };
}

/* ── Een levering binnenmelden (het A4 van de slager) ────────────────────── */

const LeveringRegel = z.object({
    productId: uuid,
    productiedatum: datum.nullable().default(null),
    tht: datum,
});

export async function meldLeveringBinnen(input: unknown): Promise<ActionResult<{ partijen: number }>> {
    const parsed = z.object({
        leverancier_id: z.number().int().positive().nullable().default(null),
        geleverd_op: datum,
        bron: z.enum(['a4', 'handmatig']).default('a4'),
        regels: z.array(LeveringRegel).min(1, 'Kies minstens één product').max(80),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const v = parsed.data;
    for (const r of v.regels) {
        if (r.productiedatum && r.tht < r.productiedatum) return { error: 'Een THT ligt vóór de productiedatum.' };
    }
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;
    const { error } = await s.supabase.from('winkel_partijen').insert(v.regels.map((r) => ({
        organization_id: s.orgId,
        winkel_product_id: r.productId,
        leverancier_id: v.leverancier_id,
        geleverd_op: v.geleverd_op,
        productiedatum: r.productiedatum,
        tht: r.tht,
        bron: v.bron,
        created_by: s.user.id,
    })));
    if (error) {
        if (error.code === '42P01' || error.code === 'PGRST205') return { error: 'De database kent leveringen nog niet (migratie 20261103120000).' };
        return { error: error.message };
    }
    ververs();
    return { data: { partijen: v.regels.length } };
}

export async function sluitPartij(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: uuid }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;
    const { error } = await s.supabase.from('winkel_partijen').update({ afgesloten_at: new Date().toISOString() })
        .eq('id', parsed.data.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    ververs();
    return { data: { ok: true } };
}

/* ── Een stuk naar de keuken of weg ──────────────────────────────────────── */

export async function boekStukAf(input: unknown): Promise<ActionResult<{ status: string; bestond: boolean }>> {
    const parsed = z.object({
        stukIds: z.array(uuid).min(1).max(100),
        wat: z.enum(['afgeschreven', 'naar_keuken']),
        notitie: z.string().trim().max(200).nullable().default(null),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return NIET_INGELOGD;
    let bestond = true;
    for (const id of parsed.data.stukIds) {
        const { data, error } = await s.supabase.rpc('winkel_stuk_afboeken', { p_org: s.orgId, p_stuk_id: id, p_wat: parsed.data.wat, p_notitie: parsed.data.notitie });
        if (error) return { error: error.code === 'P0002' ? 'Dit stuk bestaat niet (meer).' : error.message };
        if (!(data as { bestond?: boolean } | null)?.bestond) bestond = false;
    }
    /* De voorraad en de THT-meldingen veranderen mee (een melding verdwijnt als de stuks weg zijn). */
    await evalueerWinkelMeldingen(s.orgId);
    ververs();
    return { data: { status: parsed.data.wat, bestond } };
}
