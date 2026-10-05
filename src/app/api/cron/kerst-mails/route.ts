/**
 * Dagelijkse cron: de Kerst-Box-mails die vandaag moeten gaan.
 *
 *   navraag      "weet ik nog niet precies" — vijf dagen vóór het afhalen
 *   herinnering  de dag vóór het afhalen
 *
 * Om 09:00 UTC = 10:00 in december (Europe/Amsterdam, wintertijd). Alleen
 * Kerst-orders (lead_id gezet) op 'betaald', niet opgehaald; elke mail één
 * keer per order (navraag_verstuurd_at / herinnering_verstuurd_at). Een
 * mislukte mail wordt niet gemarkeerd en gaat morgen opnieuw — voor de
 * herinnering is morgen te laat, dus die staat in het Kerst-scherm als open.
 *
 * Beveiliging: CRON_SECRET via de Authorization-header, zoals de andere crons.
 */
import { NextResponse } from 'next/server';
import { createServiceSupabase } from '@/lib/supabase-server';
import { kerstMailsVoorVandaag } from '@/lib/winkel/kerst';
import { stuurKerstMail, veldenUitOrder } from '@/lib/winkel/kerstMail';

export const runtime = 'nodejs';
export const maxDuration = 300;

function isAuthorized(req: Request): boolean {
    const auth = req.headers.get('authorization') ?? '';
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;
    return auth === `Bearer ${secret}`;
}

interface Rij {
    id: number;
    organization_id: string;
    nummer: string;
    status: string;
    contact_naam: string;
    contact_email: string;
    opmerking: string | null;
    totaal_cents: number;
    aantal_onzeker: boolean;
    navraag_verstuurd_at: string | null;
    herinnering_verstuurd_at: string | null;
    winkel_order_regels: { slug: string; aantal: number; klaar_op: string; opgehaald_at: string | null }[];
}

async function draai(req: Request) {
    if (!isAuthorized(req)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    const sb = createServiceSupabase();
    const nu = new Date();

    const { data, error } = await sb
        .from('winkel_orders')
        .select('id, organization_id, nummer, status, contact_naam, contact_email, opmerking, totaal_cents, aantal_onzeker, navraag_verstuurd_at, herinnering_verstuurd_at, winkel_order_regels(slug, aantal, klaar_op, opgehaald_at)')
        .not('lead_id', 'is', null)
        .eq('status', 'betaald')
        .or('herinnering_verstuurd_at.is.null,and(aantal_onzeker.eq.true,navraag_verstuurd_at.is.null)');
    if (error) {
        console.error('[cron kerst-mails] laden mislukt:', error.message);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const antwoordAan = new Map<string, string | null>();
    const replyTo = async (orgId: string) => {
        if (!antwoordAan.has(orgId)) {
            const { data: s } = await sb.from('settings').select('email').eq('organization_id', orgId).maybeSingle();
            antwoordAan.set(orgId, s?.email ?? null);
        }
        return antwoordAan.get(orgId) ?? null;
    };

    const uit = { navraag: 0, herinnering: 0, mislukt: [] as string[] };
    for (const o of (data ?? []) as Rij[]) {
        const regels = o.winkel_order_regels ?? [];
        if (!regels.length) continue;
        const v = veldenUitOrder(o, regels);
        const moet = kerstMailsVoorVandaag({
            status: o.status,
            afhaaldag: v.afhaaldag,
            aantal_onzeker: o.aantal_onzeker,
            navraag_verstuurd_at: o.navraag_verstuurd_at,
            herinnering_verstuurd_at: o.herinnering_verstuurd_at,
            opgehaald: regels.every((r) => r.opgehaald_at),
        }, nu);

        for (const soort of ['navraag', 'herinnering'] as const) {
            if (!moet[soort]) continue;
            const m = await stuurKerstMail(soort, o.contact_email, v, await replyTo(o.organization_id));
            if (!m.success) { uit.mislukt.push(`${o.nummer} ${soort}: ${m.error ?? 'onbekend'}`); continue; }
            await sb.from('winkel_orders').update({ [`${soort}_verstuurd_at`]: nu.toISOString() }).eq('id', o.id);
            uit[soort]++;
        }
    }

    if (uit.mislukt.length) console.warn('[cron kerst-mails] niet verstuurd:', uit.mislukt.join('; '));
    return NextResponse.json({ bekeken: data?.length ?? 0, navraag: uit.navraag, herinnering: uit.herinnering, mislukt: uit.mislukt.length });
}

/* Vercel Cron roept GET aan; POST voor handmatig draaien. */
export const GET = draai;
export const POST = draai;
