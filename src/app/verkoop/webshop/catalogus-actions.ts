/**
 * Server Actions voor de productpagina's (blokken C5, C7, C8 — 3 oktober 2026).
 * Plan: docs/OPDRACHT-BBQ-ARCHITECT-CATALOGUS.md.
 *
 * Eén product = één rij in winkel_producten; de losse verkoop is het artikel
 * met dezelfde slug en één slot naar het product. Deze acties houden die drie
 * gelijk. Huisregels zoals in actions.ts: Zod, re-auth binnen de action, de
 * organisatie uit organization_members, nooit iets verzinnen.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase } from '@/lib/supabase-server';
import { maakVoorbeeldToken, seinWebsite, type SeinUitkomst } from '@/lib/winkel/catalogus';
import {
    KENMERKEN,
    PAGINASOORTEN,
    fotoOpslagSchema,
    legeKenmerken,
    maakSlug,
    ontbreektVoorSite,
    soortVanType,
    typeVan,
    type ProductRij,
} from '@/lib/winkel/productsoorten';
import { controleerTekst, siteUrl, type TekstcontroleUitkomst } from '@/lib/winkel/tekstcontrole';
import { eanFoutMelding } from '@/lib/winkel/toonbankVelden';

type ActionResult<T = unknown> = { data: T } | { error: string };

const PAD = '/verkoop/webshop';
const ALCOHOLVRIJ_TOT = 0.5;

async function ingelogdMetOrg() {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data } = await supabase.from('organization_members').select('organization_id').eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!data?.organization_id) return null;
    return { supabase, user, orgId: data.organization_id as string };
}
type Sessie = NonNullable<Awaited<ReturnType<typeof ingelogdMetOrg>>>;

const PRODUCT_KOLOMMEN = 'id, naam, type, slug, kenmerken, alcohol, alcohol_pct, allergenen, ingredienten, bewaren, lekker_bij, foto, pagina_status, pagina_volgorde, goedgekeurd, actief, updated_at';

async function laadProduct(s: Sessie, id: string): Promise<ProductRij | null> {
    const { data } = await s.supabase.from('winkel_producten').select(PRODUCT_KOLOMMEN).eq('id', id).eq('organization_id', s.orgId).maybeSingle();
    return (data as ProductRij | null) ?? null;
}

/** Een vrije slug: de gewenste, of met -2, -3 … als hij al bij een product of artikel hoort. */
async function vrijeSlug(s: Sessie, gewenst: string, behalve?: string): Promise<string> {
    const basis = gewenst || 'product';
    const [{ data: p }, { data: a }] = await Promise.all([
        s.supabase.from('winkel_producten').select('id, slug').eq('organization_id', s.orgId).like('slug', `${basis}%`),
        s.supabase.from('winkel_artikelen').select('slug').eq('organization_id', s.orgId).like('slug', `${basis}%`),
    ]);
    const bezet = new Set([...(p ?? []).filter((r) => r.id !== behalve).map((r) => r.slug as string), ...(a ?? []).map((r) => r.slug as string)]);
    if (behalve) {
        /* Het eigen artikel telt niet als bezet. */
        const eigen = (p ?? []).find((r) => r.id === behalve)?.slug as string | undefined;
        if (eigen) bezet.delete(eigen);
    }
    if (!bezet.has(basis)) return basis;
    for (let i = 2; i < 100; i++) if (!bezet.has(`${basis}-${i}`)) return `${basis}-${i}`;
    return `${basis}-${Date.now()}`;
}

function teksten(r: { naam: string; lekker_bij: string | null; kenmerken: Record<string, unknown> }): Record<string, string> {
    const uit: Record<string, string> = { naam: r.naam };
    if (r.lekker_bij) uit.lekker_bij = r.lekker_bij;
    for (const [k, v] of Object.entries(r.kenmerken)) {
        if (typeof v === 'string' && v.trim()) uit[`kenmerken.${k}`] = v;
        if (k === 'proefkaart' && v && typeof v === 'object') {
            for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) if (typeof pv === 'string') uit[`proefkaart.${pk}`] = pv;
        }
    }
    return uit;
}

/** Staat het product op de site, dan bouwt de site opnieuw (± 2 minuten). */
async function seinAlsLive(status: string): Promise<SeinUitkomst | null> {
    return status === 'live' ? seinWebsite() : null;
}

/* ═══ C7 · Nieuw product op de site ══════════════════════════════════════════ */

