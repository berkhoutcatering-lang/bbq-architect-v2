/**
 * HACCP Data Access Layer
 * ───────────────────────
 * Pillar #1: event-bound + cached templates voor 0 AI-call hergebruik.
 * Pillar #3: ai_derived = false default + confirmed_by_user_id verplicht
 *            op insert. RLS extra gehard met explicit organization_id filter.
 *
 * Match bestaand pattern (lib/dal/inventoryDemand.ts): caller geeft supabase
 * client + orgId mee. Pure helpers, geen module-level state.
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export type HaccpCheckType = 'ontvangst' | 'bewaring' | 'kern' | 'uitgifte' | 'regenereren';
export type HaccpRisk = 'hoog' | 'middel' | 'laag';

export interface HaccpCitation {
    sum: string;
    src: string;
    ref: string;
}

export interface HaccpCheckItem {
    id: string;
    dishIds: string[];
    type: HaccpCheckType;
    label: string;
    target: string;
    time: string;
    hour: number;
    risk: HaccpRisk;
    enabled?: boolean;
    cite?: HaccpCitation;
}

export interface GerechtHaccpTemplate {
    id: string;
    organization_id: string;
    gerecht_id: string;
    check_items: HaccpCheckItem[];
    citations_json: unknown;
    ai_usage_id: number | null;
    created_by_ai: boolean;
    edited_by_user_id: string | null;
    edited_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface EventHaccpPlan {
    id: string;
    organization_id: string;
    event_id: number;
    plan_items: HaccpCheckItem[];
    serving_hour: number | null;
    ai_usage_id: number | null;
    confirmed_by_user_id: string | null;
    confirmed_at: string | null;
    created_at: string;
    updated_at: string;
}

export interface HaccpAnomalyFinding {
    id: number;
    organization_id: string;
    haccp_record_id: number;
    detected_at: string;
    z_score: number;
    baseline_mean: number;
    baseline_stddev: number;
    sample_size: number;
    reason: string;
    acknowledged_at: string | null;
    acknowledged_by_user_id: string | null;
}

/* ─────────────────────────────────────────────────────
 * gerecht_haccp_templates
 * ───────────────────────────────────────────────────── */

export async function getGerechtHaccpTemplate(
    sb: SupabaseClient,
    orgId: string,
    gerechtId: string,
): Promise<GerechtHaccpTemplate | null> {
    const { data, error } = await sb
        .from('gerecht_haccp_templates')
        .select('*')
        .eq('organization_id', orgId)
        .eq('gerecht_id', gerechtId)
        .maybeSingle();
    if (error) {
        console.error('[haccp DAL] getGerechtHaccpTemplate failed', error.message);
        return null;
    }
    return data as GerechtHaccpTemplate | null;
}

export async function saveGerechtHaccpTemplate(
    sb: SupabaseClient,
    orgId: string,
    userId: string | null,
    input: {
        gerechtId: string;
        checkItems: HaccpCheckItem[];
        citationsJson: unknown;
        aiUsageId: number | null;
    },
): Promise<GerechtHaccpTemplate | null> {
    const { data, error } = await sb
        .from('gerecht_haccp_templates')
        .upsert(
            {
                organization_id: orgId,
                gerecht_id: input.gerechtId,
                check_items: input.checkItems,
                citations_json: input.citationsJson ?? null,
                ai_usage_id: input.aiUsageId,
                created_by_ai: input.aiUsageId !== null,
                edited_by_user_id: userId,
                edited_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'organization_id,gerecht_id' },
        )
        .select()
        .single();
    if (error) {
        console.error('[haccp DAL] saveGerechtHaccpTemplate failed', error.message);
        return null;
    }
    return data as GerechtHaccpTemplate;
}

/* ─────────────────────────────────────────────────────
 * event_haccp_plans
 * ───────────────────────────────────────────────────── */

export async function getEventHaccpPlan(
    sb: SupabaseClient,
    orgId: string,
    eventId: number,
): Promise<EventHaccpPlan | null> {
    const { data, error } = await sb
        .from('event_haccp_plans')
        .select('*')
        .eq('organization_id', orgId)
        .eq('event_id', eventId)
        .maybeSingle();
    if (error) {
        console.error('[haccp DAL] getEventHaccpPlan failed', error.message);
        return null;
    }
    return data as EventHaccpPlan | null;
}

