/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/inbox/[id]/approve
 *
 * Body: { mutationIds: uuid[] }
 *
 * Markeert de gegeven mutations als 'approved' en commit ze naar
 * `supplier_prices` (insert of reactivate). Maakt nieuwe `master_products`
 * aan voor mutations zonder master-match.
 *
 * Pillar #2 — alleen via deze route komt prijs-data écht in supplier_prices
 * terecht. Geen pad er omheen.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { dbNormalize } from '@/lib/pricelistMatch';

export const runtime = 'nodejs';

interface MutationRow {
    id: string;
    organization_id: string;
    leverancier: string | null;
    parsed_naam: string;
    parsed_eenheid: string | null;
    parsed_categorie: string | null;
    parsed_prijs: number;
    master_product_id: number | null;
    status: string;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const t0 = Date.now();
    const { id: inboxId } = await context.params;

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const mutationIds: string[] = Array.isArray(body?.mutationIds) ? body.mutationIds.filter((x: any) => typeof x === 'string') : [];
    if (mutationIds.length === 0 || mutationIds.length > 500) {
        return NextResponse.json({ error: 'mutationIds: 1..500 verplicht' }, { status: 400 });
    }

    /* Re-derive orgId via session — nooit van client vertrouwen */
    const { data: memberData } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = memberData?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    /* Load mutations — RLS dwingt org-scope af, double-check we org_id matchen */
    const { data: muts, error: loadErr } = await supabase
        .from('org_price_mutations')
        .select('id, organization_id, leverancier, parsed_naam, parsed_eenheid, parsed_categorie, parsed_prijs, master_product_id, status, source_ref_id')
        .in('id', mutationIds);

    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });
    if (!muts?.length) return NextResponse.json({ error: 'Geen mutations gevonden' }, { status: 404 });

    /* Veiligheidschecks */
    const wrongOrg = muts.find(m => m.organization_id !== orgId);
    if (wrongOrg) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    /* Optional: alle mutations moeten bij dezelfde inbox horen */
    const wrongInbox = muts.find(m => m.source_ref_id !== inboxId);
    if (wrongInbox) return NextResponse.json({ error: 'mutation hoort niet bij deze inbox' }, { status: 400 });

    const pendingMuts = muts.filter(m => m.status === 'pending') as MutationRow[];

    let approved = 0;
    let skippedAlreadyDone = muts.length - pendingMuts.length;
    let createdMasters = 0;
    let priceRows = 0;
    const errors: string[] = [];

    /* Stap 1: voor mutations zonder master_product_id — maak master aan via upsert */
    const unmatchedMuts = pendingMuts.filter(m => !m.master_product_id);
    if (unmatchedMuts.length > 0) {
        /* Dedup op normalized naam — meerdere mutations kunnen naar zelfde nieuwe master wijzen */
        const byNorm = new Map<string, MutationRow>();
        for (const m of unmatchedMuts) byNorm.set(dbNormalize(m.parsed_naam), m);

        const newMasterRows = Array.from(byNorm.values()).map(m => ({
            organization_id: orgId,
            naam: m.parsed_naam,
            categorie: m.parsed_categorie || null,
            standaard_eenheid: m.parsed_eenheid || 'stuks',
            standaard_leverancier: m.leverancier || null,
            uit_assortiment: false,
        }));

        const { data: upserted, error: upErr } = await supabase
            .from('master_products')
            .upsert(newMasterRows, {
                onConflict: 'organization_id,naam_normalized',
                ignoreDuplicates: false,
            })
            .select('id, naam_normalized');

        if (upErr) return NextResponse.json({ error: 'Master upsert: ' + upErr.message }, { status: 500 });

        const masterByNorm = new Map<string, number>();
        for (const r of (upserted || [])) masterByNorm.set(r.naam_normalized, r.id);
        createdMasters = upserted?.length || 0;

        /* Wire master_product_id terug naar in-memory mutation rows */
        for (const m of unmatchedMuts) {
            const id = masterByNorm.get(dbNormalize(m.parsed_naam));
            if (id) m.master_product_id = id;
        }
    }

    /* Stap 2: voor elke mutation met master_product_id en leverancier — schrijf naar supplier_prices */
    for (const m of pendingMuts) {
        if (!m.master_product_id || !m.leverancier) {
            errors.push(`${m.parsed_naam}: ontbreekt master of leverancier`);
            continue;
        }

        const eenheid = m.parsed_eenheid || 'stuks';
        const datum = new Date().toISOString().slice(0, 10);
        const eenhLower = eenheid.toLowerCase();
        const prijsPerKg = (eenhLower.includes('kg') || eenhLower === 'kilo') ? m.parsed_prijs : null;
        const prijsPerStuk = (eenhLower === 'stuks' || eenhLower === 'stuk' || eenhLower.includes('pak')) ? m.parsed_prijs : null;

        /* Reactivate-or-insert: zoek eerst exacte match (naam + eenheid + prijs) */
        const { data: existing } = await supabase
            .from('supplier_prices')
            .select('id, actief')
            .eq('organization_id', orgId)
            .eq('leverancier', m.leverancier)
            .eq('master_product_id', m.master_product_id)
            .eq('eenheid', eenheid)
            .eq('prijs', m.parsed_prijs)
            .limit(1)
            .maybeSingle();

        let supplierPriceId: number | null = null;
        if (existing) {
            if (!existing.actief) {
                await supabase.from('supplier_prices').update({ actief: true, datum }).eq('id', existing.id);
            }
            supplierPriceId = existing.id;
        } else {
            /* Deactiveer oude actieve rijen voor zelfde (master, leverancier, eenheid) — maar
               andere prijs */
            await supabase
                .from('supplier_prices')
                .update({ actief: false })
                .eq('organization_id', orgId)
                .eq('leverancier', m.leverancier)
                .eq('master_product_id', m.master_product_id)
                .eq('eenheid', eenheid)
                .eq('actief', true);

            const { data: ins, error: insErr } = await supabase
                .from('supplier_prices')
                .insert({
                    organization_id: orgId,
                    master_product_id: m.master_product_id,
                    leverancier: m.leverancier,
                    product_naam: m.parsed_naam,
                    prijs: m.parsed_prijs,
                    eenheid,
                    categorie: m.parsed_categorie || null,
                    datum,
                    actief: true,
                    prijs_per_kg: prijsPerKg,
                    prijs_per_stuk: prijsPerStuk,
                })
                .select('id')
                .single();

            if (insErr) {
                errors.push(`${m.parsed_naam}: ${insErr.message}`);
                continue;
            }
            supplierPriceId = ins?.id ?? null;
            priceRows++;
        }

        /* Mark mutation approved */
        const { error: updErr } = await supabase
            .from('org_price_mutations')
            .update({
                status: 'approved',
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
                committed_supplier_price_id: supplierPriceId,
                master_product_id: m.master_product_id,
            })
            .eq('id', m.id);

        if (updErr) errors.push(`${m.parsed_naam}: status-update faal — ${updErr.message}`);
        else approved++;
    }

    return NextResponse.json({
        ok: true,
        approved,
        skippedAlreadyDone,
        createdMasters,
        priceRows,
        errors,
        elapsedMs: Date.now() - t0,
    });
}
