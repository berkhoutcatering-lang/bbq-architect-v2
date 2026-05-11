/* POST /api/prep/device-verify — PIN-check voor write-actie in display-mode.
 *
 * Flow: chef tikt PIN in op tablet → request hier → server-side scrypt-verify
 * → bij success: 200 + ok. Bij 5 fails in 10min: account-locked 5min + audit.
 *
 * Hard rules:
 *  - scrypt voor hashing (laag-entropy PIN; SHA-256 zou onveilig zijn)
 *  - Constant-time compare via crypto.timingSafeEqual
 *  - Lockout in DB-veld personeel.kds_pin_lockout_until
 *  - Audit alle pogingen (success + fail) naar kds_audit_logs
 */

import { NextRequest, NextResponse } from 'next/server';
import { withTenantAuth, type TenantAuthCtx } from '@/lib/withTenantAuth';
import { validateDeviceVerify } from '@/lib/prep/validators';
import {
    verifyPin,
    isLockedNow,
    PIN_MAX_ATTEMPTS,
    PIN_LOCKOUT_MINUTES,
    PIN_LOCKOUT_LOOKBACK_MINUTES,
} from '@/lib/prep/deviceAuth';
import { appendKdsAudit } from '@/lib/prep/auditLog';

export const runtime = 'nodejs';

export const POST = withTenantAuth(async (req: NextRequest, { supabase, orgId }: TenantAuthCtx) => {
    let body: unknown;
    try {
        body = await req.json();
    } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
    }

    const v = validateDeviceVerify(body);
    if (!v.ok) return NextResponse.json({ error: (v as { ok: false; error: string }).error }, { status: 400 });
    const { pin, personeelId } = v.data;

    // 1. Load personeel record
    const { data: person, error: pErr } = await supabase
        .from('personeel')
        .select('id, organization_id, naam, actief, kds_pin_hash, kds_pin_lockout_until')
        .eq('id', personeelId)
        .maybeSingle();

    if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
    // Generieke 401 om enumeration te voorkomen (zelfde melding bij niet-bestaand én verkeerd)
    if (!person || person.organization_id !== orgId) {
        return NextResponse.json({ error: 'Verificatie mislukt' }, { status: 401 });
    }
    if (!person.actief) {
        return NextResponse.json({ error: 'Gebruiker is gedeactiveerd' }, { status: 403 });
    }
    if (!person.kds_pin_hash) {
        return NextResponse.json(
            { error: 'Geen PIN ingesteld — vraag een admin om er één te zetten' },
            { status: 412 },
        );
    }

    // 2. Check lockout
    if (isLockedNow(person.kds_pin_lockout_until)) {
        return NextResponse.json(
            {
                error: 'Account tijdelijk vergrendeld na te veel pogingen',
                lockedUntil: person.kds_pin_lockout_until,
            },
            { status: 429 },
        );
    }

    // 3. Verify PIN
    const ok = await verifyPin(pin, person.kds_pin_hash);
    if (ok) {
        await appendKdsAudit(supabase, {
            orgId,
            action: 'pin_failed', // (re-use action for any pin-attempt; success below overwrites)
            personeelId: person.id,
            metadata: { result: 'success' },
        });
        return NextResponse.json({ ok: true, personeel: { id: person.id, naam: person.naam } });
    }

    // 4. Fail — log + check recent failures voor lockout
    await appendKdsAudit(supabase, {
        orgId,
        action: 'pin_failed',
        personeelId: person.id,
        metadata: { result: 'fail' },
    });

    // Tel recent failures in lookback-window
    const since = new Date(Date.now() - PIN_LOCKOUT_LOOKBACK_MINUTES * 60_000).toISOString();
    const { count } = await supabase
        .from('kds_audit_logs')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', orgId)
        .eq('personeel_id', person.id)
        .eq('action', 'pin_failed')
        .gte('at_time', since);

    const failCount = count ?? 0;
    if (failCount >= PIN_MAX_ATTEMPTS) {
        const lockUntil = new Date(Date.now() + PIN_LOCKOUT_MINUTES * 60_000).toISOString();
        await supabase
            .from('personeel')
            .update({ kds_pin_lockout_until: lockUntil })
            .eq('id', person.id);
        await appendKdsAudit(supabase, {
            orgId,
            action: 'pin_locked',
            personeelId: person.id,
            metadata: { lockedUntil: lockUntil, fail_count: failCount },
        });
        return NextResponse.json(
            { error: `Te veel mislukte pogingen. ${PIN_LOCKOUT_MINUTES} min vergrendeld.`, lockedUntil: lockUntil },
            { status: 429 },
        );
    }

    return NextResponse.json(
        { error: 'PIN onjuist', attemptsLeft: Math.max(0, PIN_MAX_ATTEMPTS - failCount) },
        { status: 401 },
    );
});