export async function saveEventHaccpPlan(
    sb: SupabaseClient,
    orgId: string,
    userId: string | null,
    input: {
        eventId: number;
        planItems: HaccpCheckItem[];
        servingHour: number | null;
        aiUsageId: number | null;
    },
): Promise<EventHaccpPlan | null> {
    const { data, error } = await sb
        .from('event_haccp_plans')
        .upsert(
            {
                organization_id: orgId,
                event_id: input.eventId,
                plan_items: input.planItems,
                serving_hour: input.servingHour,
                ai_usage_id: input.aiUsageId,
                confirmed_by_user_id: userId,
                confirmed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            },
            { onConflict: 'organization_id,event_id' },
        )
        .select()
        .single();
    if (error) {
        console.error('[haccp DAL] saveEventHaccpPlan failed', error.message);
        return null;
    }
    return data as EventHaccpPlan;
}

/* ─────────────────────────────────────────────────────
 * haccp_records — log met mens-bevestigt invariant
 * ───────────────────────────────────────────────────── */

export interface LogHaccpCheckInput {
    planItemId: string | null;
    eventId: number | null;
    gerechtId: string | null;
    dishLabel: string;
    checkType: string;
    temp: number;
    notitie: string | null;
    chef: string;
    photoUrl?: string | null;                                                    // v3: bewijsfoto pad in haccp-evidence bucket
}

export interface CorrectiveAction {
    id: number;
    organization_id: string;
    haccp_record_id: number | null;
    anomaly_finding_id: number | null;
    action_type: string;
    description: string;
    steps_taken: Array<{ step: string; done_at?: string; done_by?: string }>;
    resolved_at: string | null;
    resolved_by_user_id: string | null;
    outcome: string | null;
    notes: string | null;
    created_at: string;
    updated_at: string;
}

export interface HaccpTrendRow {
    check_type: string;
    wat: string;
    total_checks: number;
    ok_count: number;
    deviation_count: number;
    anomaly_count: number;
    avg_temp: number;
    min_temp: number;
    max_temp: number;
    last_check_at: string;
    deviation_pct: number;
}

export const CORRECTIVE_ACTION_TEMPLATES: Record<string, { steps: string[]; outcomes: string[] }> = {
    opnieuw_verwarmen: {
        steps: [
            'Product op ≥75°C verhitten binnen 2u',
            'Kerntemp 2× gemeten en bevestigd ≥75°C',
            'Notitie + tijd genoteerd in dossier',
        ],
        outcomes: ['opgelost', 'product_weggegooid'],
    },
    extra_koelen: {
        steps: [
            'Product direct naar koelcel ≤4°C',
            'Temperatuur na 30min opnieuw gemeten',
            'Houdbaarheid opnieuw bepaald',
        ],
        outcomes: ['opgelost', 'product_weggegooid'],
    },
    weggooien: {
        steps: [
            'Product gemarkeerd als afval',
            'Verwijderd uit voorraad',
            'Reden gedocumenteerd voor leverancier/keuken-chef',
        ],
        outcomes: ['product_weggegooid'],
    },
    sensor_check: {
        steps: [
            'Sensor herijkt met ijswater (0°C) + kokend water (100°C)',
            'Tweede meting met andere thermometer',
            'Werkelijke meting geverifieerd',
        ],
        outcomes: ['opgelost', 'sensor_vervangen', 'inspectie_aangevraagd'],
    },
    escalatie: {
        steps: ['Keuken-chef ingelicht', 'Beslissing gedocumenteerd'],
        outcomes: ['opgelost', 'inspectie_aangevraagd', 'product_weggegooid'],
    },
};

export interface LogHaccpCheckResult {
    recordId: number;
    anomaly: {
        isAnomaly: boolean;
        zScore: number;
        mean: number;
        stddev: number;
        n: number;
    } | null;
}