export async function nieuwPaginaProduct(input: unknown): Promise<ActionResult<{ id: string; slug: string }>> {
    const parsed = z.object({
        soort: z.enum(PAGINASOORTEN),
        naam: z.string().trim().min(1, 'Geef het product een naam').max(120),
        maker: z.string().trim().max(120).nullable().default(null),
        vleessoort: z.enum(['vers', 'droge-worst']).default('droge-worst'),
        ean: z.string().regex(/^\d{8,14}$/, 'Een streepjescode is 8 tot 14 cijfers').nullable().default(null),
    }).safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { soort, naam, maker, vleessoort, ean } = parsed.data;

    const kenmerken = legeKenmerken(soort);
    if (soort === 'bier' && maker) kenmerken.brouwerij = maker;
    if (soort === 'wijn' && maker) kenmerken.producent = maker;
    if (soort === 'vlees') kenmerken.soort = vleessoort;
    const type = typeVan(soort, { soort: vleessoort });
    const slug = await vrijeSlug(s, maakSlug(maker && !naam.toLowerCase().includes(maker.toLowerCase()) ? `${maker} ${naam}` : naam));
    const alcohol = soort !== 'vlees';

    const { data: p, error } = await s.supabase.from('winkel_producten').insert({
        organization_id: s.orgId, naam, type, slug, kenmerken, alcohol, ean,
        eenheid: 'stuk', prijs_per: 1, btw_pct: alcohol ? 21 : 9,
        pagina_status: 'concept', actief: true,
    }).select('id').single();
    if (error || !p) return { error: eanFoutMelding(error) ?? error?.message ?? 'Aanmaken mislukt' };

    const { data: a, error: aFout } = await s.supabase.from('winkel_artikelen').insert({
        organization_id: s.orgId, slug, naam, eenheid: soort === 'wijn' ? 'per fles' : 'per stuk', telt: 'stuks',
        prijs_cents: null, btw_pct: alcohol ? 21 : 9, minimum: 1, maximum: null, verzendbaar: false, gekoeld: soort === 'vlees',
        moment_soort: 'moment', moment_groep: soort, capaciteit_soort: 'regel', alcohol,
        segment: soort === 'vlees' ? null : soort, actief: false, publiek: true,
    }).select('id').single();
    if (aFout || !a) return { error: aFout?.message ?? 'Artikel aanmaken mislukt' };

    const { error: sFout } = await s.supabase.from('winkel_artikel_slots').insert({
        organization_id: s.orgId, artikel_id: a.id, volgorde: 0, slot_type: type, naam, hoeveelheid: 1, eenheid: 'stuk', per: 'stuk', standaard_product_id: p.id,
    });
    if (sFout) return { error: sFout.message };

    revalidatePath(PAD);
    return { data: { id: p.id as string, slug } };
}

/* ═══ C5 · De productkaart ═══════════════════════════════════════════════════ */

const lijst = z.array(z.string().trim().min(1).max(120)).max(40).nullable();

const PaginaVelden = z.object({
    id: z.string().uuid(),
    naam: z.string().trim().min(1, 'Geef het product een naam').max(160),
    slug: z.string().trim().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Het adres: kleine letters, cijfers en streepjes').max(80),
    kenmerken: z.record(z.string(), z.unknown()),
    alcohol_pct: z.number().min(0).max(99).nullable(),
    allergenen: lijst,
    ingredienten: lijst,
    bewaren: z.string().trim().max(600).nullable(),
    lekker_bij: z.string().trim().max(200).nullable(),
    ean: z.string().regex(/^\d{8,14}$/, 'Een streepjescode is 8 tot 14 cijfers').nullable(),
    /* null = prijs volgt; nooit 0 als gok. */
    prijs_cents: z.number().int().min(1, 'Een prijs is nooit € 0').nullable(),
    eenheid: z.string().trim().min(1).max(40),
    /* Wat de AI waar vond (bij overnemen van een voorstel). Leeg laten = bestaande bronnen houden. */
    bronnen: z.array(z.object({ url: z.string().url().max(500), titel: z.string().max(160) })).max(24).optional(),
});

export async function bewaarPagina(input: unknown): Promise<ActionResult<{ sein: SeinUitkomst | null; tekstcontrole: TekstcontroleUitkomst }>> {
    const parsed = PaginaVelden.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const v = parsed.data;
    const oud = await laadProduct(s, v.id);
    if (!oud) return { error: 'Product niet gevonden' };
    const soort = soortVanType(oud.type);
    if (!soort) return { error: 'Dit soort product heeft geen pagina' };

    /* Op de site moeten de kenmerken kloppen; een concept mag nog half zijn. */
    if (oud.pagina_status === 'live' && !KENMERKEN[soort].safeParse(v.kenmerken).success) {
        return { error: 'Dit product staat op de site: vul eerst alle verplichte gegevens in (of haal het van de site).' };
    }
    /* Het adres verandert niet meer zodra het op de site staat: links en bestellingen hangen eraan. */
    let slug = oud.slug ?? v.slug;
    if (oud.pagina_status !== 'live' && v.slug !== oud.slug) slug = await vrijeSlug(s, v.slug, oud.id);

    const alcohol = soort !== 'vlees' && (v.alcohol_pct ?? 1) > ALCOHOLVRIJ_TOT;
    const { error } = await s.supabase.from('winkel_producten').update({
        naam: v.naam, slug, kenmerken: v.kenmerken, alcohol, alcohol_pct: v.alcohol_pct,
        allergenen: v.allergenen?.length ? v.allergenen : null, ingredienten: v.ingredienten?.length ? v.ingredienten : null,
        bewaren: v.bewaren || null, lekker_bij: v.lekker_bij || null, ean: v.ean,
        winkelprijs_incl_cents: v.prijs_cents, btw_pct: alcohol ? 21 : 9,
        ...(v.bronnen ? { bronnen: v.bronnen } : {}),
    }).eq('id', v.id).eq('organization_id', s.orgId);
    if (error) return { error: error.code === 'WC003' ? 'Online alleen drank onder de 15 %.' : eanFoutMelding(error) ?? error.message };

    /* Het artikel van de losse verkoop volgt: naam, adres, prijs, 18+. Te koop zodra er een prijs is. */
    const { error: aFout } = await s.supabase.from('winkel_artikelen').update({
        slug, naam: v.naam, prijs_cents: v.prijs_cents, eenheid: v.eenheid, alcohol, btw_pct: alcohol ? 21 : 9, actief: v.prijs_cents != null,
    }).eq('organization_id', s.orgId).eq('slug', oud.slug ?? slug);
    if (aFout) return { error: aFout.message };
    await s.supabase.from('winkel_artikel_slots').update({ naam: v.naam }).eq('organization_id', s.orgId).eq('standaard_product_id', v.id).eq('volgorde', 0);

    const tekstcontrole = await controleerTekst(await siteUrl(s.orgId), teksten({ naam: v.naam, lekker_bij: v.lekker_bij, kenmerken: v.kenmerken }));
    revalidatePath(PAD);
    return { data: { sein: await seinAlsLive(oud.pagina_status), tekstcontrole } };
}

