/**
 * Server Actions voor de winkelvloer — plekken aanmaken en hernoemen,
 * producten op een plek zetten, verplaatsen en weghalen.
 * Regels: src/lib/winkel/plekken.ts · migratie 20261102120000_winkel_plekken.
 *
 * Huisregels (zie ../actions.ts): Zod op alle invoer, re-auth binnen de
 * action, org uit organization_members en altijd expliciet meegestuurd.
 * Een plaatsing is presentatie, geen voorraad: hier verandert geen getal.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { PLEK_SOORTEN, WINKEL_RUIMTE, codeVoor, planWinkelPlekken, type LivePlek } from '@/lib/winkel/plekken';

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
    return { supabase, orgId: data.organization_id as string };
}

const ververs = () => revalidatePath('/voorraad/winkel/vloer');
const NIET_INGELOGD = { error: 'Je bent niet ingelogd.' };
const eersteFout = (e: z.ZodError) => e.issues[0]?.message ?? 'Controleer de velden';
const id = z.string().uuid('Onbekende plek of product');

/** De Winkel en de vaste afdelingen, voor zover ze er nog niet zijn. Twee keer = één keer. */
export async function richtWinkelIn(): Promise<ActionResult<{ aangemaakt: number }>> {
    const ctx = await ingelogdMetOrg();
    if (!ctx) return NIET_INGELOGD;
    const { supabase, orgId } = ctx;
    const { data, error } = await supabase.from('opslag_locaties').select('id, code, naam, soort, parent_id, volgorde').eq('organization_id', orgId);
    if (error) return { error: 'De plekken konden niet geladen worden.' };
    const live = (data ?? []) as LivePlek[];
    const plan = planWinkelPlekken(live);
    const idOp = new Map(live.map((p) => [p.code, p.id]));
    for (const p of plan.nieuw) {
        const parent_id = p.ouderCode ? idOp.get(p.ouderCode) ?? null : null;
        const { data: rij, error: e } = await supabase.from('opslag_locaties')
            .insert({ organization_id: orgId, code: p.code, naam: p.naam, soort: p.soort, parent_id, volgorde: p.volgorde })
            .select('id').single();
        if (e || !rij) return { error: `${p.naam} kon niet aangemaakt worden.` };
        idOp.set(p.code, rij.id as string);
    }
    ververs();
    return { data: { aangemaakt: plan.nieuw.length } };
}

const NieuwePlekSchema = z.object({
    naam: z.string().trim().min(1, 'Geef de plek een naam').max(60, 'Hooguit 60 tekens'),
    soort: z.enum(PLEK_SOORTEN).refine((s) => s !== 'ruimte', 'Een ruimte maak je hier niet aan'),
    ouderId: id,
});

export async function maakPlek(invoer: z.input<typeof NieuwePlekSchema>): Promise<ActionResult<{ id: string }>> {
    const v = NieuwePlekSchema.safeParse(invoer);
    if (v.success === false) return { error: eersteFout(v.error) };
    const ctx = await ingelogdMetOrg();
    if (!ctx) return NIET_INGELOGD;
    const { supabase, orgId } = ctx;

    const { data: alle, error } = await supabase.from('opslag_locaties').select('id, code, parent_id, volgorde').eq('organization_id', orgId);
    if (error) return { error: 'De plekken konden niet geladen worden.' };
    const ouder = (alle ?? []).find((p) => p.id === v.data.ouderId);
    if (!ouder) return { error: 'De bovenliggende plek bestaat niet (meer).' };
    const code = codeVoor(v.data.naam, (ouder.code as string) || WINKEL_RUIMTE.code, new Set((alle ?? []).map((p) => p.code as string)));
    const volgorde = (alle ?? []).filter((p) => p.parent_id === ouder.id).reduce((m, p) => Math.max(m, p.volgorde as number), 0) + 1;

    const { data, error: e } = await supabase.from('opslag_locaties')
        .insert({ organization_id: orgId, code, naam: v.data.naam, soort: v.data.soort, parent_id: ouder.id, volgorde })
        .select('id').single();
    if (e || !data) return { error: 'De plek kon niet aangemaakt worden.' };
    ververs();
    return { data: { id: data.id as string } };
}