export async function logHaccpCheck(
    sb: SupabaseClient,
    orgId: string,
    userId: string,
    input: LogHaccpCheckInput,
): Promise<LogHaccpCheckResult | null> {
    const now = new Date();
    const status = computeStatus(input.checkType, input.temp);

    const { data: rec, error } = await sb
        .from('haccp_records')
        .insert({
            organization_id: orgId,
            event_id: input.eventId,
            gerecht_id: input.gerechtId,
            plan_item_id: input.planItemId,
            datum: now.toISOString().slice(0, 10),
            tijd: now.toTimeString().slice(0, 5),
            wat: input.dishLabel,
            temp: input.temp,
            check_type: input.checkType,
            type: input.checkType,
            chef: input.chef,
            notitie: input.notitie ?? '',
            status,
            confirmed_by_user_id: userId,
            auto_logged: false, // Pillar #3: mens-bevestigd
            photo_url: input.photoUrl ?? null,                                    // v3: SOTA-feature foto-evidence
        })
        .select('id')
        .single();
    if (error || !rec) {
        console.error('[haccp DAL] logHaccpCheck insert failed', error?.message);
        return null;
    }

    // Pillar #3: anomaly-detection is non-mutating. Pure read via pg-function.
    let anomaly: LogHaccpCheckResult['anomaly'] = null;
    try {
        const { data: anomalyResult } = await sb.rpc('detect_haccp_anomaly', {
            p_record_id: rec.id,
        });
        const finding = anomalyResult?.[0];
        if (finding) {
            anomaly = {
                isAnomaly: finding.is_anomaly,
                zScore: Number(finding.z_score),
                mean: Number(finding.mean),
                stddev: Number(finding.stddev),
                n: finding.n,
            };
            // Insert finding via service role — client RLS staat geen direct insert toe
            if (finding.is_anomaly) {
                await insertAnomalyFinding(sb, orgId, {
                    recordId: rec.id,
                    zScore: anomaly.zScore,
                    mean: anomaly.mean,
                    stddev: anomaly.stddev,
                    n: anomaly.n,
                });
            }
        }
    } catch (e) {
        console.warn('[haccp DAL] anomaly-detect failed (non-blocking)', (e as Error).message);
    }

    return { recordId: rec.id, anomaly };
}

async function insertAnomalyFinding(
    sb: SupabaseClient,
    orgId: string,
    input: { recordId: number; zScore: number; mean: number; stddev: number; n: number },
): Promise<void> {
    const reason = `Wijkt ${Math.abs(input.zScore).toFixed(1)}σ af van gemiddelde ${input.mean.toFixed(1)}°C (baseline=${input.n} samples) — sensor check?`;
    const { error } = await sb.from('haccp_anomaly_findings').insert({
        organization_id: orgId,
        haccp_record_id: input.recordId,
        z_score: input.zScore,
        baseline_mean: input.mean,
        baseline_stddev: input.stddev,
        sample_size: input.n,
        reason,
    });
    if (error) {
        console.warn('[haccp DAL] anomaly insert failed (non-blocking)', error.message);
    }
}

/* ─────────────────────────────────────────────────────
 * Anomaly findings — fetch for dossier view
 * ───────────────────────────────────────────────────── */

export async function getAnomalyFindingsForEvent(
    sb: SupabaseClient,
    orgId: string,
    eventId: number,
): Promise<HaccpAnomalyFinding[]> {
    const { data: records } = await sb
        .from('haccp_records')
        .select('id')
        .eq('organization_id', orgId)
        .eq('event_id', eventId);
    if (!records?.length) return [];
    const ids = records.map((r: { id: number }) => r.id);
    const { data, error } = await sb
        .from('haccp_anomaly_findings')
        .select('*')
        .eq('organization_id', orgId)
        .in('haccp_record_id', ids);
    if (error) {
        console.error('[haccp DAL] getAnomalyFindingsForEvent failed', error.message);
        return [];
    }
    return (data ?? []) as HaccpAnomalyFinding[];
}

/* ─────────────────────────────────────────────────────
 * Photo evidence — signed URL voor preview/download
 * ───────────────────────────────────────────────────── */

export async function getEvidencePhotoSignedUrl(
    sb: SupabaseClient,
    path: string,
    expiresInSec: number = 60 * 30,
): Promise<string | null> {
    const { data, error } = await sb.storage
        .from('haccp-evidence')
        .createSignedUrl(path, expiresInSec);
    if (error) {
        console.warn('[haccp DAL] signed URL failed', error.message);
        return null;
    }
    return data?.signedUrl ?? null;
}

/* ─────────────────────────────────────────────────────
 * Corrective actions — guided flow per afwijking
 * ───────────────────────────────────────────────────── */

export interface CreateCorrectiveActionInput {
    haccpRecordId: number | null;
    anomalyFindingId: number | null;
    actionType: keyof typeof CORRECTIVE_ACTION_TEMPLATES;
    description: string;
    notes?: string;
}

export async function createCorrectiveAction(
    sb: SupabaseClient,
    orgId: string,
    input: CreateCorrectiveActionInput,
): Promise<CorrectiveAction | null> {
    const { data, error } = await sb
        .from('haccp_corrective_actions')
        .insert({
            organization_id: orgId,
            haccp_record_id: input.haccpRecordId,
            anomaly_finding_id: input.anomalyFindingId,
            action_type: input.actionType,
            description: input.description,
            steps_taken: [],
            notes: input.notes ?? null,
        })
        .select('*')
        .single();
    if (error) {
        console.error('[haccp DAL] createCorrectiveAction failed', error.message);
        return null;
    }
    return data as CorrectiveAction;
}

