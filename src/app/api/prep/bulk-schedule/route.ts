/* POST /api/prep/bulk-schedule — genereer prep-taken voor een event.
 *
 * Thin wrapper rond `bulkScheduleEventPrep` (pure functie in src/lib/prep/bulkSchedule.ts).
 * Dezelfde logica wordt vanuit acceptance-workflow.ts aangeroepen bij offerte-
 * acceptatie — één source of truth voor prep-task-creatie.
 *
 * P0-1 fix: voorkomt dubbele rijen wanneer beide flows triggeren.
 * P0-3 fix: koppelt prep_tasks.course_id automatisch via gerecht_id.
 *
 * Body: { eventId, dryRun?, force?, onlyGerechtIds? }
 *   - dryRun = preview zonder DB-writes
 *   - force  = verwijder bestaande server_recipe-tasks eerst en re-insert
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateBulkSchedule } from '@/lib/prep/validators';
import { appendKdsAudit } from '@/lib/prep/auditLog';
import { bulkScheduleEventPrep } from '@/lib/prep/bulkSchedule';

export const runtime = 'nodejs';
export const maxDuration = 30;

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const v = validateBulkSchedule(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { eventId, dryRun, onlyGerechtIds } = v.data;
    /* Force-mode: client kan expliciet vragen om re-insert. Niet in validator
       maar in body — defensief casten. */
    const force = typeof (body as { force?: unknown }).force === 'boolean'
        ? (body as { force: boolean }).force
        : false;

    const result = await bulkScheduleEventPrep(supabase, eventId, orgId, {
        force,
        onlyGerechtIds,
        dryRun,
        userId,
    });

    if (!result.ok) {
        const status = result.reason === 'event_not_found' ? 404
            : result.reason === 'no_org_match' ? 403
            : result.reason === 'no_date' || result.reason === 'no_guests' ? 422
            : result.reason === 'db_error' ? 500
            : 400;
        return NextResponse.json({
            error: messageForReason(result.reason) + (result.error ? ` — ${result.error}` : ''),
            reason: result.reason,
        }, { status });
    }

    // Audit (alleen voor echte inserts, niet dryRun)
    if (!dryRun && result.taskCount > 0) {
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
            action: 'bulk_scheduled',
            personeelId,
            metadata: {
                event_id: eventId,
                task_count: result.taskCount,
                matched_templates: result.matchedTemplates,
                fallback_count: result.fallbackCount,
                stap_count: result.stapCount,
                deleted_count: result.deletedCount,
                force,
            },
        });
    }

    return NextResponse.json({
        ok: true,
        dryRun: !!dryRun,
        taskCount: result.taskCount,
        matchedTemplates: result.matchedTemplates,
        fallbackCount: result.fallbackCount,
        componentCount: result.componentCount,
        /* Golf 2 — hoeveel taken uit ontlede receptstappen komen. */
        stapCount: result.stapCount,
        stapDishCount: result.stapDishCount,
        deletedCount: result.deletedCount,
        tasks: dryRun ? result.tasks : undefined,
    });
});

function messageForReason(reason: string | undefined): string {
    switch (reason) {
        case 'event_not_found': return 'Event niet gevonden';
        case 'no_org_match': return 'Geen toegang';
        case 'no_date': return 'Event mist datum — kan niet schedulen';
        case 'no_guests': return 'Event heeft 0 gasten — niets te schedulen';
        case 'no_dishes': return 'Geen gerechten gekoppeld aan dit event';
        case 'no_gerechten_match': return 'Gerechten niet gevonden in bibliotheek';
        case 'db_error': return 'Database-fout';
        default: return 'Onbekende fout';
    }
}
