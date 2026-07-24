/**
 * POST /api/extension/v2/runs — start of hervat een sync-run (briefing §13.1).
 *
 * Body: { supplierId, mode, origin, adapterKey, adapterVersion, supplierAccountKey, scope }
 * Een tweede start voor dezelfde supplier+account met een nog lopende/gepauzeerde
 * run retourneert die bestaande run (resumed:true) — nooit stil superseden.
 */

import { NextRequest } from 'next/server';
import { authenticate, verifySupplier, readLimitedJson, apiError, apiOk, optionsResponse } from '../_lib/guard';

export const runtime = 'nodejs';

export function OPTIONS() {
    return optionsResponse();
}

/** v2-scope-mode → bestaande leverancier_sync_runs.mode CHECK-waarde. */
function dbMode(mode: string): 'full' | 'incremental' | 'single-page' {
    if (mode === 'single' || mode === 'single-page') return 'single-page';
    if (mode === 'full') return 'full';
    return 'incremental'; // linked_products / favorites / incremental
}

export async function POST(req: NextRequest) {
    const gate = await authenticate(req);
    if (gate instanceof Response) return gate;
    const { auth, sb } = gate;

    const body = (await readLimitedJson(req)) as Record<string, unknown> | null;
    if (!body) return apiError('INVALID_OBSERVATION', 'Ongeldige of te grote body.', 400);

    const supplierId = Number(body.supplierId);
    const mode = typeof body.mode === 'string' ? body.mode : 'full';
    const adapterKey = typeof body.adapterKey === 'string' ? body.adapterKey : null;
    const adapterVersion = typeof body.adapterVersion === 'string' ? body.adapterVersion : null;
    const supplierAccountKey = typeof body.supplierAccountKey === 'string' ? body.supplierAccountKey : '';
    const origin = typeof body.origin === 'string' ? body.origin : null;
    const scopeBody = (body.scope && typeof body.scope === 'object') ? (body.scope as Record<string, unknown>) : {};

    const lev = await verifySupplier(sb, auth.organizationId, supplierId);
    if (!lev) return apiError('WRONG_ORIGIN', 'Leverancier niet gevonden voor deze organisatie.', 404);
    if (!adapterKey || !adapterVersion) return apiError('ADAPTER_PARSE_FAILED', 'adapterKey en adapterVersion verplicht.', 400);

    /* Bestaande resumable run voor deze supplier+account? → hervat, niet superseden. */
    const { data: existing } = await sb
        .from('leverancier_sync_runs')
        .select('id, status, supplier_account_key')
        .eq('organization_id', auth.organizationId)
        .eq('leverancier_id', supplierId)
        .in('status', ['running', 'paused_needs_login', 'paused_rate_limited'])
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();

    if (existing && (existing.supplier_account_key ?? '') === supplierAccountKey) {
        await sb.from('leverancier_sync_runs').update({ heartbeat_at: new Date().toISOString() }).eq('id', existing.id);
        return apiOk({ runId: existing.id, status: existing.status, resumed: true, nextPollAfterMs: 1000 });
    }
    if (existing) {
        return apiError('RUN_NOT_RESUMABLE',
            'Er loopt al een run voor een ander account bij deze leverancier. Annuleer die eerst.', 409);
    }

    const scope = { mode, origin, ...scopeBody };
    const now = new Date().toISOString();
    const { data: run, error } = await sb
        .from('leverancier_sync_runs')
        .insert({
            organization_id: auth.organizationId,
            leverancier_id: supplierId,
            started_by_user_id: auth.userId,
            extension_key_id: auth.keyId,
            status: 'running',
            mode: dbMode(mode),
            adapter_key: adapterKey,
            adapter_version: adapterVersion,
            supplier_account_key: supplierAccountKey,
            scope,
            heartbeat_at: now,
            last_checkpoint_at: null,
            metadata: origin ? { origin } : {},
        })
        .select('id')
        .single();

    if (error || !run) return apiError('RUN_NOT_RESUMABLE', error?.message ?? 'Kon run niet starten.', 500);

    await sb.from('leveranciers').update({ last_sync_status: 'running' }).eq('id', supplierId);

    return apiOk({ runId: run.id, status: 'running', resumed: false, nextPollAfterMs: 1000 }, 201);
}