export async function recordCorrectiveStep(
    sb: SupabaseClient,
    orgId: string,
    actionId: number,
    step: string,
    userId: string,
): Promise<CorrectiveAction | null> {
    const { data: current, error: fetchErr } = await sb
        .from('haccp_corrective_actions')
        .select('steps_taken')
        .eq('id', actionId)
        .eq('organization_id', orgId)
        .single();
    if (fetchErr || !current) return null;

    const steps = ((current.steps_taken as CorrectiveAction['steps_taken']) ?? []).concat([
        { step, done_at: new Date().toISOString(), done_by: userId },
    ]);

    const { data, error } = await sb
        .from('haccp_corrective_actions')
        .update({ steps_taken: steps, updated_at: new Date().toISOString() })
        .eq('id', actionId)
        .eq('organization_id', orgId)
        .select('*')
        .single();
    if (error) {
        console.error('[haccp DAL] recordCorrectiveStep failed', error.message);
        return null;
    }
    return data as CorrectiveAction;
}

export async function resolveCorrectiveAction(
    sb: SupabaseClient,
    orgId: string,
    actionId: number,
    userId: string,
    outcome: string,
    notes?: string,
): Promise<CorrectiveAction | null> {
    const { data, error } = await sb
        .from('haccp_corrective_actions')
        .update({
            resolved_at: new Date().toISOString(),
            resolved_by_user_id: userId,
            outcome,
            notes: notes ?? null,
            updated_at: new Date().toISOString(),
        })
        .eq('id', actionId)
        .eq('organization_id', orgId)
        .select('*')
        .single();
    if (error) {
        console.error('[haccp DAL] resolveCorrectiveAction failed', error.message);
        return null;
    }
    return data as CorrectiveAction;
}

export async function getUnresolvedCorrectiveActions(
    sb: SupabaseClient,
    orgId: string,
): Promise<CorrectiveAction[]> {
    const { data, error } = await sb
        .from('haccp_corrective_actions')
        .select('*')
        .eq('organization_id', orgId)
        .is('resolved_at', null)
        .order('created_at', { ascending: false });
    if (error) {
        console.error('[haccp DAL] getUnresolvedCorrectiveActions failed', error.message);
        return [];
    }
    return (data ?? []) as CorrectiveAction[];
}

/* ─────────────────────────────────────────────────────
 * Trends — 90-day aggregaat per gerecht × check_type
 * ───────────────────────────────────────────────────── */

export async function getHaccpTrends(
    sb: SupabaseClient,
    orgId: string,
    days: number = 90,
): Promise<HaccpTrendRow[]> {
    const { data, error } = await sb.rpc('get_haccp_trends', {
        p_org_id: orgId,
        p_days: days,
    });
    if (error) {
        console.error('[haccp DAL] getHaccpTrends failed', error.message);
        return [];
    }
    return (data ?? []) as HaccpTrendRow[];
}

/* ─────────────────────────────────────────────────────
 * Pure status compute (server-side, geen AI)
 * ───────────────────────────────────────────────────── */

const PRESET_THRESHOLDS: Record<string, { ok: number; warn: number; danger: number; direction: 'min' | 'max' }> = {
    kern: { ok: 75, warn: 60, danger: 50, direction: 'min' },
    bereiding: { ok: 75, warn: 60, danger: 50, direction: 'min' },
    regenereren: { ok: 75, warn: 60, danger: 50, direction: 'min' },
    koeling: { ok: 4, warn: 7, danger: 10, direction: 'max' },
    bewaring: { ok: 4, warn: 7, danger: 10, direction: 'max' },
    opslag: { ok: 4, warn: 7, danger: 10, direction: 'max' },
    ontvangst: { ok: 7, warn: 10, danger: 12, direction: 'max' },
    uitgifte: { ok: 65, warn: 55, danger: 45, direction: 'min' },
};

function computeStatus(checkType: string, temp: number): 'ok' | 'warn' | 'danger' | 'afwijking' {
    const t = PRESET_THRESHOLDS[checkType.toLowerCase()];
    if (!t) return 'ok';
    if (t.direction === 'min') {
        if (temp >= t.ok) return 'ok';
        if (temp >= t.warn) return 'warn';
        if (temp >= t.danger) return 'danger';
        return 'afwijking';
    }
    if (temp <= t.ok) return 'ok';
    if (temp <= t.warn) return 'warn';
    if (temp <= t.danger) return 'danger';
    return 'afwijking';
}
