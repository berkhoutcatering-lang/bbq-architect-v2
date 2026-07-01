/* /api/financien/bank — bankafschrift import + afletteren
 *
 * POST   { content }            → parse CAMT.053/MT940, dedup-insert transacties
 * GET                           → transacties + match-suggesties + open facturen
 * PATCH  { id, action, factuur_id }
 *          action 'match'   → koppel factuur, zet factuur op 'betaald'
 *          action 'ignore'  → markeer transactie als genegeerd
 *          action 'unmatch' → ontkoppel, zet factuur terug op 'verzonden'
 *
 * Geen AI in de loop — parsing + matching zijn pure functies.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { parseBankStatement, matchTransactions, type MatchFactuur } from '@/lib/bankStatement';

export const runtime = 'nodejs';

async function resolveOrg(supabase: Awaited<ReturnType<typeof createServerSupabase>>) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { error: 'Niet ingelogd', status: 401 as const };
    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return { error: 'Geen organisatie', status: 403 as const };
    return { orgId: membership.organization_id as string };
}

export async function POST(req: NextRequest) {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const body = await req.json().catch(() => null) as { content?: string } | null;
    if (!body?.content || typeof body.content !== 'string') {
        return NextResponse.json({ error: 'Geen bestandsinhoud ontvangen' }, { status: 400 });
    }

    let transacties;
    try {
        transacties = parseBankStatement(body.content);
    } catch (e) {
        return NextResponse.json({ error: (e as Error).message }, { status: 422 });
    }
    if (transacties.length === 0) {
        return NextResponse.json({ error: 'Geen transacties gevonden in het bestand' }, { status: 422 });
    }

    /* organization_id ALTIJD expliciet; dedup via unieke (org, dedup_key). */
    const rows = transacties.map(t => ({
        organization_id: org.orgId,
        datum: t.datum,
        bedrag: t.bedrag,
        tegenrekening: t.tegenrekening ?? null,
        tegennaam: t.tegennaam ?? null,
        omschrijving: t.omschrijving ?? null,
        bank_ref: t.bank_ref ?? null,
        dedup_key: t.dedup_key,
    }));
    const { data: inserted, error } = await supabase
        .from('bank_transacties')
        .upsert(rows, { onConflict: 'organization_id,dedup_key', ignoreDuplicates: true })
        .select('id');
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ geimporteerd: inserted?.length ?? 0, gevonden: transacties.length });
}

export async function GET() {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const [txResp, factResp] = await Promise.all([
        supabase.from('bank_transacties')
            .select('id, datum, bedrag, tegennaam, tegenrekening, omschrijving, status, matched_factuur_id')
            .eq('organization_id', org.orgId)
            .order('datum', { ascending: false })
            .limit(500),
        supabase.from('facturen')
            .select('id, nummer, client_naam, status, items')
            .eq('organization_id', org.orgId)
            .not('status', 'in', '("betaald","geannuleerd","concept")'),
    ]);
    if (txResp.error) return NextResponse.json({ error: txResp.error.message }, { status: 500 });

    const openFacturen = (factResp.data || []) as MatchFactuur[];
    const transacties = txResp.data || [];

    /* Suggesties berekenen voor nog-ongematchte binnenkomende transacties. */
    const ongematcht = transacties
        .filter(t => t.status === 'ongematcht' && Number(t.bedrag) > 0)
        .map(t => ({ datum: t.datum, bedrag: Number(t.bedrag), omschrijving: t.omschrijving || '', tegennaam: t.tegennaam || undefined, dedup_key: String(t.id) }));
    const suggesties = matchTransactions(ongematcht, openFacturen);
    const suggestieById = new Map(suggesties.map(s => [s.transactie.dedup_key, s]));

    const verrijkt = transacties.map(t => {
        const s = suggestieById.get(String(t.id));
        return {
            ...t,
            suggestie: s && s.confidence !== 'geen'
                ? { factuur_id: s.factuur_id, factuur_nummer: s.factuur_nummer, confidence: s.confidence, reden: s.reden }
                : null,
        };
    });

    return NextResponse.json({ transacties: verrijkt, open_facturen: openFacturen });
}

export async function PATCH(req: NextRequest) {
    const supabase = await createServerSupabase();
    const org = await resolveOrg(supabase);
    if ('error' in org) return NextResponse.json({ error: org.error }, { status: org.status });

    const body = await req.json().catch(() => null) as { id?: string; action?: string; factuur_id?: number } | null;
    if (!body?.id || !body.action) return NextResponse.json({ error: 'id + action verplicht' }, { status: 400 });

    if (body.action === 'match') {
        if (!body.factuur_id) return NextResponse.json({ error: 'factuur_id verplicht bij match' }, { status: 400 });
        const { error: e1 } = await supabase
            .from('bank_transacties')
            .update({ status: 'gematcht', matched_factuur_id: body.factuur_id })
            .eq('id', body.id).eq('organization_id', org.orgId);
        if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });
        const { error: e2 } = await supabase
            .from('facturen').update({ status: 'betaald' })
            .eq('id', body.factuur_id).eq('organization_id', org.orgId);
        if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    if (body.action === 'ignore') {
        const { error } = await supabase
            .from('bank_transacties').update({ status: 'genegeerd', matched_factuur_id: null })
            .eq('id', body.id).eq('organization_id', org.orgId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        return NextResponse.json({ ok: true });
    }

    if (body.action === 'unmatch') {
        /* Haal de gekoppelde factuur op om 'm terug te zetten naar verzonden. */
        const { data: tx } = await supabase
            .from('bank_transacties').select('matched_factuur_id')
            .eq('id', body.id).eq('organization_id', org.orgId).maybeSingle();
        const { error } = await supabase
            .from('bank_transacties').update({ status: 'ongematcht', matched_factuur_id: null })
            .eq('id', body.id).eq('organization_id', org.orgId);
        if (error) return NextResponse.json({ error: error.message }, { status: 500 });
        if (tx?.matched_factuur_id) {
            await supabase.from('facturen').update({ status: 'verzonden' })
                .eq('id', tx.matched_factuur_id).eq('organization_id', org.orgId);
        }
        return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Onbekende actie' }, { status: 400 });
}