export async function zetPaginaFoto(input: unknown): Promise<ActionResult<{ sein: SeinUitkomst | null }>> {
    const parsed = z.object({ id: z.string().uuid(), foto: fotoOpslagSchema.nullable() }).safeParse(input);
    if (!parsed.success) return { error: 'De foto is niet goed opgeslagen' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { id, foto } = parsed.data;
    if (foto && !foto.basis.startsWith(`${s.orgId}/`)) return { error: 'De foto staat in de verkeerde map' };
    const oud = await laadProduct(s, id);
    if (!oud) return { error: 'Product niet gevonden' };
    const { error } = await s.supabase.from('winkel_producten').update({ foto }).eq('id', id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { sein: await seinAlsLive(oud.pagina_status) } };
}

/** Mathijs keurde de proefkaart of de druiven na; pas dan toont de site ze. */
export async function keurGoed(input: unknown): Promise<ActionResult<{ sein: SeinUitkomst | null }>> {
    const parsed = z.object({ id: z.string().uuid(), groep: z.enum(['proefkaart', 'druiven']), aan: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const oud = await laadProduct(s, parsed.data.id);
    if (!oud) return { error: 'Product niet gevonden' };
    const goedgekeurd = { ...(oud.goedgekeurd ?? {}) } as Record<string, unknown>;
    if (parsed.data.aan) goedgekeurd[parsed.data.groep] = { door: s.user.id, op: new Date().toISOString() };
    else delete goedgekeurd[parsed.data.groep];
    const { error } = await s.supabase.from('winkel_producten').update({ goedgekeurd }).eq('id', oud.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { sein: await seinAlsLive(oud.pagina_status) } };
}

/* ═══ C8 · Op de site, eraf, en een voorbeeld ════════════════════════════════ */

export async function zetOpSite(input: unknown): Promise<ActionResult<{ sein: SeinUitkomst; tekstcontrole: TekstcontroleUitkomst }>> {
    const parsed = z.object({ id: z.string().uuid(), live: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const p = await laadProduct(s, parsed.data.id);
    if (!p) return { error: 'Product niet gevonden' };

    let tekstcontrole: TekstcontroleUitkomst = { status: 'goed' };
    if (parsed.data.live) {
        const mist = ontbreektVoorSite(p);
        if (mist.length) return { error: `Nog niet op de site: ${mist.join(', ')}.` };
        tekstcontrole = await controleerTekst(await siteUrl(s.orgId), teksten(p));
        if (tekstcontrole.status === 'fout') {
            return { error: `Deze woorden mogen niet op de site: ${tekstcontrole.fouten.map((f) => `"${f.woord}"`).join(', ')}.` };
        }
    }
    const { error } = await s.supabase.from('winkel_producten').update({ pagina_status: parsed.data.live ? 'live' : 'concept' }).eq('id', p.id).eq('organization_id', s.orgId);
    if (error) return { error: error.code === 'WC003' ? 'Online alleen drank onder de 15 %.' : error.code === 'WC001' ? 'Eerst een adres (slug).' : error.message };
    revalidatePath(PAD);
    return { data: { sein: await seinWebsite(), tekstcontrole } };
}

export async function voorbeeldLink(input: unknown): Promise<ActionResult<{ url: string }>> {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const p = await laadProduct(s, parsed.data.id);
    if (!p) return { error: 'Product niet gevonden' };
    const site = await siteUrl(s.orgId);
    if (!site) return { error: 'Zet eerst het adres van de website bij Instellingen.' };
    const token = maakVoorbeeldToken(s.orgId, p.id);
    if (!token) return { error: 'De voorbeeldlink staat nog niet aan (CATALOGUS_VOORBEELD_GEHEIM ontbreekt op de server).' };
    return { data: { url: `${site}/voorbeeld/${token}` } };
}
