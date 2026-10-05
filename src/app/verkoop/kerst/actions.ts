/**
 * Server Actions voor /verkoop/kerst — de Kerst-Box-bestellingen.
 *
 * Huisregels (zie verkoop/webshop/actions.ts):
 *  - Zod op alle invoer; re-auth binnen de action.
 *  - De organisatie komt uit organization_members, nooit uit de client.
 *  - Nooit een prijs verzinnen: leeg blijft leeg (dan staat de proeverij uit).
 *
 * Betaald (pin/contant) en opgehaald lopen via de bestaande acties van de
 * webshop (boekRestBetaling, zetOpgehaald): één balie.
 */

'use server';

import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';
import { hertelEvent, plaatsBestelling } from '@/lib/winkel/plaatsing';
import { berekenOfferte } from '@/lib/winkel/rekenen';
import { KERST_SLUGS, PROEVERIJ_ARTIKEL, kerstArtikelen, kerstMand, kerstOpmerking, leesKerstLead, plaatsKerstBestelling, type KerstAanvraag } from '@/lib/winkel/kerst';
import { stuurKerstMail, veldenUitOrder, type KerstMailSoort } from '@/lib/winkel/kerstMail';
import { evalueerWinkelMeldingen } from '@/lib/voorraad/meldingen';

type ActionResult<T = unknown> = { data: T } | { error: string };

const PAD = '/verkoop/kerst';

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

async function tenantVoor(orgId: string) {
    const sb = createServiceSupabase();
    const { data: org } = await sb.from('organizations').select('slug').eq('id', orgId).maybeSingle();
    if (!org?.slug) return null;
    const store = maakSupabaseStore(sb);
    const tenant = await store.laadTenant(org.slug);
    return tenant ? { sb, store, tenant } : null;
}

/* ═══════════════════════════════════════════════════════════════════════════
   1. Prijzen van de proeverijen
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Prijs zetten = de proeverij aan (en zichtbaar op de site); prijs leeg = uit.
 * Het artikel wordt aangemaakt als het er nog niet is.
 */
