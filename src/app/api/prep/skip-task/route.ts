/* POST /api/prep/skip-task — markeer prep-taak als skipped met reden.
 *
 * Reden is verplicht (max 250 chars) — komt in audit log + notes-veld
 * zodat manager later kan reviewen waarom een taak overgeslagen is.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateSkipTask } from '@/lib/prep/validators';
import { appendKdsAudit } from '@/lib/prep/auditLog';

export const runtime = 'nodejs';

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const v = validateSkipTask(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { taskId, reason } = v.data;

    const { data: task, error: fetchErr } = await supabase
        .from('prep_tasks')
        .select('id, organization_id, status, assignee_id, notes')
        .eq('id', taskId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!task) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 });
    if (task.organization_id !== orgId) {
        return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    }
    if (task.status === 'skipped') {
        return NextResponse.json({ ok: true, alreadySkipped: true });
    }
    if (task.status === 'done') {
        return NextResponse.json({ error: 'Taak is al klaar' }, { status: 409 });
    }

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

    const combinedNotes = task.notes
        ? `${task.notes}\n[overgeslagen] ${reason}`
        : `[overgeslagen] ${reason}`;

    const { data: updated, error: updErr } = await supabase
        .from('prep_tasks')
        .update({
            status: 'skipped',
            notes: combinedNotes,
        })
        .eq('id', taskId)
        .in('status', ['planned', 'queued', 'in_progress', 'blocked'])
        .select('id, status, notes')
        .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });
    if (!updated) {
        return NextResponse.json({ ok: true, raceLost: true });
    }

    await appendKdsAudit(supabase, {
        orgId,
        action: 'task_skipped',
        taskId,
        personeelId,
        metadata: { reason },
    });

    return NextResponse.json({ ok: true, task: updated });
});
