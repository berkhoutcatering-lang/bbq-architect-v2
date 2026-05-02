/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/lib/supabase';

/**
 * Data Access Layer voor KDS Service Mode.
 *
 * service_state = 1 rij per event tijdens live service
 * service_audit_logs = append-only log voor compliance
 * courses.status = source-of-truth voor gang-status
 */

export type CourseStatus = 'queued' | 'active' | 'ready' | 'served' | 'recalled';

export interface TableOverride {
  allergen_flags: string[];
  replacement_note?: string;
  override_confirmed_by?: string;
  override_reason?: string;
  confirmed_at?: string;
}

export interface ServiceStateRow {
  event_id: number;
  org_id?: string;
  started_at: string | null;
  ended_at: string | null;
  current_course_idx: number;
  table_overrides: Record<string, TableOverride>;
  rook_alert: any;
  updated_at: string;
}

export interface AuditLogEntry {
  event_id: number;
  course_id?: number | null;
  table_id?: string | null;
  action: 'mark_active' | 'mark_ready' | 'mark_served' | 'recall' | 'allergen_override' | 'service_started' | 'service_ended';
  allergen_flag?: boolean;
  override_reason?: string;
  metadata?: Record<string, any>;
}

/* ── service_state ────────────────────────────────────────────────── */

export async function getServiceState(eventId: number): Promise<ServiceStateRow | null> {
  if (!supabase) return null;
  const { data } = await supabase.from('service_state').select('*').eq('event_id', eventId).maybeSingle();
  return (data as ServiceStateRow) || null;
}

export async function startService(eventId: number, orgId?: string): Promise<ServiceStateRow | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('service_state')
    .upsert({
      event_id: eventId,
      org_id: orgId,
      started_at: new Date().toISOString(),
      ended_at: null,
      current_course_idx: 0,
    }, { onConflict: 'event_id' })
    .select()
    .single();
  if (error) {
    console.warn('[serviceState] startService error:', error.message);
    return null;
  }
  await appendAudit({ event_id: eventId, action: 'service_started' });
  return data as ServiceStateRow;
}

export async function endService(eventId: number): Promise<void> {
  if (!supabase) return;
  await supabase.from('service_state').update({ ended_at: new Date().toISOString() }).eq('event_id', eventId);
  await appendAudit({ event_id: eventId, action: 'service_ended' });
}

export async function setCurrentCourseIdx(eventId: number, idx: number): Promise<void> {
  if (!supabase) return;
  await supabase.from('service_state').update({ current_course_idx: idx }).eq('event_id', eventId);
}

export async function setTableOverride(
  eventId: number,
  tableId: string,
  override: TableOverride,
): Promise<void> {
  if (!supabase) return;
  const cur = await getServiceState(eventId);
  const next = { ...(cur?.table_overrides || {}), [tableId]: override };
  await supabase.from('service_state').update({ table_overrides: next }).eq('event_id', eventId);
}

/* ── courses.status ──────────────────────────────────────────────── */

export async function updateCourseStatus(
  eventId: number,
  courseId: number,
  newStatus: CourseStatus,
  meta: { allergenConfirmed?: boolean; overrideReason?: string } = {},
): Promise<void> {
  if (!supabase) return;
  await supabase.from('courses').update({ status: newStatus }).eq('id', courseId);

  // Map status naar audit-action
  const action: AuditLogEntry['action'] =
    newStatus === 'active' ? 'mark_active' :
    newStatus === 'ready' ? 'mark_ready' :
    newStatus === 'served' ? 'mark_served' :
    newStatus === 'recalled' ? 'recall' :
    'mark_active';

  await appendAudit({
    event_id: eventId,
    course_id: courseId,
    action,
    allergen_flag: !!meta.allergenConfirmed,
    override_reason: meta.overrideReason,
  });
}

export async function recallCourse(eventId: number, courseId: number, previousStatus: CourseStatus): Promise<void> {
  await updateCourseStatus(eventId, courseId, previousStatus);
  await appendAudit({ event_id: eventId, course_id: courseId, action: 'recall', metadata: { previousStatus } });
}

/* ── audit log ───────────────────────────────────────────────────── */

export async function appendAudit(entry: AuditLogEntry): Promise<void> {
  if (!supabase) return;
  const { data: userRes } = await supabase.auth.getUser();
  await supabase.from('service_audit_logs').insert({
    event_id: entry.event_id,
    course_id: entry.course_id ?? null,
    table_id: entry.table_id ?? null,
    action: entry.action,
    allergen_flag: entry.allergen_flag ?? false,
    override_reason: entry.override_reason ?? null,
    metadata: entry.metadata ?? {},
    by_user: userRes?.user?.id ?? null,
  });
}
