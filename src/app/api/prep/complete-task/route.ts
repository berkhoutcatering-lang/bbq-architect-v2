/* POST /api/prep/complete-task — markeer prep-taak als done.
 *
 * Side effect: voor phases inkoop/pekel/rub/marinade (eerste-helft van keten)
 * doet 'best-effort' inventory-deduction zoals service-mode dat doet voor
 * served-gangen. Smoke/grill/plate/service blijven aan service-mode-aftrek.
 *
 * Hard rules: Zie start-task. target_qty NOOIT door AI gezet — daarom slaan
 * we alleen actual_qty op (chef-input).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateCompleteTask } from '@/lib/prep/validators';
import { appendKdsAudit } from '@/lib/prep/auditLog';
import { schrijfMeting } from '@/lib/keukenplanner/meting';
import { stelBij } from '@/lib/keukenplanner/bijstellen';
import { validatePartijBlok, type PartijBlok } from '@/lib/productie/validators';
import { bepaalBron, naarAfrondenInput } from '@/lib/productie/bron';
import { rondPartijAf, type AfrondenUitkomst } from '@/lib/productie/afronden';

export const runtime = 'nodejs';

const INVENTORY_DEDUCT_PHASES = new Set(['inkoop', 'pekel', 'rub', 'marinade']);

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const v = validateCompleteTask(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { taskId, actualQty, notes, onderbroken } = v.data;

    /* Optioneel partij-blok: "Afmaken met sticker" in dezelfde klik als Klaar.
       Gevalideerd vóór de status-update, zodat een fout in het blok de taak
       niet half klaar zet. */
    let partijBlok: PartijBlok | null = null;
    const rawPartij = (body as Record<string, unknown>).partij;
    if (rawPartij != null) {
        const pv = validatePartijBlok(rawPartij);
        if (pv.ok === false) return NextResponse.json({ error: `Partij: ${pv.error}` }, { status: 400 });
        partijBlok = pv.data;
    }

    // Re-fetch + org-check
    const { data: task, error: fetchErr } = await supabase
        .from('prep_tasks')
        .select('id, organization_id, status, phase, target_qty, target_unit, gerecht_id, event_id, assignee_id, started_at, recipe_step_id, schoonmaaktaak_id, bewerking_code, component_id, stuk_gewicht_kg')
        .eq('id', taskId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!task) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 });
    if (task.organization_id !== orgId) {
        return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }
    if (task.status === 'done') {
        /* Al klaar, maar misschien nog geen partij (bv. de partij-stap faalde
           bij de vorige poging, of de kok maakt hem nu pas af). De RPC is
           idempotent, dus dit is veilig om te herhalen. */
        const partij = partijBlok ? await maakPartij(supabase, orgId, userId, taskId, partijBlok) : null;
        if (partij && partij.ok === false) return NextResponse.json({ error: partij.error, code: partij.code, alreadyDone: true }, { status: partij.status });
        return NextResponse.json({ ok: true, alreadyDone: true, partij: partij && partij.ok ? { bestond: partij.bestond, ...partij.partij, eenheden: partij.eenheden } : null });
    }
    if (task.status === 'skipped') {
        return NextResponse.json({ error: 'Taak is geskipt' }, { status: 409 });
    }

    // Map personeel-id (preferred = assignee, fallback = current user)
    let personeelId: string | null = task.assignee_id;
    if (!personeelId) {
        const { data: me } = await supabase
            .from('personeel')
            .select('id')
            .eq('user_id', userId)
            .eq('organization_id', orgId)
            .maybeSingle();
        personeelId = me?.id ?? null;
    }

    // Conditional update — race-safe
    const updatePayload: Record<string, unknown> = {
        status: 'done',
        completed_at: new Date().toISOString(),
    };
    if (actualQty !== null) updatePayload.actual_qty = actualQty;
    if (notes) updatePayload.notes = notes;

    const { data: updated, error: updErr } = await supabase
        .from('prep_tasks')
        .update(updatePayload)
        .eq('id', taskId)
        .in('status', ['planned', 'queued', 'in_progress', 'blocked'])
        .select('id, status, completed_at, actual_qty, phase')
        .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!updated) {
        return NextResponse.json({ ok: true, raceLost: true });
    }

    /* De partij vóór de meting: de partij is hard (voorraad), de meting is
       best-effort. Mislukt de partij, dan is de taak wél klaar en meldt de
       tablet dat de sticker nog gemaakt moet worden. */
    let partij: AfrondenUitkomst | null = null;
    if (partijBlok) {
        partij = await maakPartij(supabase, orgId, userId, taskId, partijBlok);
    }

    await appendKdsAudit(supabase, {
        orgId,
        action: 'task_completed',
        taskId,
        personeelId,
        metadata: {
            actual_qty: actualQty,
            target_qty: task.target_qty,
            phase: task.phase,
            inventory_deduct_eligible: INVENTORY_DEDUCT_PHASES.has(task.phase ?? 'other'),
        },
    });

    /* De meting. Dit is waar de keukenplanner van leert: werkelijke duur uit
       started_at → nu, met de hoeveelheid en de onderbroken-vlag erbij.
       Best-effort — een mislukte meting mag de klaar-melding nooit blokkeren,
       want dan staat de kok met een taak die niet weg wil. */
    const meting = await schrijfMeting(supabase, orgId, {
        taak: task,
        actualQty,
        onderbroken,
        completedAt: updated.completed_at,
    });

    /* De leerlus sluiten: een meting alleen is niets waard als er nooit iets
       mee gebeurt. Alleen bij een meting die meetelt, en alleen als er een
       bewerking aan hangt — leren gebeurt op de bewerking, niet op de stap. */
    let bijstelling = null;
    if (meting.gemeten && task.bewerking_code) {
        bijstelling = await stelBij(supabase, orgId, task.bewerking_code, task.component_id ?? null);
    }

    // Inventory deduction is best-effort en alleen voor prep-phases.
    // Service-mode handelt smoke/grill/plate/service-aftrek af bij served-status.
    // Hier wordt het NIET geblokkeerd op fout — we willen de done-actie niet houden.
    const inventoryDeducted = false; // V1.5: hook deductFromInventory in zodra
    //                                  de ingredient-bonus uit recipeTemplates
    //                                  per task is gebonden.

    return NextResponse.json({
        ok: true,
        task: updated,
        inventoryDeducted,
        meting,
        bijstelling,
        partij: partijAntwoord(partij),
        bericht: onderbroken
            ? 'Klaar. Omdat je onderbroken was telt deze tijd niet mee in de schatting.'
            : meting.gemeten
                ? 'Klaar. Deze tijd telt mee.'
                : 'Klaar.',
    });
});

async function maakPartij(
    supabase: TenantAuthCtx['supabase'], orgId: string, userId: string, taskId: number, blok: PartijBlok,
): Promise<AfrondenUitkomst> {
    const bron = await bepaalBron(supabase, orgId, userId, { bron: 'prep_task', prepTaskId: taskId, ...blok });
    if (bron.ok === false) return { ok: false, status: bron.status, code: 'ongeldig', error: bron.error };
    return rondPartijAf(supabase, { orgId, userId }, naarAfrondenInput({ bron: 'prep_task', prepTaskId: taskId, ...blok }, bron.ctx));
}

function partijAntwoord(p: AfrondenUitkomst | null): Record<string, unknown> | null {
    if (!p) return null;
    if (p.ok === false) return { ok: false, error: p.error, code: p.code };
    return { ok: true, bestond: p.bestond, ...p.partij, eenheden: p.eenheden };
}
