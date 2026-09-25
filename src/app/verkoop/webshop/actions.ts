/**
 * Server Actions voor /verkoop/webshop — het beheer van de kassa en de vakjes.
 * Plan: docs/webshop-beheer-bouwplan.md §3 en §4.
 *
 * Huisregels (zie ook verkoop/bestellingen/actions.ts):
 *  - Zod op alle invoer.
 *  - Re-auth BINNEN de action; de proxy alleen is niet genoeg.
 *  - De organisatie komt uit organization_members, nooit uit de client.
 *  - Nooit een prijs, hoeveelheid of koppeling verzinnen: leeg blijft leeg.
 *
 * De plaatsing (Plaats opnieuw, Klopt niet) loopt via dezelfde functie als de
 * webhook — plaatsBestelling — met de service-store, zodat het resultaat
 * hetzelfde is als wanneer de betaling binnenkwam.
 */

'use server';

import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';
import { hertelEvent, plaatsBestelling } from '@/lib/winkel/plaatsing';
import { stelKoppelingenVoor, type KoppelArtikel, type KoppelVoorstel } from '@/lib/ai/winkelKoppelVoorsteller';

type ActionResult<T = unknown> = { data: T } | { error: string };

const PAD = '/verkoop/webshop';
const SLUG = /^[a-z0-9-]{1,60}$/;

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

/* ═══════════════════════════════════════════════════════════════════════════
   1. Artikelen
   ═══════════════════════════════════════════════════════════════════════════ */

const ArtikelVelden = z.object({
    naam: z.string().trim().min(1, 'Geef het artikel een naam').max(120),
    eenheid: z.string().trim().min(1).max(40).default('per stuk'),
    telt: z.enum(['stuks', 'personen']).default('stuks'),
    /* null = prijs volgt. Nooit 0 als gok. */
    prijs_cents: z.number().int().min(0).nullable().default(null),
    btw_pct: z.union([z.literal(0), z.literal(9), z.literal(21)]).default(9),
    minimum: z.number().int().min(1, 'Minimum is minstens 1').default(1),
    maximum: z.number().int().min(1).nullable().default(null),
    verzendbaar: z.boolean().default(false),
    gekoeld: z.boolean().default(false),
    moment_soort: z.enum(['geen', 'moment', 'dag']).default('geen'),
    moment_groep: z.string().trim().max(40).nullable().default(null),
    afhaalmoment_tekst: z.string().trim().max(160).nullable().default(null),
    capaciteit_soort: z.enum(['regel', 'aantal', 'dozen']).default('regel'),
    doos_klein_max: z.number().int().min(1).nullable().default(null),
    doos_groot: z.number().int().min(1).nullable().default(null),
    voorraad: z.number().int().min(0).nullable().default(null),
    actief: z.boolean().default(false),
    publiek: z.boolean().default(true),
    dieet: z.enum(['vegetarisch', 'veganistisch']).nullable().default(null),
});
type ArtikelVelden = z.infer<typeof ArtikelVelden>;

/** Dezelfde regels als de database-constraints, maar dan leesbaar vóór Postgres ze geeft. */
function controleerArtikel(a: ArtikelVelden): string | null {
    if (a.moment_soort !== 'geen' && !a.moment_groep) return 'Kies uit welke groep momenten de klant kiest (bijv. agenda of kerst-box).';
    if (a.capaciteit_soort === 'dozen') {
        if (a.doos_klein_max == null || a.doos_groot == null) return 'Bij dozen horen twee maten: tot en met hoeveel personen de kleine doos gaat, en hoeveel er in een grote doos passen.';
        if (a.doos_klein_max >= a.doos_groot) return 'De kleine doos moet kleiner zijn dan de grote.';
    }
    if (a.maximum != null && a.maximum < a.minimum) return 'Het maximum kan niet onder het minimum liggen.';
    return null;
}

function artikelRij(a: ArtikelVelden) {
    return {
        naam: a.naam, eenheid: a.eenheid, telt: a.telt, prijs_cents: a.prijs_cents, btw_pct: a.btw_pct,
        minimum: a.minimum, maximum: a.maximum, verzendbaar: a.verzendbaar, gekoeld: a.gekoeld,
        moment_soort: a.moment_soort, moment_groep: a.moment_soort === 'geen' ? null : a.moment_groep,
        afhaalmoment_tekst: a.afhaalmoment_tekst || null, capaciteit_soort: a.capaciteit_soort,
        doos_klein_max: a.capaciteit_soort === 'dozen' ? a.doos_klein_max : null,
        doos_groot: a.capaciteit_soort === 'dozen' ? a.doos_groot : null,
        voorraad: a.voorraad, actief: a.actief, publiek: a.publiek, dieet: a.dieet,
    };
}

