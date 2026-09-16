import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateVerbruik } from '@/lib/productie/validators';
import { applyStockDelta } from '@/lib/dal/stockMutation';
import { appendKdsAudit } from '@/lib/prep/auditLog';
import { eenheidFactor, normaliseerEenheid } from '@/lib/productie/eenheden';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * POST /api/productie/eenheid/[id]/verbruik — één fysieke eenheid afboeken.
 *
 * Eén zak = één mutatie: de eenheid gaat op verbruikt/afgeschreven/verkocht
 * (conditioneel, alleen vanuit op_voorraad — dubbel scannen boekt niet
 * dubbel af) en de inhoud gaat via increment_inventory_stock van het
 * voorraadproduct af, met partij_id erbij. Geen printer, geen partijstatus.
 */
export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    const delen = new URL(req.url).pathname.split('/').filter(Boolean);
    const id = delen[delen.lastIndexOf('eenheid') + 1] ?? '';
    if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Ongeldig id' }, { status: 400 });

    let body: unknown = {};
    try { body = await req.json(); } catch { /* lege body = verbruikt */ }
    const v = validateVerbruik(body ?? {});
    if (v.ok === false) return NextResponse.json({ error: v.error }, { status: 400 });

    const { data: e, error } = await supabase
        .from('voorraad_eenheden')
        .select('id, partij_id, code, inhoud, eenheid, status, productie_partijen(inventory_id, partijnummer, verpakking_eenheid)')
        .eq('id', id)
        .eq('organization_id', orgId)
        .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!e) return NextResponse.json({ error: 'Eenheid niet gevonden' }, { status: 404 });
    const rij = e as { id: string; partij_id: string; code: string; inhoud: number; eenheid: string; status: string; productie_partijen: { inventory_id: number | null; partijnummer: string; verpakking_eenheid: string } | { inventory_id: number | null; partijnummer: string; verpakking_eenheid: string }[] | null };
    const partij = Array.isArray(rij.productie_partijen) ? rij.productie_partijen[0] : rij.productie_partijen;
    if (rij.status !== 'op_voorraad') return NextResponse.json({ ok: true, alGedaan: true, status: rij.status, code: rij.code });

    const nu = new Date().toISOString();
    const nieuweStatus = v.data.reden;
    const { data: upd } = await supabase
        .from('voorraad_eenheden')
        .update({ status: nieuweStatus, verbruikt_at: nu, verbruikt_event_id: v.data.eventId, verbruikt_by_user_id: userId, verbruikt_notitie: v.data.notitie })
        .eq('id', id)
        .eq('organization_id', orgId)
        .eq('status', 'op_voorraad')
        .select('id')
        .maybeSingle();
    if (!upd) return NextResponse.json({ ok: true, alGedaan: true, code: rij.code });

    /* Voorraad: inhoud van de eenheid omrekenen naar de eenheid van het
       voorraadproduct. Best-effort — de eenheid is al afgeboekt; een
       mislukte mutatie komt in de audit. */
    let nieuweVoorraad: number | null = null;
    if (partij?.inventory_id) {
        const { data: inv } = await supabase.from('inventory').select('unit').eq('id', partij.inventory_id).maybeSingle();
        const van = normaliseerEenheid(rij.eenheid) ?? normaliseerEenheid(partij.verpakking_eenheid);
        const naar = normaliseerEenheid((inv as { unit: string } | null)?.unit) ?? van;
        const factor = van && naar ? eenheidFactor(van, naar) : null;
        if (factor != null) {
            nieuweVoorraad = await applyStockDelta(supabase, orgId, {
                inventoryId: partij.inventory_id,
                delta: -Number(rij.inhoud) * factor,
                type: nieuweStatus === 'afgeschreven' ? 'waste' : 'usage',
                note: `${nieuweStatus} ${rij.code}${v.data.notitie ? ` — ${v.data.notitie}` : ''}`,
                partijId: rij.partij_id,
            });
        }
    }

    await appendKdsAudit(supabase, {
        orgId,
        action: nieuweStatus === 'afgeschreven' ? 'eenheid_afgeschreven' : 'eenheid_verbruikt',
        metadata: { eenheid_id: id, code: rij.code, partij_id: rij.partij_id, partijnummer: partij?.partijnummer ?? null, reden: nieuweStatus, event_id: v.data.eventId, voorraad_na: nieuweVoorraad },
    });

    return NextResponse.json({ ok: true, code: rij.code, status: nieuweStatus, voorraadNa: nieuweVoorraad });
});
