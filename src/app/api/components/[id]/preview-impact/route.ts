/* ═══════════════════════════════════════════════════════════════
   POST /api/components/[id]/preview-impact
   Bucket-C GP-4 (2026-05-25): Live foodcost-impact preview.
   Berekent voor een hypothetische nieuwe base_cost_cents het effect
   op alle gerechten waar deze component in zit. Geen DB-write.
   Returnt sorted impact-lijst voor FoodcostImpactModal.
   ═══════════════════════════════════════════════════════════════ */

import { NextRequest, NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase-server';
import { costAtUseCents } from '@/lib/unitPrice';

interface GerechtImpact {
    gerecht_id: string;
    naam: string;
    old_total_cost_cents: number;
    new_total_cost_cents: number;
    diff_cents: number;
    /* Marge alleen berekenbaar als `gerechten.verkoopprijs` bekend is. Anders null. */
    verkoopprijs_eur: number | null;
    old_margin_pct: number | null;
    new_margin_pct: number | null;
    margin_diff_pct: number | null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
    const { id } = await ctx.params;
    const componentId = Number(id);
    if (!Number.isInteger(componentId) || componentId <= 0) {
        return NextResponse.json({ error: 'Ongeldig component-id' }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body.new_base_cost_cents !== 'number' || !Number.isInteger(body.new_base_cost_cents) || body.new_base_cost_cents < 0) {
        return NextResponse.json({ error: 'new_base_cost_cents verplicht (integer ≥ 0)' }, { status: 400 });
    }
    const newBaseCostCents: number = body.new_base_cost_cents;

    const supabase = await createServerSupabase();

    /* Auth + org-scoping */
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: 'Niet ingelogd' }, { status: 401 });

    const { data: membership } = await supabase
        .from('organization_members').select('organization_id')
        .eq('user_id', user.id).eq('status', 'active').limit(1).maybeSingle();
    if (!membership) return NextResponse.json({ error: 'Geen organisatie' }, { status: 403 });
    const orgId = membership.organization_id as string;

    /* 1. Component-base-cost ophalen (huidige) */
    const { data: comp, error: compErr } = await supabase
        .from('components')
        .select('*')
        .eq('id', componentId)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (compErr) return NextResponse.json({ error: compErr.message }, { status: 500 });
    if (!comp) return NextResponse.json({ error: 'Component niet gevonden' }, { status: 404 });

    const oldBaseCostCents = comp.base_cost_cents as number;
    const baseQuantity = comp.base_quantity as number;

    /* 2. Alle gerecht_components-rijen met dit component_id ophalen */
    const { data: gcRows, error: gcErr } = await supabase
        .from('gerecht_components')
        /* `gerechten` heeft alleen `verkoopprijs` — een kolom `prijs` bestaat
           niet en liet PostgREST de hele query weigeren ("column gerechten_1.prijs
           does not exist"), waardoor het bewerk-scherm een rode foutmelding gaf. */
        .select('gerecht_id, quantity_used, cost_at_use_cents, gerechten(id, naam, verkoopprijs)')
        .eq('component_id', componentId)
        .eq('organization_id', orgId);
    if (gcErr) return NextResponse.json({ error: gcErr.message }, { status: 500 });

    if (!gcRows || gcRows.length === 0) {
        return NextResponse.json({
            component: { id: comp.id, name: comp.name, old_base_cost_cents: oldBaseCostCents, new_base_cost_cents: newBaseCostCents },
            affected_count: 0,
            impacts: [],
        });
    }

    /* 3. Per gerecht: aggregeer oude + nieuwe totaal-kostprijs.
          Eén gerecht kan meerdere rijen hebben met DIT component_id (zelden,
          maar mogelijk). Per gerecht alle cost_at_use_cents sommeren én
          de nieuwe cost berekenen volgens de standaard-formule:
          cost_at_use_cents = (quantity_used / base_quantity) * base_cost_cents */
    interface GerechtRow {
        id: string;
        naam: string | null;
        verkoopprijs: number | null;
    }
    const perGerecht = new Map<string, {
        gerecht: GerechtRow;
        old_component_cost_cents: number;
        new_component_cost_cents: number;
    }>();

    for (const row of gcRows) {
        const gerecht = row.gerechten as unknown as GerechtRow | null;
        if (!gerecht) continue;
        const qtyUsed = Number(row.quantity_used ?? 0);
        const oldCostAtUse = Number(row.cost_at_use_cents ?? 0);
        /* Zelfde formule als de trigger en de PATCH-recompute (gedeelde canon),
           inclusief eenheid-omrekening en snijverlies. Anders toont deze modal
           andere bedragen dan er daadwerkelijk wordt opgeslagen. */
        const newCostAtUse = costAtUseCents({
            quantityUsed: qtyUsed,
            usedUnit: (row as { unit?: string }).unit,
            baseQuantity,
            baseUnit: (comp as { base_unit?: string }).base_unit,
            baseCostCents: newBaseCostCents,
            yieldFactor: (comp as { yield_factor?: number }).yield_factor,
        });

        const existing = perGerecht.get(gerecht.id);
        if (existing) {
            existing.old_component_cost_cents += oldCostAtUse;
            existing.new_component_cost_cents += newCostAtUse;
        } else {
            perGerecht.set(gerecht.id, {
                gerecht,
                old_component_cost_cents: oldCostAtUse,
                new_component_cost_cents: newCostAtUse,
            });
        }
    }

    /* 4. We hebben de DELTA per gerecht (alleen deze component-bijdrage).
          Voor margin-berekening hebben we ook de totale gerecht-kost nodig.
          Trick: total_cost_diff = new_component_cost - old_component_cost.
          Voor margin: we nemen huidige verkoopprijs. */
    const impacts: GerechtImpact[] = [];
    for (const [gid, data] of perGerecht.entries()) {
        const diffCents = data.new_component_cost_cents - data.old_component_cost_cents;
        const verkoopEur = Number(data.gerecht.verkoopprijs ?? 0);
        const verkoopCents = Math.round(verkoopEur * 100);

        /* Voor margin-pct hebben we totale gerecht-kost nodig. We fetchen die
           niet hier (extra query per gerecht is duur); ipv tonen we de delta.
           Frontend kan totale gerecht.kostprijs_pp combineren met diff voor
           accurate margin-shift indien beschikbaar. */
        const marginDiffPct = verkoopCents > 0
            ? Math.round((diffCents / verkoopCents) * -100 * 10) / 10  // negative = marge gaat omlaag
            : null;

        impacts.push({
            gerecht_id: gid,
            naam: data.gerecht.naam ?? 'Onbekend gerecht',
            old_total_cost_cents: data.old_component_cost_cents,
            new_total_cost_cents: data.new_component_cost_cents,
            diff_cents: diffCents,
            verkoopprijs_eur: verkoopEur > 0 ? verkoopEur : null,
            old_margin_pct: null, // niet berekenbaar zonder totale kost — UI vult in indien beschikbaar
            new_margin_pct: null,
            margin_diff_pct: marginDiffPct,
        });
    }

    /* 5. Sorteer op grootste absolute impact (cent-delta) — top items eerst */
    impacts.sort((a, b) => Math.abs(b.diff_cents) - Math.abs(a.diff_cents));

    return NextResponse.json({
        component: {
            id: comp.id,
            name: comp.name,
            old_base_cost_cents: oldBaseCostCents,
            new_base_cost_cents: newBaseCostCents,
            base_quantity: baseQuantity,
            base_unit: comp.base_unit,
        },
        affected_count: impacts.length,
        impacts,
        /* Helper-totals voor UI summary */
        totals: {
            total_old_cost_cents: impacts.reduce((s, i) => s + i.old_total_cost_cents, 0),
            total_new_cost_cents: impacts.reduce((s, i) => s + i.new_total_cost_cents, 0),
            total_diff_cents: impacts.reduce((s, i) => s + i.diff_cents, 0),
        },
    });
}
