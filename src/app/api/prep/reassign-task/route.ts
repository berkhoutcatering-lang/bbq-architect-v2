/* POST /api/prep/reassign-task — wijzig assignee van een prep-taak.
 *
 * Controleert dat de nieuwe assignee tot dezelfde org behoort (RLS
 * vangt 't ook af, maar defense-in-depth via re-fetch).
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateReassignTask } from '@/lib/prep/validators';
import { appendKdsAudit } from '@/lib/prep/auditLog';

export const runtime = 'nodejs';

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const v = validateReassignTask(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { taskId, newAssigneeId } = v.data;

    // 1. Check task bestaat + zelfde org
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
    if (task.status === 'done' || task.status === 'skipped') {
        return NextResponse.json({ error: 'Taak is afgerond, niet meer toewijsbaar' }, { status: 409 });
    }

    // 2. Check newAssignee bestaat + zelfde org + actief
    const { data: newMember, error: memberErr } = await supabase
        .from('personeel')
        .select('id, organization_id, actief, naam')
        .eq('id', newAssigneeId)
        .maybeSingle();

    if (memberErr) return NextResponse.json({ error: memberErr.message }, { status: 500 });
    if (!newMember) return NextResponse.json({ error: 'Personeelslid niet gevonden' }, { status: 404 });
    if (newMember.organization_id !== orgId) {
        return NextResponse.json({ error: 'Personeelslid hoort niet bij deze organisatie' }, { status: 403 });
    }
    if (!newMember.actief) {
        return NextResponse.json({ error: 'Personeelslid is gedeactiveerd' }, { status: 409 });
    }

    // 3. Update
    const { data: updated, error: updErr } = await supabase
        .from('prep_tasks')
        .update({ assignee_id: newAssigneeId })
        .eq('id', taskId)
        .select('id, assignee_id')
        .maybeSingle();

    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    // 4. Map actor naar personeel
    let actorPersoneelId: string | null = null;
    const { data: actor } = await supabase
        .from('personeel')
        .select('id')
        .eq('user_id', userId)
        .eq('organization_id', orgId)
        .maybeSingle();
    actorPersoneelId = actor?.id ?? null;

    await appendKdsAudit(supabase, {
        orgId,
        action: 'task_reassigned',
        taskId,
        personeelId: actorPersoneelId,
        metadata: {
            from: task.assignee_id,
            to: newAssigneeId,
            to_name: newMember.naam,
        },
    });

    return NextResponse.json({ ok: true, task: updated });
});