export async function maakArtikel(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = ArtikelVelden.extend({ slug: z.string().regex(SLUG, 'Een slug bestaat uit kleine letters, cijfers en koppeltekens — precies zoals op de website') }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const fout = controleerArtikel(parsed.data);
    if (fout) return { error: fout };

    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { data, error } = await s.supabase
        .from('winkel_artikelen')
        .insert({ organization_id: s.orgId, slug: parsed.data.slug, ...artikelRij(parsed.data) })
        .select('id')
        .single();
    if (error) return { error: error.code === '23505' ? 'Er is al een artikel met deze slug.' : error.message };
    revalidatePath(PAD);
    return { data: { id: data.id as string } };
}

export async function werkArtikelBij(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = ArtikelVelden.extend({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const fout = controleerArtikel(parsed.data);
    if (fout) return { error: fout };

    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase.from('winkel_artikelen').update(artikelRij(parsed.data)).eq('id', parsed.data.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

export async function zetArtikelActief(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid(), actief: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('winkel_artikelen').update({ actief: parsed.data.actief }).eq('id', parsed.data.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

/* ── Koppelen: wat maakt de keuken of wat koop je in ──────────────────────── */

const KoppelSchema = z.discriminatedUnion('soort', [
    z.object({ id: z.string().uuid(), soort: z.literal('gerecht'), gerecht_id: z.string().uuid() }),
    z.object({ id: z.string().uuid(), soort: z.literal('voorraad'), inventory_id: z.number().int().positive(), inkoop_per_stuk: z.number().positive().nullable().default(null) }),
    z.object({ id: z.string().uuid(), soort: z.literal('geen') }),
]);

export async function koppelArtikel(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = KoppelSchema.safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const d = parsed.data;

    /* Het gekoppelde ding moet van deze organisatie zijn — RLS filtert, maar
       een leeg antwoord moet een leesbare fout worden. */
    let velden: Record<string, unknown>;
    if (d.soort === 'gerecht') {
        const { data: g } = await s.supabase.from('gerechten').select('id').eq('id', d.gerecht_id).eq('organization_id', s.orgId).maybeSingle();
        if (!g) return { error: 'Dat gerecht is niet gevonden.' };
        velden = { gerecht_id: d.gerecht_id, inventory_id: null, inkoop_per_stuk: null };
    } else if (d.soort === 'voorraad') {
        const { data: i } = await s.supabase.from('inventory').select('id').eq('id', d.inventory_id).eq('organization_id', s.orgId).maybeSingle();
        if (!i) return { error: 'Dat voorraad-item is niet gevonden.' };
        velden = { gerecht_id: null, inventory_id: d.inventory_id, inkoop_per_stuk: d.inkoop_per_stuk };
    } else {
        velden = { gerecht_id: null, inventory_id: null, inkoop_per_stuk: null };
    }

    const { error } = await s.supabase.from('winkel_artikelen').update({ ...velden, koppel_voorstel: null }).eq('id', d.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };

    /* Events waar dit artikel al in ligt opnieuw tellen, zodat het menu er
       meteen bij staat. Dat loopt via de orders die erop liggen. */
    await hertelEventsVanArtikel(s.orgId, d.id);

    revalidatePath(PAD);
    return { data: { ok: true } };
}

/**
 * Een nieuw voorraad-item, met alleen naam en eenheid. Leverancier, prijs en
 * par-niveau vul je in /voorraad — hier wordt niets geraden.
 */
export async function maakVoorraadItem(input: unknown): Promise<ActionResult<{ id: number }>> {
    const parsed = z.object({
        naam: z.string().trim().min(1, 'Geef het voorraad-item een naam').max(120),
        unit: z.string().trim().min(1, 'Kies een eenheid (stuk, fles, kg, …)').max(20),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { data, error } = await s.supabase
        .from('inventory')
        .insert({ organization_id: s.orgId, naam: parsed.data.naam, unit: parsed.data.unit, current_stock: 0, categorie: 'Webshop' })
        .select('id')
        .single();
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { id: Number(data.id) } };
}

async function laadKoppelKeuzes(s: NonNullable<Awaited<ReturnType<typeof ingelogdMetOrg>>>) {
    const [{ data: gerechten }, { data: voorraad }] = await Promise.all([
        s.supabase.from('gerechten').select('id, naam').eq('organization_id', s.orgId).eq('actief', true).order('naam'),
        s.supabase.from('inventory').select('id, naam, unit').eq('organization_id', s.orgId).order('naam'),
    ]);
    return {
        gerechten: (gerechten ?? []) as { id: string; naam: string }[],
        voorraad: ((voorraad ?? []) as { id: number; naam: string; unit: string | null }[]).map((v) => ({ ...v, id: Number(v.id) })),
    };
}

const artikelNaarKoppel = (a: Record<string, unknown>): KoppelArtikel => ({
    id: String(a.id), naam: String(a.naam), eenheid: String(a.eenheid), telt: a.telt as KoppelArtikel['telt'],
    moment_soort: a.moment_soort as KoppelArtikel['moment_soort'], verzendbaar: Boolean(a.verzendbaar),
});

/** Eén artikel: een voorstel vragen en opslaan in koppel_voorstel. */
export async function vraagKoppelVoorstel(input: unknown): Promise<ActionResult<{ voorstel: KoppelVoorstel | null; fout?: string }>> {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { data: a } = await s.supabase.from('winkel_artikelen').select('id, naam, eenheid, telt, moment_soort, verzendbaar').eq('id', parsed.data.id).eq('organization_id', s.orgId).maybeSingle();
    if (!a) return { error: 'Artikel niet gevonden' };
    const keuzes = await laadKoppelKeuzes(s);
    const uit = await stelKoppelingenVoor(s.orgId, [artikelNaarKoppel(a)], keuzes.gerechten, keuzes.voorraad);
    const voorstel = uit.voorstellen.get(a.id) ?? null;
    if (voorstel) await s.supabase.from('winkel_artikelen').update({ koppel_voorstel: voorstel }).eq('id', a.id).eq('organization_id', s.orgId);
    revalidatePath(PAD);
    return { data: { voorstel, fout: uit.fout } };
}

/** Koppelronde: alle artikelen zonder koppeling in één keer. */
export async function koppelronde(): Promise<ActionResult<{ aantal: number; fout?: string }>> {
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { data: rijen } = await s.supabase
        .from('winkel_artikelen')
        .select('id, naam, eenheid, telt, moment_soort, verzendbaar')
        .eq('organization_id', s.orgId)
        .is('gerecht_id', null)
        .is('inventory_id', null);
    const artikelen = (rijen ?? []).map(artikelNaarKoppel);
    if (artikelen.length === 0) return { data: { aantal: 0 } };

    const keuzes = await laadKoppelKeuzes(s);
    const uit = await stelKoppelingenVoor(s.orgId, artikelen, keuzes.gerechten, keuzes.voorraad);
    let aantal = 0;
    for (const [id, voorstel] of uit.voorstellen) {
        const { error } = await s.supabase.from('winkel_artikelen').update({ koppel_voorstel: voorstel }).eq('id', id).eq('organization_id', s.orgId);
        if (!error) aantal += 1;
    }
    revalidatePath(PAD);
    return { data: { aantal, fout: uit.fout } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Momenten
   ═══════════════════════════════════════════════════════════════════════════ */

const DATUM = /^\d{4}-\d{2}-\d{2}$/;
const TIJD = /^\d{2}:\d{2}$/;

export async function voegMomentToe(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = z.object({
        groep: z.string().trim().min(1, 'Kies een groep').max(40),
        datum: z.string().regex(DATUM, 'Kies een datum'),
        van: z.string().regex(TIJD).optional().or(z.literal('')),
        tot: z.string().regex(TIJD).optional().or(z.literal('')),
        capaciteit: z.coerce.number().int().min(0).max(1000),
        bestellen_tot: z.string().regex(DATUM).optional().or(z.literal('')),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const d = parsed.data;
    if (d.van && d.tot && d.tot <= d.van) return { error: 'De eindtijd moet ná de starttijd liggen.' };
    if (d.bestellen_tot && d.bestellen_tot > d.datum) return { error: 'Bestellen-tot kan niet ná de dag zelf liggen.' };

    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { data, error } = await s.supabase
        .from('winkel_momenten')
        .insert({ organization_id: s.orgId, groep: d.groep, datum: d.datum, van: d.van || null, tot: d.tot || null, capaciteit: d.capaciteit, bestellen_tot: d.bestellen_tot || null, actief: true })
        .select('id')
        .single();
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { id: data.id as string } };
}

export async function zetMomentCapaciteit(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid(), capaciteit: z.coerce.number().int().min(0).max(1000) }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('winkel_momenten').update({ capaciteit: parsed.data.capaciteit }).eq('id', parsed.data.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

export async function zetMomentActief(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid(), actief: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('winkel_momenten').update({ actief: parsed.data.actief }).eq('id', parsed.data.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

export async function zetMomentBestellenTot(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid(), bestellen_tot: z.string().regex(DATUM).nullable() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('winkel_momenten').update({ bestellen_tot: parsed.data.bestellen_tot }).eq('id', parsed.data.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. Instellingen
   ═══════════════════════════════════════════════════════════════════════════ */

export async function werkInstellingenBij(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        kassa_open: z.boolean(),
        /* null = verzenden staat uit. */
        verzendkosten_cents: z.number().int().min(0).nullable(),
        gratis_verzenden_vanaf_cents: z.number().int().min(0).nullable(),
        verzendkosten_btw_pct: z.union([z.literal(0), z.literal(9), z.literal(21)]),
        reservering_minuten: z.number().int().min(5).max(240),
        offerte_geldig_minuten: z.number().int().min(1).max(240),
        nummer_prefix: z.string().trim().min(1).max(8).regex(/^[A-Z0-9]+$/, 'Alleen hoofdletters en cijfers'),
        site_url: z.string().trim().url('Dat is geen geldige site-URL').nullable().or(z.literal('')),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const d = parsed.data;

    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase
        .from('winkel_instellingen')
        .upsert({ organization_id: s.orgId, ...d, site_url: d.site_url || null }, { onConflict: 'organization_id' });
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. Orders en vakjes
   ═══════════════════════════════════════════════════════════════════════════ */

/** De service-store + tenant voor de plaatsing, na controle dat de order van deze organisatie is. */
async function plaatsingVoorOrder(s: NonNullable<Awaited<ReturnType<typeof ingelogdMetOrg>>>, orderId: number) {
    const { data: o } = await s.supabase.from('winkel_orders').select('id, token').eq('id', orderId).eq('organization_id', s.orgId).maybeSingle();
    if (!o) return null;
    const { data: org } = await s.supabase.from('organizations').select('slug').eq('id', s.orgId).maybeSingle();
    if (!org?.slug) return null;
    const store = maakSupabaseStore();
    const tenant = await store.laadTenant(org.slug);
    const order = await store.vindOrderOpToken(s.orgId, o.token as string);
    if (!tenant || !order) return null;
    return { store, tenant, order };
}

export async function plaatsOpnieuw(input: unknown): Promise<ActionResult<{ status: string; fout?: string }>> {
    const parsed = z.object({ orderId: z.coerce.number().int().positive() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const p = await plaatsingVoorOrder(s, parsed.data.orderId);
    if (!p) return { error: 'Order niet gevonden' };

    const uit = await plaatsBestelling(p.store, p.tenant, p.order);
    revalidatePath(PAD);
    return { data: { status: uit.status, fout: uit.fout } };
}

const WensenSchema = z.object({
    vegetarisch: z.number().int().min(0).max(500).default(0),
    veganistisch: z.number().int().min(0).max(500).default(0),
    glutenvrij: z.number().int().min(0).max(500).default(0),
    allergenen: z.array(z.string().trim().min(1).max(40)).max(20).default([]),
    overig: z.array(z.string().trim().min(1).max(160)).max(10).default([]),
});

/** "Klopt niet": de wensen zelf zetten, dan het vakje opnieuw tellen. */
export async function zetWensenHandmatig(input: unknown): Promise<ActionResult<{ status: string; fout?: string }>> {
    const parsed = z.object({ orderId: z.coerce.number().int().positive(), wensen: WensenSchema }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { error } = await s.supabase.from('winkel_orders').update({ wensen: parsed.data.wensen, wensen_bron: 'handmatig' }).eq('id', parsed.data.orderId).eq('organization_id', s.orgId);
    if (error) return { error: error.message };

    const p = await plaatsingVoorOrder(s, parsed.data.orderId);
    if (!p) return { error: 'Order niet gevonden' };
    const uit = p.order.status === 'betaald' ? await plaatsBestelling(p.store, p.tenant, p.order) : { status: 'niet-betaald' as const, fout: undefined };
    revalidatePath(PAD);
    return { data: { status: uit.status, fout: uit.fout } };
}

/** Vaste bak: een regel klaargezet (of weer niet). */
export async function zetKlaargezet(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ regelId: z.coerce.number().int().positive(), klaargezet: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase
        .from('winkel_order_regels')
        .update({ klaargezet_at: parsed.data.klaargezet ? new Date().toISOString() : null })
        .eq('id', parsed.data.regelId)
        .eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

/** Na een koppeling: de events waar dit artikel al in ligt opnieuw tellen. */
async function hertelEventsVanArtikel(orgId: string, artikelId: string): Promise<void> {
    const store = maakSupabaseStore();
    const sb = createServiceSupabase();
    const { data: regels } = await sb
        .from('winkel_order_regels')
        .select('event_id')
        .eq('organization_id', orgId)
        .eq('artikel_id', artikelId)
        .not('event_id', 'is', null);
    const eventIds = [...new Set((regels ?? []).map((r) => Number(r.event_id)).filter((n) => Number.isInteger(n)))];
    if (eventIds.length === 0) return;
    for (const id of eventIds) {
        try { await hertelEvent(store, orgId, id); } catch (e) { console.error('[webshop] hertellen na koppeling mislukt:', id, e instanceof Error ? e.message : e); }
    }
}
