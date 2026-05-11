/* POST /api/prep/snooze-task — verschuif scheduled_at met N minuten.
 *
 * Bijvoorbeeld: swipe-links op de kaart → +15 min. Mens kan ook in detail-sheet
 * langer kiezen (60min / 4u / morgen).
 *
 * Hard rule: target_qty wordt NIET aangepast. Alleen scheduled_at + notes-trail.
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { appendKdsAudit } from '@/lib/prep/auditLog';

export const runtime = 'nodejs';

interface SnoozeInput {
    taskId: number;
    minutes: number;
}

function validateSnooze(body: unknown): { ok: true; data: SnoozeInput } | { ok: false; error: string } {
    if (typeof body !== 'object' || body === null) return { ok: false, error: 'Body verplicht' };
    const b = body as Record<string, unknown>;
    if (typeof b.taskId !== 'number' || !Number.isInteger(b.taskId) || b.taskId <= 0) {
        return { ok: false, error: 'taskId moet een positief integer zijn' };
    }
    if (typeof b.minutes !== 'number' || !Number.isFinite(b.minutes) || b.minutes <= 0 || b.minutes > 7 * 24 * 60) {
        return { ok: false, error: 'minutes moet 1..10080 zijn (max 1 week)' };
    }
    return { ok: true, data: { taskId: b.taskId, minutes: Math.round(b.minutes) } };
}

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 }); }

    const v = validateSnooze(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { taskId, minutes } = v.data;

    const { data: task, error: fetchErr } = await supabase
        .from('prep_tasks')
        .select('id, organization_id, scheduled_at, status, assignee_id')
        .eq('id', taskId)
        .maybeSingle();

    if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    if (!task) return NextResponse.json({ error: 'Taak niet gevonden' }, { status: 404 });
    if (task.organization_id !== orgId) return NextResponse.json({ error: 'Geen toegang' }, { status: 403 });
    if (task.status === 'done' || task.status === 'skipped') {
        return NextResponse.json({ error: 'Taak is al afgerond' }, { status: 409 });
    }

    const base = task.scheduled_at ? new Date(task.scheduled_at).getTime() : Date.now();
    if (!Number.isFinite(base)) {
        return NextResponse.json({ error: 'Ongeldige bestaande scheduled_at' }, { status: 422 });
    }
    const next = new Date(base + minutes * 60_000).toISOString();

    const { data: updated, error: updErr } = await supabase
        .from('prep_tasks')
        .update({ scheduled_at: next })
        .eq('id', taskId)
        .select('id, scheduled_at')
        .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // Map actor → personeel
    let personeelId: string | null = null;
    const { data: actor } = await supabase
        .from('personeel')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .maybeSingle();
    personeelId = actor?.id ?? null;

    await appendKdsAudit(supabase, {
        orgId,
        action: 'task_reassigned',  // re-use action; metadata distinguishes
        taskId,
        personeelId,
        metadata: { kind: 'snooze', minutes, new_scheduled_at: next },
    });

    return NextResponse.json({ ok: true, task: updated });
});