export async function zetProeverijPrijs(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({
        soort: z.enum(['bier', 'wijn']),
        prijs_cents: z.number().int().min(1, 'Een prijs is minstens 1 cent').max(100000).nullable(),
    }).safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { soort, prijs_cents } = parsed.data;
    const basis = PROEVERIJ_ARTIKEL[soort];

    const { data: bestaand } = await s.supabase.from('winkel_artikelen').select('id').eq('organization_id', s.orgId).eq('slug', basis.slug).maybeSingle();
    const velden = { prijs_cents, actief: prijs_cents != null };
    const { error } = bestaand
        ? await s.supabase.from('winkel_artikelen').update(velden).eq('id', bestaand.id).eq('organization_id', s.orgId)
        : await s.supabase.from('winkel_artikelen').insert({ ...basis, ...velden, organization_id: s.orgId });
    if (error) return { error: error.message };
    revalidatePath(PAD);
    revalidatePath('/verkoop/webshop');
    return { data: { ok: true } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. Wat er in de doos zit
   ═══════════════════════════════════════════════════════════════════════════ */

const OnderdeelSchema = z.object({
    id: z.string().uuid().nullable().default(null),
    naam: z.string().trim().min(1, 'Geef het onderdeel een naam').max(120),
    soort: z.string().trim().max(40).default('overig'),
    eenheid: z.enum(['gram', 'stuk', 'ml']).default('gram'),
    per_persoon: z.number().min(0).max(100000).nullable().default(null),
    per_persoon_vega: z.number().min(0).max(100000).nullable().default(null),
    volgorde: z.number().int().min(0).max(10000).default(0),
});

export async function bewaarOnderdeel(input: unknown): Promise<ActionResult<{ id: string }>> {
    const parsed = OnderdeelSchema.safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { id, ...velden } = parsed.data;
    if (id) {
        const { error } = await s.supabase.from('kerst_onderdelen').update(velden).eq('id', id).eq('organization_id', s.orgId);
        if (error) return { error: error.message };
        revalidatePath(PAD);
        return { data: { id } };
    }
    const nieuwId = randomUUID();
    const { error } = await s.supabase.from('kerst_onderdelen').insert({ id: nieuwId, ...velden, organization_id: s.orgId });
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { id: nieuwId } };
}

export async function verwijderOnderdeel(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('kerst_onderdelen').delete().eq('id', parsed.data.id).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. Een bestelling: annuleren, aantal aanpassen, opnieuw mailen
   ═══════════════════════════════════════════════════════════════════════════ */

async function eventIdsVan(sb: ReturnType<typeof createServiceSupabase>, orderId: number): Promise<number[]> {
    const { data } = await sb.from('winkel_order_regels').select('event_id').eq('order_id', orderId).not('event_id', 'is', null);
    return [...new Set((data ?? []).map((r) => Number(r.event_id)).filter((n) => Number.isInteger(n)))];
}

/** Annuleren (of terugzetten). Telt daarna niet meer mee in het vakje en de productie. */
export async function zetKerstGeannuleerd(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ orderId: z.coerce.number().int().positive(), geannuleerd: z.boolean() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const t = await tenantVoor(s.orgId);
    if (!t) return { error: 'Organisatie niet gevonden' };

    const { data: o } = await t.sb.from('winkel_orders').select('id, nummer, status, lead_id').eq('id', parsed.data.orderId).eq('organization_id', s.orgId).maybeSingle();
    if (!o || o.lead_id == null) return { error: 'Kerst-bestelling niet gevonden' };
    if (parsed.data.geannuleerd && o.status !== 'betaald') return { error: 'Deze bestelling staat niet open.' };
    if (!parsed.data.geannuleerd && o.status !== 'geannuleerd') return { error: 'Deze bestelling is niet geannuleerd.' };

    const { error } = await t.sb.from('winkel_orders')
        .update(parsed.data.geannuleerd ? { status: 'geannuleerd', geannuleerd_at: new Date().toISOString() } : { status: 'betaald', geannuleerd_at: null })
        .eq('id', o.id);
    if (error) return { error: error.message };

    for (const id of await eventIdsVan(t.sb, o.id)) {
        try { await hertelEvent(t.store, s.orgId, id); } catch (e) { console.error('[kerst] hertellen mislukt:', id, e instanceof Error ? e.message : e); }
    }
    if (!parsed.data.geannuleerd) {
        const order = await t.store.vindOrderOpNummer(s.orgId, o.nummer);
        if (order) await plaatsBestelling(t.store, t.tenant, order);
    }
    await evalueerWinkelMeldingen(s.orgId).catch(() => undefined);
    revalidatePath(PAD);
    revalidatePath('/verkoop/webshop');
    return { data: { ok: true } };
}

const AantalSchema = z.object({
    orderId: z.coerce.number().int().positive(),
    personen: z.number().int().min(1).max(1000),
    vegetarisch: z.number().int().min(0).max(1000),
    bier: z.number().int().min(0).max(1000),
    wijn: z.number().int().min(0).max(1000),
    onzeker: z.boolean(),
});

/**
 * Het aantal aanpassen (de klant belde, of antwoordde op de navraag). De
 * regels worden opnieuw gerekend met dezelfde offerte als bij het bestellen;
 * daarna het vakje opnieuw tellen. Niet meer na inpakken, ophalen of betalen
 * aan de balie — dan klopt de doos of de kassa niet meer.
 */
export async function wijzigKerstAantal(input: unknown): Promise<ActionResult<{ totaal_cents: number }>> {
    const parsed = AantalSchema.safeParse(input);
    if (!parsed.success) return { error: eersteFout(parsed.error) };
    const d = parsed.data;
    if (d.vegetarisch > d.personen) return { error: 'Meer vegetarisch dan personen.' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const t = await tenantVoor(s.orgId);
    if (!t) return { error: 'Organisatie niet gevonden' };

    const { data: o } = await t.sb.from('winkel_orders')
        .select('id, nummer, status, lead_id, opmerking, rest_betaald_at, winkel_order_regels(id, slug, aantal, moment_id, eenheden, klaar_op, klaargezet_at, opgehaald_at, event_id)')
        .eq('id', d.orderId).eq('organization_id', s.orgId).maybeSingle();
    if (!o || o.lead_id == null) return { error: 'Kerst-bestelling niet gevonden' };
    if (o.status !== 'betaald') return { error: 'Deze bestelling staat niet open.' };
    if (o.rest_betaald_at) return { error: 'Al betaald aan de balie. Pas het daar aan.' };
    const oud = (o.winkel_order_regels ?? []) as { id: number; slug: string; aantal: number; moment_id: string | null; eenheden: number; klaar_op: string; klaargezet_at: string | null; opgehaald_at: string | null; event_id: number | null }[];
    if (oud.some((r) => r.klaargezet_at || r.opgehaald_at)) return { error: 'Al ingepakt of opgehaald. Zet dat eerst terug in de webshop.' };
    const boxRegel = oud.find((r) => r.slug === KERST_SLUGS.box || r.slug === KERST_SLUGS.vega);
    const momentId = boxRegel?.moment_id ?? oud[0]?.moment_id;
    if (!momentId) return { error: 'Deze bestelling heeft geen afhaaldag.' };

    const bronnen = await t.store.laadBronnen(s.orgId);
    if (!bronnen) return { error: 'De webshop heeft nog geen instellingen.' };
    const box = bronnen.artikelen.find((a) => a.slug === KERST_SLUGS.box);
    if (box && d.personen < box.minimum) return { error: `De Kerst-Box gaat vanaf ${box.minimum} personen.` };

    /* De eigen bezetting telt niet mee tegen de eigen wijziging. */
    const eigen = oud.filter((r) => r.moment_id === momentId).reduce((n, r) => n + r.eenheden, 0);
    const momenten = bronnen.momenten.map((m) => (m.id === momentId ? { ...m, bezet: Math.max(0, m.bezet - eigen), bestellen_tot: null, sluit_op: null } : m));
    const opmerkingKlant = (o.opmerking ?? '').split('\n').filter((r: string) => !/^\s*waarvan vegetarisch\s*:/i.test(r) && !/^aantal nog niet zeker/i.test(r)).join('\n').trim();
    const aanvraag: KerstAanvraag = { personen: d.personen, vegetarisch: d.vegetarisch, onzeker: d.onzeker, afhaaldag: boxRegel?.klaar_op ?? '', bier: d.bier, wijn: d.wijn, opmerking: opmerkingKlant };
    const uit = berekenOfferte(
        { ...bronnen, artikelen: kerstArtikelen(bronnen.artikelen), momenten },
        kerstMand(aanvraag, momentId, bronnen.artikelen), 'afhalen', null, 'bij_afhalen',
    );
    if (uit.ok === false) return { error: uit.soort === 'validatie' ? uit.fouten.join(' ') : uit.melding };
    const { offerte, regels, btwCenten } = uit.intern;

    const oudeEvents = [...new Set(oud.map((r) => r.event_id).filter((x): x is number => x != null))];
    const opSlug = new Map(oud.map((r) => [r.slug, r]));
    for (const r of regels) {
        const bestaand = opSlug.get(r.slug);
        const velden = {
            aantal: r.aantal, stuk_cents: r.stukCenten, bedrag_cents: r.bedragCenten, btw_pct: r.btw_pct, btw_cents: r.btw_cents,
            eenheden: r.eenheden, voorraad_eenheden: r.voorraad_eenheden, alcohol: r.alcohol,
        };
        let regelId: number;
        if (bestaand) {
            const { error } = await t.sb.from('winkel_order_regels').update(velden).eq('id', bestaand.id);
            if (error) return { error: error.message };
            regelId = bestaand.id;
            /* Inhoud en dozen opnieuw: die hangen aan het aantal. */
            await t.sb.from('winkel_order_regel_componenten').delete().eq('order_regel_id', regelId);
            await t.sb.from('winkel_dozen').delete().eq('order_regel_id', regelId);
            opSlug.delete(r.slug);
        } else {
            const { data: nieuw, error } = await t.sb.from('winkel_order_regels').insert({
                ...velden, organization_id: s.orgId, order_id: o.id, artikel_id: r.artikel_id, slug: r.slug, naam: r.naam,
                eenheid: r.eenheid, moment_id: r.moment_id, afhaalmoment_tekst: r.afhaalmoment,
            }).select('id').single();
            if (error || !nieuw) return { error: error?.message ?? 'Regel toevoegen mislukt' };
            regelId = nieuw.id as number;
        }
        if (r.componenten.length) {
            const { error } = await t.sb.from('winkel_order_regel_componenten').insert(r.componenten.map((c) => ({
                organization_id: s.orgId, order_regel_id: regelId, product_id: c.product_id, slot_type: c.slot_type, naam: c.naam, hoeveelheid: c.hoeveelheid, eenheid: c.eenheid,
            })));
            if (error) return { error: error.message };
        }
    }
    /* Wat er niet meer in zit (bijv. de vega-regel naar 0). */
    for (const r of opSlug.values()) {
        const { error } = await t.sb.from('winkel_order_regels').delete().eq('id', r.id);
        if (error) return { error: error.message };
    }

    const { error: oFout } = await t.sb.from('winkel_orders').update({
        subtotaal_cents: offerte.subtotaalCenten, totaal_cents: offerte.totaalCenten, btw_cents: btwCenten,
        nu_te_betalen_cents: 0, rest_cents: offerte.totaalCenten,
        opmerking: kerstOpmerking(aanvraag) || null, aantal_onzeker: d.onzeker,
    }).eq('id', o.id);
    if (oFout) return { error: oFout.message };

    for (const id of oudeEvents) {
        try { await hertelEvent(t.store, s.orgId, id); } catch (e) { console.error('[kerst] hertellen mislukt:', id, e instanceof Error ? e.message : e); }
    }
    const order = await t.store.vindOrderOpNummer(s.orgId, o.nummer);
    if (order) await plaatsBestelling(t.store, t.tenant, order);
    await evalueerWinkelMeldingen(s.orgId).catch(() => undefined);
    revalidatePath(PAD);
    revalidatePath('/verkoop/webshop');
    return { data: { totaal_cents: offerte.totaalCenten } };
}

/** Een Kerst-mail (opnieuw) sturen, met de getallen zoals ze nu op de order staan. */
export async function stuurKerstMailOpnieuw(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ orderId: z.coerce.number().int().positive(), soort: z.enum(['ontvangen', 'navraag', 'herinnering']) }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const t = await tenantVoor(s.orgId);
    if (!t) return { error: 'Organisatie niet gevonden' };
    const { data: o } = await t.sb.from('winkel_orders')
        .select('id, nummer, status, lead_id, contact_naam, contact_email, opmerking, totaal_cents, winkel_order_regels(slug, aantal, klaar_op)')
        .eq('id', parsed.data.orderId).eq('organization_id', s.orgId).maybeSingle();
    if (!o || o.lead_id == null) return { error: 'Kerst-bestelling niet gevonden' };
    if (o.status !== 'betaald') return { error: 'Deze bestelling staat niet open.' };

    const soort = parsed.data.soort as KerstMailSoort;
    const m = await stuurKerstMail(soort, o.contact_email, veldenUitOrder(o, o.winkel_order_regels ?? []), t.tenant.email);
    if (!m.success) return { error: `Mail niet verstuurd: ${m.error ?? 'onbekend'}` };
    const kolom = soort === 'ontvangen' ? { mail_status: 'verstuurd', mail_fout: null, mail_verstuurd_at: new Date().toISOString() } : { [`${soort}_verstuurd_at`]: new Date().toISOString() };
    await t.sb.from('winkel_orders').update(kolom).eq('id', o.id);
    revalidatePath(PAD);
    return { data: { ok: true } };
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. Een lead die niet omgezet kon worden
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Opnieuw omzetten nadat de oorzaak is opgelost (dag vol, artikel uit). De
 * klant heeft zijn bevestiging al; er gaat geen tweede.
 */
export async function zetLeadOmOpnieuw(input: unknown): Promise<ActionResult<{ nummer: string }>> {
    const parsed = z.object({ leadId: z.coerce.number().int().positive() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const t = await tenantVoor(s.orgId);
    if (!t) return { error: 'Organisatie niet gevonden' };
    const { data: l } = await t.sb.from('leads')
        .select('id, naam, email, telefoon, event_type, event_datum, gasten, bericht')
        .eq('id', parsed.data.leadId).eq('organization_id', s.orgId).maybeSingle();
    if (!l) return { error: 'Aanvraag niet gevonden' };
    if (!l.email) return { error: 'Deze aanvraag heeft geen e-mailadres.' };
    const a = leesKerstLead(l);
    if (!a) return { error: 'Hier valt geen Kerst-Box-bestelling uit te lezen (dag of aantal ontbreekt).' };

    const uit = await plaatsKerstBestelling(
        { store: t.store, mail: async () => ({ success: true }), naPlaatsen: (orgId) => evalueerWinkelMeldingen(orgId) },
        t.tenant, { id: l.id, naam: l.naam, email: l.email, telefoon: l.telefoon }, a,
    );
    if (uit.ok === false) {
        await t.sb.from('leads').update({ omzet_fout: uit.reden }).eq('id', l.id);
        revalidatePath(PAD);
        return { error: uit.reden };
    }
    await t.sb.from('leads').update({ status: 'gewonnen', omzet_fout: null }).eq('id', l.id);
    revalidatePath(PAD);
    revalidatePath('/verkoop/webshop');
    return { data: { nummer: uit.order.nummer } };
}

/** Een lead die geen bestelling wordt (dubbel, test): uit de Kerst-lijst. */
export async function negeerKerstLead(input: unknown): Promise<ActionResult<{ ok: true }>> {
    const parsed = z.object({ leadId: z.coerce.number().int().positive() }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { error } = await s.supabase.from('leads').update({ status: 'verloren', omzet_fout: null }).eq('id', parsed.data.leadId).eq('organization_id', s.orgId);
    if (error) return { error: error.message };
    revalidatePath(PAD);
    return { data: { ok: true } };
}

