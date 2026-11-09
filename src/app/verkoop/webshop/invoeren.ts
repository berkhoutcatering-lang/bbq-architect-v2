/**
 * Bestelling invoeren — Server Actions.
 * Ontwerp: docs/superpowers/specs/2026-11-09-bestelling-invoeren-design.md
 *
 * Een bestelling die per mail of telefoon binnenkwam wordt een gewone
 * winkel-order: via dezelfde databasefunctie als de website, daarna op
 * 'betaald' voor het online deel (nul), en geplaatst in de agenda. Zo staat
 * hij in de vakjes, in het Kerst-overzicht en op de afhaaldag in de kassa.
 *
 * Huisregels:
 *  - Zod op alle invoer, re-auth binnen de action.
 *  - Er gaat nooit een mail naar de klant.
 *  - Geen verzonnen prijzen: zonder prijs is het "prijs volgt" of een fout.
 */
'use server';

import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createServerSupabase, createServiceSupabase } from '@/lib/supabase-server';
import { maakSupabaseStore } from '@/lib/winkel/supabaseStore';
import { plaatsBestelling } from '@/lib/winkel/plaatsing';
import { dagInWoorden } from '@/lib/winkel/rekenen';
import {
    bouwHandmatig, handmatigeOpmerking, InvoerSchema, OP_MAAT_ARTIKEL, OP_MAAT_GROEP, OP_MAAT_SLUG, ordergroep, regelgroep, vulPrijsIn,
} from '@/lib/winkel/handmatig';

type ActionResult<T = unknown> = { data: T } | { error: string };

/** Betaalmethode van het online deel bij een order die de kassa niet afrekent. */
const BUITEN_KASSA = 'buiten_kassa';

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

const OPSLAG_FOUT: Record<string, string> = {
    WK001: 'Die afhaaldag zit vol. Haal de grens weg of verhoog hem in Webshop → Momenten, en probeer het opnieuw.',
    WK002: 'Een product is uitverkocht.',
    WK003: 'De afhaaldag staat uit.',
    WK004: 'Een product staat uit (Webshop → Artikelen).',
    WK005: 'De webshop heeft nog geen instellingen.',
    WK008: 'De groep van een product zit vol.',
    WK009: 'Een onderdeel van een pakket is op.',
};

type Sb = ReturnType<typeof createServiceSupabase>;

/** Het verborgen artikel voor regels op maat; bestaat het niet, dan wordt het aangemaakt. Staat het uit, dan weer aan. */
async function zorgVoorOpMaat(sb: Sb, orgId: string): Promise<string | null> {
    const { data: bestaand } = await sb.from('winkel_artikelen').select('id, actief, publiek').eq('organization_id', orgId).eq('slug', OP_MAAT_SLUG).maybeSingle();
    if (bestaand) {
        if (!bestaand.actief || bestaand.publiek) {
            await sb.from('winkel_artikelen').update({ actief: true, publiek: false }).eq('id', bestaand.id);
        }
        return bestaand.id as string;
    }
    const { data, error } = await sb.from('winkel_artikelen').insert({ organization_id: orgId, ...OP_MAAT_ARTIKEL, kanalen: [...OP_MAAT_ARTIKEL.kanalen] }).select('id').single();
    if (error || !data) { console.error('[invoeren] op-maat-artikel aanmaken faalde:', error?.code, error?.message); return null; }
    return data.id as string;
}

/**
 * Het moment van een groep op een dag. Een vaste afhaaldag (Kerst) wordt nooit
 * aangemaakt — de website zou hem dan aanbieden — alleen gevonden; ontbreekt
 * hij, dan antwoordt deze functie null en gaat de regel naar op-maat. Een
 * op-maat-moment wordt gevonden of aangemaakt, met de tijd als die er is.
 */