const HernoemSchema = z.object({ id, naam: z.string().trim().min(1, 'Geef de plek een naam').max(60, 'Hooguit 60 tekens') });

export async function hernoemPlek(invoer: z.input<typeof HernoemSchema>): Promise<ActionResult> {
    const v = HernoemSchema.safeParse(invoer);
    if (v.success === false) return { error: eersteFout(v.error) };
    const ctx = await ingelogdMetOrg();
    if (!ctx) return NIET_INGELOGD;
    const { error } = await ctx.supabase.from('opslag_locaties').update({ naam: v.data.naam }).eq('id', v.data.id).eq('organization_id', ctx.orgId);
    if (error) return { error: 'De naam kon niet bewaard worden.' };
    ververs();
    return { data: null };
}

const PlaatsSchema = z.object({ productId: id, locatieId: id });

/**
 * Zet een product op een plek om te verkopen. Stond het al ergens anders te
 * koop, dan verhuist het (één verkoopplek per product); showmodel en reserve
 * blijven staan.
 */
export async function plaatsProduct(invoer: z.input<typeof PlaatsSchema>): Promise<ActionResult<{ verplaatst: boolean }>> {
    const v = PlaatsSchema.safeParse(invoer);
    if (v.success === false) return { error: eersteFout(v.error) };
    const ctx = await ingelogdMetOrg();
    if (!ctx) return NIET_INGELOGD;
    const { supabase, orgId } = ctx;

    const [{ data: er }, { data: daar }] = await Promise.all([
        supabase.from('winkel_plaatsingen').select('id, locatie_id').eq('organization_id', orgId).eq('product_id', v.data.productId).eq('rol', 'verkoop'),
        supabase.from('winkel_plaatsingen').select('volgorde').eq('organization_id', orgId).eq('locatie_id', v.data.locatieId).order('volgorde', { ascending: false }).limit(1),
    ]);
    if ((er ?? []).some((p) => p.locatie_id === v.data.locatieId)) return { data: { verplaatst: false } };
    const volgorde = ((daar?.[0]?.volgorde as number | undefined) ?? 0) + 1;

    if (er && er.length) {
        const { error } = await supabase.from('winkel_plaatsingen').update({ locatie_id: v.data.locatieId, volgorde })
            .eq('id', er[0].id as string).eq('organization_id', orgId);
        if (error) return { error: 'Het product kon niet verplaatst worden.' };
        if (er.length > 1) {
            await supabase.from('winkel_plaatsingen').delete().in('id', er.slice(1).map((p) => p.id as string)).eq('organization_id', orgId);
        }
        ververs();
        return { data: { verplaatst: true } };
    }
    const { error } = await supabase.from('winkel_plaatsingen')
        .insert({ organization_id: orgId, product_id: v.data.productId, locatie_id: v.data.locatieId, rol: 'verkoop', volgorde });
    if (error) return { error: 'Het product kon niet op deze plek gezet worden.' };
    ververs();
    return { data: { verplaatst: false } };
}

export async function haalVanPlek(invoer: { plaatsingId: string }): Promise<ActionResult> {
    const v = z.object({ plaatsingId: id }).safeParse(invoer);
    if (v.success === false) return { error: eersteFout(v.error) };
    const ctx = await ingelogdMetOrg();
    if (!ctx) return NIET_INGELOGD;
    const { error } = await ctx.supabase.from('winkel_plaatsingen').delete().eq('id', v.data.plaatsingId).eq('organization_id', ctx.orgId);
    if (error) return { error: 'Het product kon niet van de plek gehaald worden.' };
    ververs();
    return { data: null };
}
