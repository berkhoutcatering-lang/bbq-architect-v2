/**
 * Gedeelde guard voor alle Extension API v2-routes (briefing §13).
 *
 * Elke route:
 *   • authenticeert met x-extension-key (verifyExtensionKey);
 *   • resolvet organization/user/keyId;
 *   • verifieert supplierownership met expliciete organizationfilter;
 *   • gebruikt service-role alleen server-side;
 *   • logt nooit de key of suppliercookies;
 *   • accepteert een begrensde body;
 *   • retourneert machineleesbare foutcodes naast Nederlandse UI-tekst.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyExtensionKey, type ExtensionAuthContext } from '@/lib/extensionAuth';
import { createServiceSupabase } from '@/lib/supabase-server';
import type { SupabaseClient } from '@supabase/supabase-js';

export const V2_MAX_BODY_BYTES = 1_048_576; // 1 MB harde bodylimiet

export function corsHeaders(): HeadersInit {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'content-type, x-extension-key, idempotency-key',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    };
}

export function optionsResponse() {
    return new NextResponse(null, { status: 204, headers: corsHeaders() });
}

/** Uniforme, machineleesbare fout. `code` is de stabiele sleutel, `error` de NL-tekst. */
export function apiError(code: string, error: string, status: number) {
    return NextResponse.json({ ok: false, code, error }, { status, headers: corsHeaders() });
}

export function apiOk(body: Record<string, unknown>, status = 200) {
    return NextResponse.json({ ok: true, ...body }, { status, headers: corsHeaders() });
}

export interface V2Context {
    auth: ExtensionAuthContext;
    sb: SupabaseClient;
}

/** Auth + service-client. Retourneert een 401-response bij ongeldige key. */
export async function authenticate(req: NextRequest): Promise<V2Context | NextResponse> {
    const auth = await verifyExtensionKey(req.headers.get('x-extension-key'));
    if (!auth) return apiError('LOGIN_REQUIRED', 'Ongeldige of ingetrokken extension-key.', 401);
    if (!rateLimit(auth.keyId)) return apiError('SUPPLIER_RATE_LIMITED', 'Te veel verzoeken; probeer straks opnieuw.', 429);
    return { auth, sb: createServiceSupabase() };
}

/** Lees JSON met harde bodylimiet (voorkomt geheugendruk). */
export async function readLimitedJson(req: NextRequest, maxBytes = V2_MAX_BODY_BYTES): Promise<unknown | null> {
    const raw = await req.text().catch(() => '');
    if (raw.length > maxBytes) return null;
    try {
        return raw ? JSON.parse(raw) : {};
    } catch {
        return null;
    }
}

/** Verifieer dat de supplier bij deze org hoort. */
export async function verifySupplier(sb: SupabaseClient, orgId: string, supplierId: number) {
    if (!Number.isInteger(supplierId) || supplierId <= 0) return null;
    const { data } = await sb
        .from('leveranciers')
        .select('id, naam, organization_id, portal_hint, scope_filter, scope_keywords')
        .eq('id', supplierId)
        .eq('organization_id', orgId)
        .maybeSingle();
    return data ?? null;
}

/** Verifieer dat de run bij deze org hoort. */
export async function resolveRun(sb: SupabaseClient, orgId: string, runId: string) {
    if (!runId || !/^[0-9a-f-]{36}$/i.test(runId)) return null;
    const { data } = await sb
        .from('leverancier_sync_runs')
        .select('*')
        .eq('id', runId)
        .eq('organization_id', orgId)
        .maybeSingle();
    return data ?? null;
}

/* ── Rate limiting per extension-key (best-effort, in-memory) ────────────────
 * Serverless-instances delen dit niet; het is een eerste dam tegen runaway
 * clients, geen harde quota. Een durable variant zou een DB-teller gebruiken. */
const RL_WINDOW_MS = 60_000;
const RL_MAX = 1200; // per key per minuut (checkpoints kunnen frequent zijn)
const rlBuckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(keyId: string): boolean {
    const now = Date.now();
    const b = rlBuckets.get(keyId);
    if (!b || now > b.resetAt) {
        rlBuckets.set(keyId, { count: 1, resetAt: now + RL_WINDOW_MS });
        return true;
    }
    if (b.count >= RL_MAX) return false;
    b.count += 1;
    return true;
}