async function momentVoor(sb: Sb, orgId: string, groep: string, datum: string, tijd: string | null, vasteDag: boolean): Promise<string | null> {
    if (vasteDag) {
        const { data } = await sb.from('winkel_momenten').select('id').eq('organization_id', orgId).eq('groep', groep).eq('datum', datum).eq('actief', true).is('van', null).limit(1).maybeSingle();
        return (data?.id as string | undefined) ?? null;
    }
    let q = sb.from('winkel_momenten').select('id, actief').eq('organization_id', orgId).eq('groep', groep).eq('datum', datum);
    q = tijd ? q.eq('van', `${tijd}:00`) : q.is('van', null);
    const { data: bestaand } = await q.limit(1).maybeSingle();
    if (bestaand) {
        if (!bestaand.actief) await sb.from('winkel_momenten').update({ actief: true }).eq('id', bestaand.id);
        return bestaand.id as string;
    }
    const { data, error } = await sb.from('winkel_momenten')
        .insert({ organization_id: orgId, groep, datum, van: tijd ? `${tijd}:00` : null, tot: null, capaciteit: null, actief: true })
        .select('id').single();
    if (error || !data) throw new Error(`Afhaalmoment aanmaken mislukt: ${error?.message ?? 'onbekend'}`);
    return data.id as string;
}

export interface Ingevoerd {
    orderId: number;
    nummer: string;
    totaalCenten: number;
    prijsVolgt: number;
    /** Hoe de agenda-plaatsing ging. */
    plaatsing: string;
    /** Meldingen die de bestelling niet tegenhielden. */
    let_op: string[];
}

