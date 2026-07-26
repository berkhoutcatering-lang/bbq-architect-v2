/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/leveranciers/[id]/mutations/approve
 *
 * Body: { mutationIds: uuid[] }
 *
 * Generieke approve voor alle bronnen (extension / email_inbox / invoice / manual)
 * gescoped op één leverancier. Maakt master_products aan waar nodig en commit
 * naar supplier_prices.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { dbNormalize } from '@/lib/pricelistMatch';
import { inferApprovalPriceBasis } from '@/lib/ingredientPricing';

export const runtime = 'nodejs';
export const maxDuration = 120;

interface MutationRow {
    id: string;
    organization_id: string;
    leverancier: string | null;
    leverancier_id: number | null;
    parsed_naam: string;
    parsed_eenheid: string | null;
    parsed_categorie: string | null;
    parsed_prijs: number;
    master_product_id: number | null;
    status: string;
}

export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
    const t0 = Date.now();
    const { id } = await context.params;
    const leverancierId = Number(id);
    if (!Number.isInteger(leverancierId)) return NextResponse.json({ error: 'invalid id' }, { status: 400 });

    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const body = await req.json().catch(() => null);
    const mutationIds: string[] = Array.isArray(body?.mutationIds)
        ? body.mutationIds.filter((x: any) => typeof x === 'string')
        : [];
    if (mutationIds.length === 0 || mutationIds.length > 2000) {
        return NextResponse.json({ error: 'mutationIds: 1..2000 verplicht' }, { status: 400 });
    }

    const { data: memberData } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    const orgId = memberData?.organization_id;
    if (!orgId) return NextResponse.json({ error: 'Geen organisatie' }, { status: 400 });

    /* Resolve leverancier naam */
    const { data: lev } = await supabase
        .from('leveranciers')
        .select('id, naam')
        .eq('id', leverancierId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (!lev) return NextResponse.json({ error: 'leverancier niet gevonden' }, { status: 404 });

    /* Load mutations — scoped op leverancier_id */
    const { data: muts, error: loadErr } = await supabase
        .from('org_price_mutations')
        .select('id, organization_id, leverancier, leverancier_id, parsed_naam, parsed_eenheid, parsed_categorie, parsed_prijs, master_product_id, status')
        .in('id', mutationIds)
        .eq('leverancier_id', leverancierId);

    if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 });

    const wrongOrg = (muts || []).find(m => m.organization_id !== orgId);
    if (wrongOrg) return NextResponse.json({ error: 'forbidden' }, { status: 403 });

    const pendingMuts = (muts || []).filter(m => m.status === 'pending') as MutationRow[];
    if (pendingMuts.length === 0) {
        return NextResponse.json({ ok: true, approved: 0, message: 'geen pending mutations' });
    }

    let approved = 0;
    let createdMasters = 0;
    let priceRows = 0;
    const errors: string[] = [];
    /* Mapping mutationId → master_product_id voor freshly-created masters,
       zodat UI aliases kan opslaan voor net-aangemaakte producten. */
    const freshMasters: Array<{ mutationId: string; masterProductId: number }> = [];

    /* Stap 1: Maak masters voor unmatched */
    const unmatched = pendingMuts.filter(m => !m.master_product_id);
    if (unmatched.length > 0) {
        const byNorm = new Map<string, MutationRow>();
        for (const m of unmatched) byNorm.set(dbNormalize(m.parsed_naam), m);

        const newMasterRows = Array.from(byNorm.values()).map(m => ({
            organization_id: orgId,
            naam: m.parsed_naam,
            categorie: m.parsed_categorie || null,
            standaard_eenheid: m.parsed_eenheid || 'stuks',
            standaard_leverancier: lev.naam,
            uit_assortiment: false,
        }));

        for (let i = 0; i < newMasterRows.length; i += 500) {
            const batch = newMasterRows.slice(i, i + 500);
            const { data: upserted, error: upErr } = await supabase
                .from('master_products')
                .upsert(batch, {
                    onConflict: 'organization_id,naam_normalized',
                    ignoreDuplicates: false,
                })
                .select('id, naam_normalized');

            if (upErr) {
                console.error('[approve] Master upsert FAIL:', JSON.stringify({
                    code: upErr.code,
                    message: upErr.message,
                    details: upErr.details,
                    hint: upErr.hint,
                    batch_size: batch.length,
                    first_naam: batch[0]?.naam,
                    org_id: orgId,
                    lev_naam: lev.naam,
                }));
                return NextResponse.json({
                    error: 'Master upsert: ' + (upErr.message || 'unknown'),
                    code: upErr.code,
                    details: upErr.details,
                    hint: upErr.hint,
                }, { status: 500 });
            }

            const masterByNorm = new Map<string, number>();
            for (const r of (upserted || [])) masterByNorm.set(r.naam_normalized, r.id);
            createdMasters += upserted?.length || 0;

            for (const m of unmatched) {
                if (m.master_product_id) continue;
                const masterId = masterByNorm.get(dbNormalize(m.parsed_naam));
                if (masterId) {
                    m.master_product_id = masterId;
                    freshMasters.push({ mutationId: m.id, masterProductId: masterId });
                }
            }
        }
    }

    /* Stap 2: Bulk supplier_prices write — eerst deactiveer oude, dan insert nieuwe */
    const datum = new Date().toISOString().slice(0, 10);

    /* Group by master_product_id om deactivate-old te kunnen bulk-doen */
    const newPriceRows: any[] = [];
    const masterIdsToDeactivate = new Set<number>();
    const seenKeys = new Set<string>();

    for (const m of pendingMuts) {
        if (!m.master_product_id) {
            errors.push(`${m.parsed_naam}: master niet aanmakbaar (geen naam?)`);
            continue;
        }
        const eenheid = (m.parsed_eenheid || 'stuks').trim();
        const eenhLower = eenheid.toLowerCase();
        /* Fix: pakhoeveelheden ("doos 5 kg", "2,5 kg", "12 stuks") NIET als
           per-eenheid prijs wegschrijven — dat corrumpeerde prijs_per_kg. */
        const { prijs_per_kg: prijsPerKg, prijs_per_stuk: prijsPerStuk } = inferApprovalPriceBasis(eenhLower, m.parsed_prijs);

        /* Dedup binnen batch */
        const key = `${m.master_product_id}|${eenhLower}|${m.parsed_prijs}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);

        masterIdsToDeactivate.add(m.master_product_id);
        newPriceRows.push({
            organization_id: orgId,
            master_product_id: m.master_product_id,
            leverancier: lev.naam,
            product_naam: m.parsed_naam,
            prijs: m.parsed_prijs,
            eenheid,
            categorie: m.parsed_categorie || null,
            datum,
            actief: true,
            prijs_per_kg: prijsPerKg,
            prijs_per_stuk: prijsPerStuk,
        });
    }

    /* Bulk-deactiveer oude actieve rijen voor deze masters bij deze leverancier */
    if (masterIdsToDeactivate.size > 0) {
        const ids = Array.from(masterIdsToDeactivate);
        for (let i = 0; i < ids.length; i += 500) {
            const chunk = ids.slice(i, i + 500);
            await supabase
                .from('supplier_prices')
                .update({ actief: false })
                .eq('organization_id', orgId)
                .eq('leverancier', lev.naam)
                .in('master_product_id', chunk)
                .eq('actief', true);
        }
    }

    /* Bulk-insert nieuwe prijzen. Bij duplicate-key (23505) NIET negeren —
       want stap hierboven heeft de bestaande rij net gedeactiveerd. Negeren
       liet 'm inactief achter → product zonder actieve prijs (de beef-club-bug,
       2026-07-26). Daarom: op 23505 per rij REACTIVEREN op de natuurlijke sleutel
       (org+leverancier+master+eenheid+prijs), of alsnog inserten als hij echt
       nieuw is. Zo eindigt elke goedgekeurde prijs gegarandeerd op actief. */
    async function reactivateOrInsert(row: any) {
        const { data: upd, error: updErr } = await supabase
            .from('supplier_prices')
            .update({
                actief: true,
                datum: row.datum,
                product_naam: row.product_naam,
                categorie: row.categorie,
                prijs_per_kg: row.prijs_per_kg,
                prijs_per_stuk: row.prijs_per_stuk,
            })
            .eq('organization_id', orgId)
            .eq('leverancier', row.leverancier)
            .eq('master_product_id', row.master_product_id)
            .eq('eenheid', row.eenheid)
            .eq('prijs', row.prijs)
            .select('id');
        if (updErr) { errors.push('Reactivate: ' + updErr.message); return; }
        if (!upd || upd.length === 0) {
            const { error: insErr } = await supabase.from('supplier_prices').insert(row);
            if (insErr && insErr.code !== '23505') errors.push('Reactivate-insert: ' + insErr.message);
        }
    }

    for (let i = 0; i < newPriceRows.length; i += 500) {
        const chunk = newPriceRows.slice(i, i + 500);
        const { error: insErr } = await supabase.from('supplier_prices').insert(chunk);
        if (insErr) {
            if (insErr.code === '23505') {
                for (const row of chunk) await reactivateOrInsert(row);
                priceRows += chunk.length;
            } else {
                errors.push('Bulk insert: ' + insErr.message);
            }
        } else {
            priceRows += chunk.length;
        }
    }

    /* Mark all mutations approved */
    const idsToMark = pendingMuts.map(m => m.id);
    for (let i = 0; i < idsToMark.length; i += 500) {
        const chunk = idsToMark.slice(i, i + 500);
        await supabase
            .from('org_price_mutations')
            .update({
                status: 'approved',
                reviewed_by: user.id,
                reviewed_at: new Date().toISOString(),
            })
            .in('id', chunk);
        approved += chunk.length;
    }

    /* Update leverancier products_count */
    const { count } = await supabase
        .from('supplier_prices')
        .select('master_product_id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('leverancier', lev.naam)
        .eq('actief', true);

    await supabase
        .from('leveranciers')
        .update({ products_count: count || 0 })
        .eq('id', leverancierId);

    return NextResponse.json({
        ok: true,
        approved,
        createdMasters,
        priceRows,
        freshMasters,
        errors: errors.slice(0, 10),
        elapsedMs: Date.now() - t0,
    });
}
