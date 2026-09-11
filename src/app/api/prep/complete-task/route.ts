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
        return NextResponse.json({ ok: true, alreadyDone: true });
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
        bericht: onderbroken
            ? 'Klaar. Omdat je onderbroken was telt deze tijd niet mee in de schatting.'
            : meting.gemeten
                ? 'Klaar. Deze tijd telt mee.'
                : 'Klaar.',
    });
});