export async function voerBestellingIn(input: unknown): Promise<ActionResult<Ingevoerd>> {
    const parsed = InvoerSchema.safeParse(input);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Controleer de velden' };
    const inv = parsed.data;
    if (inv.wensen.vegetarisch + inv.wensen.veganistisch > 0) {
        const personen = inv.regels.reduce((s, r) => s + r.aantal, 0);
        if (inv.wensen.vegetarisch + inv.wensen.veganistisch > personen) return { error: 'Meer vegetariërs dan er besteld is.' };
    }

    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    const { data: org } = await s.supabase.from('organizations').select('slug').eq('id', s.orgId).maybeSingle();
    if (!org?.slug) return { error: 'Organisatie niet gevonden' };

    const sb = createServiceSupabase();
    const store = maakSupabaseStore();
    const tenant = await store.laadTenant(org.slug);
    if (!tenant) return { error: 'De webshop heeft nog geen instellingen.' };
    const meldingen: string[] = [];

    try {
        if (inv.regels.some((r) => r.soort === 'op-maat') && !(await zorgVoorOpMaat(sb, s.orgId))) {
            return { error: 'Het artikel voor regels op maat kon niet worden aangemaakt.' };
        }
        const bronnen = await store.laadBronnen(s.orgId);
        if (!bronnen) return { error: 'De webshop heeft nog geen instellingen.' };
        const uit = bouwHandmatig(inv, bronnen);
        if (uit.ok === false) return { error: uit.fouten.join(' ') };
        const plan = uit.plan;

        /* Momenten: per groep één, op de gekozen dag. Een vaste dag die er niet
           is (Kerst op een andere datum) valt terug op op-maat. */
        let order = ordergroep(plan.regels);
        const momentPer = new Map<string, string>();
        const zoek = async (groep: string, vasteDag: boolean): Promise<string> => {
            const sleutel = `${groep}|${vasteDag}`;
            const al = momentPer.get(sleutel);
            if (al) return al;
            let id = await momentVoor(sb, s.orgId, groep, inv.datum, vasteDag ? null : inv.tijd, vasteDag);
            if (!id) {
                meldingen.push(`Op ${dagInWoorden(inv.datum)} is er geen vaste afhaaldag voor ${groep}; de bestelling staat als eigen afspraak in de agenda.`);
                id = await zoek(OP_MAAT_GROEP, false);
            }
            momentPer.set(sleutel, id);
            return id;
        };
        const orderMoment = await zoek(order.groep, order.vasteDag);
        if (order.vasteDag && momentPer.get(`${OP_MAAT_GROEP}|false`) === orderMoment) order = { groep: OP_MAAT_GROEP, vasteDag: false };
        const afhaalTekst = `Afhalen op ${dagInWoorden(inv.datum)}${inv.tijd ? ` om ${inv.tijd}` : ''}`;
        const regels = [];
        for (const r of plan.regels) {
            const g = regelgroep(r, order);
            regels.push({ ...r, moment_id: await zoek(g.groep, g.vasteDag), afhaalmoment: afhaalTekst });
        }

        const totaal = plan.subtotaalCenten;
        const geplaatst = await store.plaatsOrder({
            orgId: s.orgId,
            sleutel: `handmatig-${inv.sleutel}`,
            token: randomBytes(32).toString('hex'),
            leverwijze: 'afhalen',
            momentId: orderMoment,
            contact: { naam: inv.klant.naam, email: inv.klant.email, telefoon: inv.klant.telefoon },
            adres: null,
            opmerking: handmatigeOpmerking(plan.regels, inv.opmerking),
            subtotaalCenten: totaal,
            leverkostenCenten: 0,
            totaalCenten: totaal,
            btwCenten: plan.btwCenten,
            terugUrl: '',
            regels,
            betaalwijze: 'bij_afhalen',
            nuTeBetalenCenten: 0,
            restCenten: inv.inDeKassa ? totaal : 0,
        });
        if (geplaatst.ok === false) return { error: OPSLAG_FOUT[geplaatst.code] ?? `Opslaan mislukt (${geplaatst.detail ?? geplaatst.code}).` };
        const o = geplaatst.waarde;

        /* Wat de databasefunctie niet kent: bron, wensen, de aanvraag, en per regel "prijs volgt" en de toelichting. */
        const extra: Record<string, unknown> = { bron: inv.bron, ingevoerd_door: s.user.id, wensen: inv.wensen, wensen_bron: 'handmatig' };
        if (inv.leadId) {
            const { data: lead } = await sb.from('leads').select('id').eq('id', inv.leadId).eq('organization_id', s.orgId).maybeSingle();
            const { data: bezet } = await sb.from('winkel_orders').select('nummer').eq('lead_id', inv.leadId).neq('id', o.id).maybeSingle();
            if (lead && !bezet) extra.lead_id = inv.leadId;
            else if (bezet) meldingen.push(`De aanvraag hangt al aan bestelling ${bezet.nummer}; deze bestelling is er niet aan gekoppeld.`);
        }
        const { error: eErr } = await sb.from('winkel_orders').update(extra).eq('id', o.id);
        if (eErr) return { error: `Bestelling ${o.nummer} staat erin, maar de details opslaan mislukte: ${eErr.message}` };

        const opgeslagen = await store.laadRegels(o.id);
        for (let i = 0; i < opgeslagen.length && i < plan.regels.length; i++) {
            const p = plan.regels[i]!;
            if (!p.prijs_volgt && !p.toelichting) continue;
            await sb.from('winkel_order_regels').update({ prijs_volgt: p.prijs_volgt, toelichting: p.toelichting }).eq('id', opgeslagen[i]!.id);
        }

        const b = await store.bevestigBetaling(o.id, { trnref: null, centen: 0, methode: inv.inDeKassa ? 'bij_afhalen' : BUITEN_KASSA });
        if (b !== 'betaald' && b !== 'al_betaald') return { error: b === 'vol' ? OPSLAG_FOUT.WK001! : `Bestelling ${o.nummer} staat erin, maar bevestigen mislukte.` };

        const bijgewerkt = (await store.vindOrderOpToken(s.orgId, o.token)) ?? { ...o, status: 'betaald' as const };
        const pl = await plaatsBestelling(store, tenant, bijgewerkt);
        if (pl.fout) meldingen.push(`In de agenda zetten lukte niet: ${pl.fout}. Probeer "Opnieuw plaatsen" in de vakjes.`);

        revalidatePath('/verkoop/webshop');
        revalidatePath('/verkoop/kerst');
        return { data: { orderId: o.id, nummer: o.nummer, totaalCenten: totaal, prijsVolgt: plan.prijsVolgt, plaatsing: pl.status, let_op: meldingen } };
    } catch (e) {
        console.error('[invoeren] mislukt:', e instanceof Error ? e.message : e);
        return { error: e instanceof Error ? e.message : 'Er ging iets mis bij het opslaan.' };
    }
}

/**
 * Een prijs voor een regel op "prijs volgt". Rekent de order opnieuw uit; bij
 * een order die de kassa afrekent gaat het verschil bij het bedrag dat de
 * kassa vraagt. Niet meer nadat de kassa al heeft afgerekend.
 */
