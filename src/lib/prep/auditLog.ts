/**
 * Audit-log helper voor Prep-KDS routes.
 *
 * Schrijft naar `kds_audit_logs` (append-only, geen UPDATE/DELETE policy).
 * Best-effort: faalt stilletjes om de hoofd-actie niet te blokkeren, logt
 * naar console zodat ops het oppikt.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { KdsAuditAction } from '@/types/database.types';

export interface AppendKdsAuditEntry {
    orgId: string;
    action: KdsAuditAction;
    taskId?: number | null;
    deviceSessionId?: string | null;
    personeelId?: string | null;
    metadata?: Record<string, unknown>;
}

export async function appendKdsAudit(
    supabase: SupabaseClient,
    entry: AppendKdsAuditEntry,
): Promise<void> {
    try {
        const { error } = await supabase.from('kds_audit_logs').insert({
            organization_id: entry.orgId,
            task_id: entry.taskId ?? null,
            device_session_id: entry.deviceSessionId ?? null,
            personeel_id: entry.personeelId ?? null,
            action: entry.action,
            metadata: entry.metadata ?? {},
        });
        if (error) {
            console.error('[kds_audit_logs] insert failed:', error.message);
        }
    } catch (e) {
        console.error('[kds_audit_logs] unexpected error:', e);
    }
}
