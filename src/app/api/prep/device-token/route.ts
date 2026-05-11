/* POST /api/prep/device-token — admin-only: maak nieuwe tablet/monitor session.
 *
 * Returnt het plaintext-token EENMALIG. Daarna alleen via hash in DB.
 * Het token wordt in een HTTP-only cookie op de tablet gezet (door client).
 *
 * Hard rules:
 *  - Admin-only role-check (Admin/Pitmaster mogen device-sessions aanmaken)
 *  - Token-hash in DB (SHA-256, geen plaintext storage)
 *  - Audit naar kds_audit_logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateDeviceToken } from '@/lib/prep/validators';
import { generateDeviceToken } from '@/lib/prep/deviceAuth';
import { appendKdsAudit } from '@/lib/prep/auditLog';

export const runtime = 'nodejs';

const ALLOWED_ROLES = new Set(['Admin', 'Pitmaster']);

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId, userId }: TenantAuthCtx) => {
    // 1. Role-check — alleen Admin/Pitmaster
    const { data: member } = await supabase
        .from('organization_members')
        .select('role')
        .eq('organization_id', orgId)
        .eq('user_id', userId)
        .eq('status', 'active')
        .maybeSingle();

    if (!member || !ALLOWED_ROLES.has(member.role)) {
        return NextResponse.json(
            { error: 'Alleen Admin of Pitmaster mag apparaten registreren' },
            { status: 403 },
        );
    }

    // 2. Validate body
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }
    const v = validateDeviceToken(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { deviceName, stationId, scope } = v.data;

    // 3. Validate stationId (als gezet, moet bij deze org horen)
    if (stationId !== null) {
        const { data: station } = await supabase
            .from('kitchen_stations')
            .select('id, organization_id')
            .eq('id', stationId)
            .maybeSingle();
        if (!station || station.organization_id !== orgId) {
            return NextResponse.json(
                { error: 'Station bestaat niet of hoort niet bij deze org' },
                { status: 422 },
            );
        }
    }

    // 4. Gen token + insert
    const { rawToken, tokenHash, tokenPrefix } = generateDeviceToken();

    const { data: inserted, error: insErr } = await supabase
        .from('kds_device_sessions')
        .insert({
            organization_id: orgId,
            device_name: deviceName,
            station_id: stationId,
            token_hash: tokenHash,
            scope,
            pin_required: scope === 'write',  // write-mode altijd PIN-protected
            created_by: userId,
        })
        .select('id, device_name, scope, station_id, created_at')
        .maybeSingle();

    if (insErr) {
        // UNIQUE constraint op (org, device_name) — geef vriendelijke fout
        if (insErr.code === '23505') {
            return NextResponse.json(
                { error: 'Apparaat met deze naam bestaat al' },
                { status: 409 },
            );
        }
        return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    if (!inserted) return NextResponse.json({ error: 'Insert mislukt' }, { status: 500 });

    // 5. Audit
    await appendKdsAudit(supabase, {
        orgId,
        action: 'device_token_created',
        deviceSessionId: inserted.id,
        metadata: { device_name: deviceName, scope, station_id: stationId, prefix: tokenPrefix },
    });

    // 6. Return — plaintext token EENMALIG
    return NextResponse.json({
        ok: true,
        device: inserted,
        token: rawToken,
        warning: 'Bewaar dit token nu — het wordt niet meer getoond.',
    });
});