export async function vulRegelPrijsIn(input: unknown): Promise<ActionResult<{ totaalCenten: number }>> {
    const parsed = z.object({ regelId: z.coerce.number().int().positive(), stukCenten: z.number().int().min(0).max(10_000_000) }).safeParse(input);
    if (!parsed.success) return { error: 'Vul een geldige prijs in' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };

    const { data: r } = await s.supabase.from('winkel_order_regels')
        .select('id, order_id, aantal, bedrag_cents, btw_pct, btw_cents, prijs_volgt, event_id, winkel_orders!inner(id, organization_id, subtotaal_cents, totaal_cents, btw_cents, rest_cents, rest_betaald_at, betaalmethode, status)')
        .eq('id', parsed.data.regelId).eq('organization_id', s.orgId).maybeSingle();
    if (!r) return { error: 'Regel niet gevonden' };
    if (!r.prijs_volgt) return { error: 'Deze regel heeft al een prijs.' };
    const o = r.winkel_orders as unknown as { id: number; subtotaal_cents: number; totaal_cents: number; btw_cents: Record<string, number>; rest_cents: number; rest_betaald_at: string | null; betaalmethode: string | null; status: string };
    if (o.rest_betaald_at) return { error: 'De kassa heeft deze bestelling al afgerekend. Pas het bedrag daar aan.' };

    const uit = vulPrijsIn(
        { id: r.id, aantal: r.aantal, bedrag_cents: r.bedrag_cents, btw_pct: r.btw_pct, btw_cents: r.btw_cents, prijs_volgt: r.prijs_volgt },
        parsed.data.stukCenten,
        { ...o, btw_cents: o.btw_cents ?? {}, inDeKassa: o.betaalmethode !== BUITEN_KASSA },
    );
    const sb = createServiceSupabase();
    const { error: rErr } = await sb.from('winkel_order_regels').update(uit.regel).eq('id', r.id).eq('prijs_volgt', true);
    if (rErr) return { error: rErr.message };
    const { error: oErr } = await sb.from('winkel_orders').update(uit.order).eq('id', o.id);
    if (oErr) return { error: oErr.message };

    /* De opmerking zei "prijs volgt"; het event telt zijn omzet uit de orders. Opnieuw plaatsen telt alles bij. */
    const { data: orgRij } = await s.supabase.from('organizations').select('slug').eq('id', s.orgId).maybeSingle();
    const store = maakSupabaseStore();
    const tenant = orgRij?.slug ? await store.laadTenant(orgRij.slug) : null;
    const { data: tok } = await sb.from('winkel_orders').select('token').eq('id', o.id).maybeSingle();
    const order = tok?.token ? await store.vindOrderOpToken(s.orgId, tok.token as string) : null;
    if (tenant && order && order.status === 'betaald') await plaatsBestelling(store, tenant, order);

    revalidatePath('/verkoop/webshop');
    revalidatePath('/verkoop/kerst');
    return { data: { totaalCenten: uit.order.totaal_cents } };
}

/** Aanvragen om aan te koppelen: de nieuwste, met een e-mailadres om op te herkennen. */
export async function zoekAanvragen(input: unknown): Promise<ActionResult<{ id: number; naam: string; email: string | null; telefoon: string | null; created_at: string }[]>> {
    const parsed = z.object({ zoek: z.string().trim().max(120).default('') }).safeParse(input);
    if (!parsed.success) return { error: 'validation' };
    const s = await ingelogdMetOrg();
    if (!s) return { error: 'unauthorized' };
    let q = s.supabase.from('leads').select('id, naam, email, telefoon, created_at').eq('organization_id', s.orgId).order('created_at', { ascending: false }).limit(8);
    const z2 = parsed.data.zoek.replace(/[%,()]/g, ' ').trim();
    if (z2) q = q.or(`naam.ilike.%${z2}%,email.ilike.%${z2}%,telefoon.ilike.%${z2}%`);
    const { data, error } = await q;
    if (error) return { error: error.message };
    return { data: (data ?? []) as { id: number; naam: string; email: string | null; telefoon: string | null; created_at: string }[] };
}
