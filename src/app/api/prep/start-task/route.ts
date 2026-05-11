/* POST /api/prep/start-task — markeer prep-taak als in-progress.
 *
 * Idempotent: tweede call op zelfde taak die al in_progress staat returnt 200.
 * Conditional UPDATE op status verhindert race-conditions (zie pillar #3
 * gloved-hand-first — twee chefs kunnen tegelijk tikken).
 *
 * Hard rules borging:
 *  - Multi-tenant: withTenantAuth + row-refetch met org-check (defense in depth)
 *  - Server Actions: validateStartTask (Zod-equivalent inline pattern)
 *  - Audit: append naar kds_audit_logs (append-only)
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateStartTask } from '@/lib/prep/validators';
import { appendKdsAudit } from '@/lib/prep/auditLog';

export const runtime = 'nodejs';

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const v = validateStartTask(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { taskId } = v.data;

    // Re-fetch om org-id te valideren ondanks RLS (defense in depth)
    const { data: task, error: fetchErr } = await supabase
        .from('prep_tasks')
        .select('id, organization_id, status, assignee_id')
        .eq('id', taskId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!task) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 });
    if (task.organization_id !== orgId) {
        return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }

    // Idempotent
    if (task.status === 'in_progress') {
        return NextResponse.json({ ok: true, alreadyInProgress: true });
    }
    if (task.status === 'done') {
        return NextResponse.json({ error: 'Taak is al klaar' }, { status: 409 });
    }

    // Map personeel-id van de huidige user (assignee_id = personeel.id, niet auth.users)
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

    // Conditional update — alleen als status nog steeds niet in_progress is
    const { data: updated, error: updErr } = await supabase
        .from('prep_tasks')
        .update({
            status: 'in_progress',
            started_at: new Date().toISOString(),
            assignee_id: personeelId,
        })
        .eq('id', taskId)
        .in('status', ['planned', 'queued', 'blocked', 'skipped'])
        .select('id, status, started_at, assignee_id')
        .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!updated) {
        // Race: iemand anders was sneller. Geen fout, alleen feedback.
        return NextResponse.json({ ok: true, raceLost: true });
    }

    await appendKdsAudit(supabase, {
        orgId,
        action: 'task_started',
        taskId,
        personeelId,
        metadata: { from_status: task.status },
    });

    return NextResponse.json({ ok: true, task: updated });
});
